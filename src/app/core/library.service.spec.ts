import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LettureData, StoryData, UserText } from '../models/leggi.models';
import { decodePack, encodePack } from './audio-pack';
import { AudioStore } from './audio-store';
import { CoverStore } from './cover-store';
import { DriveError, DriveFile, DriveService } from './drive.service';
import { LeggiService } from './leggi.service';
import { LibraryService } from './library.service';
import { StoryStore } from './story-store';
import { VoiceService } from './voice.service';

const data: LettureData = {
  names: [],
  lexicon: { ciao: { p: 'D4', sv: 'hej' } },
  texts: [
    {
      id: 'uno',
      title: 'uno',
      sv: '',
      nota: '',
      level: 1,
      sentences: [{ it: 'Ciao.', sv: '' }],
      question: { sv: '?', options: ['a', 'b'], answer: 0 },
    },
  ],
};

const own = (id: string, createdAt: number): UserText => ({
  ...data.texts[0],
  id,
  title: id,
  source: 'ai',
  createdAt,
  lexicon: { ciao: { p: 'D4', sv: 'hej' } },
});

/** En mapp i minnet, i stället för Google Drive. */
class FakeDrive {
  readonly canRead = signal(true);
  files = new Map<string, { name: string; bytes: Uint8Array }>();
  failDownload = '';

  async list(): Promise<DriveFile[]> {
    return [...this.files]
      .map(([id, f]) => ({ id, name: f.name, size: f.bytes.byteLength }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async download(id: string): Promise<Uint8Array> {
    if (id === this.failDownload) throw new DriveError('Mappen finns inte.');
    return this.files.get(id)!.bytes;
  }

  async upload(name: string, bytes: Uint8Array): Promise<DriveFile> {
    const id = `id-${name}`;
    this.files.set(id, { name, bytes });
    return { id, name, size: bytes.byteLength };
  }
}

describe('LibraryService', () => {
  let library: LibraryService;
  let drive: FakeDrive;
  let store: AudioStore;
  let leggi: LeggiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DriveService, useClass: FakeDrive },
        { provide: VoiceService, useValue: { tag: (v: string) => `${v}:mia/m` } },
      ],
    });
    leggi = TestBed.inject(LeggiService);
    leggi.hydrate(data);
    store = TestBed.inject(AudioStore);
    drive = TestBed.inject(DriveService) as unknown as FakeDrive;
    library = TestBed.inject(LibraryService);
  });

  const shelve = (name: string, clips: [string, number][], texts: UserText[] = []) =>
    drive.files.set(`id-${name}`, {
      name,
      bytes: encodePack({
        voice: 'f:utvecklaren/m',
        clips: clips.map(([text, n]) => ({ text, bytes: new Uint8Array([n]) })),
        texts,
      }),
    });

  it('ser vad som finns att hämta, och hämtar det med ett tryck', async () => {
    shelve('pack-0001.itpk', [['ciao', 1]], [own('ai-1', 1)]);
    shelve('pack-0002.itpk', [['Ciao.', 2]]);
    drive.files.set('id-annat', { name: 'anteckningar.txt', bytes: new Uint8Array(3) });

    await library.check();
    expect(library.fresh().map((p) => p.name)).toEqual(['pack-0001.itpk', 'pack-0002.itpk']);
    expect(library.freshBytes()).toBeGreaterThan(0);

    await library.download();
    expect(library.fresh()).toEqual([]);
    expect(store.count()).toBe(2);
    expect(await store.get('ciao', 'f')).toEqual(new Uint8Array([1]));
    // Det hämtade räknas som publicerat — det ska inte laddas upp igen.
    expect(store.pending('f:utvecklaren/m')).toBe(0);
    // Texten ligger bland de egna som delad, och står i lagret för läsning.
    expect(leggi.text('ai-1')).toMatchObject({ source: 'shared' });
    expect(leggi.stock().map((t) => t.id)).toEqual(['ai-1']);
  });

  it('hämtar det som är nytt av sig själv', async () => {
    shelve('pack-0001.itpk', [['ciao', 1]]);
    await library.sync();
    expect(library.fresh()).toEqual([]);
    expect(store.count()).toBe(1);

    // Inget nytt: inget hämtas igen.
    const download = vi.spyOn(drive, 'download');
    await library.sync();
    expect(download).not.toHaveBeenCalled();
  });

  it('väntar med att hämta när webbläsaren ber om att spara data', async () => {
    shelve('pack-0001.itpk', [['ciao', 1]]);
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    try {
      await library.sync();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(library.fresh().length).toBe(1);
    expect(store.count()).toBe(0);
  });

  it('hämtar bara det nya nästa gång', async () => {
    shelve('pack-0001.itpk', [['ciao', 1]]);
    await library.check();
    await library.download();

    shelve('pack-0002.itpk', [['Ciao.', 2]]);
    await library.check();
    expect(library.fresh().map((p) => p.name)).toEqual(['pack-0002.itpk']);
  });

  it('behåller det som hann hämtas när ett paket går fel', async () => {
    shelve('pack-0001.itpk', [['ciao', 1]]);
    shelve('pack-0002.itpk', [['Ciao.', 2]]);
    drive.failDownload = 'id-pack-0002.itpk';
    await library.check();
    await library.download();

    expect(library.error()).toBe('Mappen finns inte.');
    expect(store.count()).toBe(1);
    expect(library.fresh().map((p) => p.name)).toEqual(['pack-0002.itpk']);
    expect(library.working()).toBe('');
  });

  it('släpper inte in en trasig text eller en som redan finns', async () => {
    const mine = { ...own('ai-1', 1), title: 'min egen' };
    leggi.addUserText(mine);
    shelve(
      'pack-0001.itpk',
      [],
      [
        own('ai-1', 1),
        { ...own('ai-2', 2), sentences: [] },
        { id: 'ai-3' } as UserText,
        own('uno', 3),
      ],
    );
    await library.check();
    await library.download();
    expect(leggi.userTexts().map((t) => [t.id, t.title, t.source])).toEqual([
      ['ai-1', 'min egen', 'ai'],
    ]);
  });

  it('publicerar egna klipp och lästa texter som nästa paket i ordningen', async () => {
    shelve('pack-0003.itpk', [['ciao', 1]]);
    await store.put('f:mia/m', [{ text: 'amico', bytes: new Uint8Array([5]) }], false);
    await store.put('m:mia/m', [{ text: 'Ciao!', bytes: new Uint8Array([6]) }], false);
    await store.put('f:utvecklaren/m', [{ text: 'ciao', bytes: new Uint8Array([1]) }], true);
    leggi.addUserText(own('ai-1', 1));
    leggi.addUserText(own('ai-2', 2));
    leggi.addUserText({ ...own('paste-1', 3), source: 'paste' });
    leggi.complete('ai-1', new Set());
    leggi.complete('paste-1', new Set());
    expect(library.pendingClips()).toBe(2);
    // Bara den lästa texten från Claude — inte den olästa, inte den inklistrade.
    expect(library.pendingTexts().map((t) => t.id)).toEqual(['ai-1']);

    // Ett paket per röst; texterna följer med det första.
    expect(await library.publish()).toBe(2);
    const women = decodePack(drive.files.get('id-pack-0004.itpk')!.bytes);
    expect(women.voice).toBe('f:mia/m');
    expect(women.clips).toEqual([{ text: 'amico', bytes: new Uint8Array([5]) }]);
    expect(women.texts.map((t) => t.id)).toEqual(['ai-1']);
    const men = decodePack(drive.files.get('id-pack-0005.itpk')!.bytes);
    expect(men.voice).toBe('m:mia/m');
    expect(men.clips).toEqual([{ text: 'Ciao!', bytes: new Uint8Array([6]) }]);
    expect(men.texts).toEqual([]);

    // Inget kvar att publicera, och det egna paketet räknas som redan hämtat.
    expect(library.pendingClips()).toBe(0);
    expect(library.pendingTexts()).toEqual([]);
    expect(library.fresh().map((p) => p.name)).toEqual(['pack-0003.itpk']);
    expect(await library.publish()).toBe(0);
    expect(drive.files.size).toBe(3);
  });

  it('publicerar egna omslag och hämtar andras, utan att skriva över ett eget', async () => {
    const covers = TestBed.inject(CoverStore);
    const png = (n: number) => ({ mime: 'image/png', bytes: new Uint8Array([n]) });
    await covers.put({ book: 'valigia-blu', ...png(1) }, false);
    expect(library.pendingCovers()).toBe(1);

    expect(await library.publish()).toBe(1);
    expect(library.pendingCovers()).toBe(0);
    const [file] = [...drive.files.values()];
    expect(decodePack(file.bytes).covers?.map((c) => c.book)).toEqual(['valigia-blu']);

    // Ett nyare omslag i mappen ersätter det publicerade — men inte ett eget som väntar.
    await covers.put({ book: 'alba-luca', ...png(5) }, false);
    drive.files.set('id-pack-0002.itpk', {
      name: 'pack-0002.itpk',
      bytes: encodePack({
        voice: '',
        clips: [],
        texts: [],
        covers: [
          { book: 'valigia-blu', ...png(2) },
          { book: 'alba-luca', ...png(3) },
        ],
      }),
    });
    await library.check();
    await library.download();
    expect(covers.unpublished().map((c) => [c.book, [...c.bytes]])).toEqual([['alba-luca', [5]]]);
    expect(covers.covers()['valigia-blu']).toMatchObject({ pub: true, bytes: 1 });
  });

  /** En egen bok med en sida skriven av `planned` planerade. */
  const book = (id: string, planned = 1, createdAt = 1): StoryData => {
    const plan = Array.from({ length: planned }, (_, i) => ({
      title: `p${i}`,
      sv: '',
      scene: 'Scen.',
      narrator: 'f' as const,
    }));
    const page = {
      ...data.texts[0],
      id: `${id}-01-1`,
      chapter: 1,
      part: 1,
      level: 1,
      narrator: 'f' as const,
      scene: 'Scen.',
      lexicon: { ciao: { p: 'D4' as const, sv: 'hej' } },
    };
    return {
      id,
      title: id,
      sv: '',
      names: [],
      lexicon: {},
      chapters: [{ n: 1, title: 'Uno', sv: '', pages: [page], songs: [] }],
      own: {
        topic: '',
        level: 1,
        createdAt,
        cast: '',
        plan: [{ n: 1, title: 'Uno', sv: '', pages: plan }],
      },
    };
  };

  it('publicerar en egen bok i taget, med sitt omslag, och hämtar andras', async () => {
    const stories = TestBed.inject(StoryStore);
    const covers = TestBed.inject(CoverStore);
    stories.saveBook(book('bok-klar'));
    stories.saveBook(book('bok-halv', 2));
    await covers.put({ book: 'bok-klar', mime: 'image/png', bytes: new Uint8Array([7]) }, false);
    await covers.put({ book: 'valigia-blu', mime: 'image/png', bytes: new Uint8Array([8]) }, false);
    // Bara den som är skriven klart kan publiceras, och dess omslag väntar på den.
    expect(library.pendingBooks().map((b) => b.id)).toEqual(['bok-klar']);
    expect(library.pendingCovers()).toBe(1);
    expect(await library.publishBook('bok-halv')).toBe(false);

    // Publicera allt tar inte med böckerna, och inte heller omslaget till en opublicerad bok.
    expect(await library.publish()).toBe(1);
    const first = decodePack(drive.files.get('id-pack-0001.itpk')!.bytes);
    expect(first.books).toBeUndefined();
    expect(first.covers?.map((c) => c.book)).toEqual(['valigia-blu']);
    expect(library.pendingBooks().map((b) => b.id)).toEqual(['bok-klar']);

    // Boken publiceras för sig, med omslaget i samma paket.
    expect(await library.publishBook('bok-klar')).toBe(true);
    const second = decodePack(drive.files.get('id-pack-0002.itpk')!.bytes);
    expect(second.books?.map((b) => b.id)).toEqual(['bok-klar']);
    expect(second.covers?.map((c) => c.book)).toEqual(['bok-klar']);
    expect(library.pendingBooks()).toEqual([]);
    expect(library.pendingCovers()).toBe(0);
    expect(library.isPublished('bok-klar')).toBe(true);
    expect(library.publishing()).toBeNull();

    // Någon annans bok i mappen: den hämtas, märkt som hämtad — en som redan finns rörs inte,
    // och inte heller en trasig eller en med samma id som en egen.
    drive.files.set('id-pack-0003.itpk', {
      name: 'pack-0003.itpk',
      bytes: encodePack({
        voice: '',
        clips: [],
        texts: [],
        books: [
          book('bok-annan', 1, 9),
          { ...book('bok-klar'), title: 'Ersatt' },
          { ...book('bok-trasig'), chapters: [] },
        ],
      }),
    });
    await library.check();
    await library.download();
    expect(stories.book('bok-annan')?.own?.shared).toBe(true);
    expect(stories.book('bok-klar')?.title).toBe('bok-klar');
    expect(stories.book('bok-trasig')).toBeUndefined();
    expect(stories.items().some((i) => i.id === 'bok-annan-01-1')).toBe(true);
    // En hämtad bok publiceras inte igen.
    expect(library.pendingBooks()).toEqual([]);
  });
});
