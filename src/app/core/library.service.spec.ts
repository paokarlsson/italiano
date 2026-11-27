import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LettureData, UserText } from '../models/leggi.models';
import { decodePack, encodePack } from './audio-pack';
import { AudioStore } from './audio-store';
import { DriveError, DriveFile, DriveService } from './drive.service';
import { LeggiService } from './leggi.service';
import { LibraryService } from './library.service';
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
        { provide: VoiceService, useValue: { tag: signal('mia/m') } },
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
        voice: 'utvecklaren/m',
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
    expect(await store.get('ciao')).toEqual(new Uint8Array([1]));
    // Det hämtade räknas som publicerat — det ska inte laddas upp igen.
    expect(store.pending('utvecklaren/m')).toBe(0);
    // Texten ligger bland de egna som delad, och står i lagret för läsning.
    expect(leggi.text('ai-1')).toMatchObject({ source: 'shared' });
    expect(leggi.stock().map((t) => t.id)).toEqual(['ai-1']);
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
    await store.put('mia/m', [{ text: 'amico', bytes: new Uint8Array([5]) }], false);
    await store.put('utvecklaren/m', [{ text: 'ciao', bytes: new Uint8Array([1]) }], true);
    leggi.addUserText(own('ai-1', 1));
    leggi.addUserText(own('ai-2', 2));
    leggi.addUserText({ ...own('paste-1', 3), source: 'paste' });
    leggi.complete('ai-1', new Set());
    leggi.complete('paste-1', new Set());
    expect(library.pendingClips()).toBe(1);
    // Bara den lästa texten från Claude — inte den olästa, inte den inklistrade.
    expect(library.pendingTexts().map((t) => t.id)).toEqual(['ai-1']);

    expect(await library.publish()).toBe(1);
    const pack = decodePack(drive.files.get('id-pack-0004.itpk')!.bytes);
    expect(pack.voice).toBe('mia/m');
    expect(pack.clips).toEqual([{ text: 'amico', bytes: new Uint8Array([5]) }]);
    expect(pack.texts.map((t) => t.id)).toEqual(['ai-1']);

    // Inget kvar att publicera, och det egna paketet räknas som redan hämtat.
    expect(library.pendingClips()).toBe(0);
    expect(library.pendingTexts()).toEqual([]);
    expect(library.fresh().map((p) => p.name)).toEqual(['pack-0003.itpk']);
    expect(await library.publish()).toBe(0);
    expect(drive.files.size).toBe(2);
  });
});
