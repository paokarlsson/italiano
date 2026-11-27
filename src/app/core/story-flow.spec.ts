import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LettureData, StoryChapter, StoryData, StoryPage, UserText } from '../models/leggi.models';
import { AiService } from './ai.service';
import { adaptMaxWords, adaptProblems, adaptPrompt } from './ai-story';
import { DataService } from './data.service';
import { LeggiService } from './leggi.service';
import { StoryStore } from './story-store';
import { SupplyService } from './supply.service';

const sentences = (n: number, it = 'Alba è qui.') =>
  Array.from({ length: n }, () => ({ it, sv: 'Alba är här.' }));
const question = { sv: '?', options: ['a', 'b', 'c'], answer: 0 };

const page = (chapter: number, part: number, extra: Partial<StoryPage> = {}): StoryPage => ({
  id: `alba-luca-${String(chapter).padStart(2, '0')}-${part}`,
  chapter,
  part,
  title: `p${chapter}.${part}`,
  sv: 'sida',
  nota: 'nota',
  level: 1,
  narrator: 'f',
  scene: 'Alba är här.',
  sentences: sentences(6),
  question,
  ...extra,
});

const story: StoryData = {
  id: 'alba-luca',
  title: 'Alba & Luca',
  sv: 'En kärlekshistoria.',
  canon: ['data/storie/alba-luca/varld.md'],
  names: ['alba'],
  lexicon: { qui: { p: 'D1', sv: 'här' } },
  chapters: [
    { n: 0, title: 'Prologo', sv: 'Prolog', pages: [page(0, 1)], songs: [] },
    {
      n: 1,
      title: 'Prima di te',
      sv: 'Före dig',
      pages: [page(1, 1, { level: 3 }), page(1, 2, { level: 3, locked: ['Sto bene'] })],
      songs: [
        {
          id: 'alba-luca-01-canzone',
          chapter: 1,
          part: 3,
          title: 'Prima di te',
          sv: 'Före dig',
          nota: '',
          lines: [{ it: 'Prima di te', sv: 'Före dig' }],
        },
      ],
    },
    { n: 2, title: 'Qualcosa', sv: 'Något', pages: [page(2, 1, { level: 4 })], songs: [] },
  ],
};

const base: LettureData = {
  names: [],
  lexicon: { è: { p: 'D1', sv: 'är' }, ciao: { p: 'D4', sv: 'hej' } },
  texts: [
    {
      id: 'uno',
      title: 'uno',
      sv: '',
      nota: '',
      level: 1,
      sentences: [{ it: 'Ciao.', sv: '' }],
      question,
    },
  ],
};

const adapted = (id: string, it = 'Alba è qui adesso.'): UserText => ({
  ...page(1, 2),
  id,
  sentences: sentences(6, it),
  source: 'ai',
  createdAt: 1,
  level: 2,
  lexicon: { è: { p: 'D1', sv: 'är' }, qui: { p: 'D1', sv: 'här' }, adesso: { p: 'D1', sv: 'nu' } },
});

describe('följetongen i läsningen', () => {
  let leggi: LeggiService;
  let store: StoryStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    leggi = TestBed.inject(LeggiService);
    store = TestBed.inject(StoryStore);
    leggi.hydrate(base);
    store.hydrate([story]);
  });

  it('kommer efter grundkursen, med låten på sin plats', () => {
    expect(leggi.step()).toMatchObject({ kind: 'text', text: { id: 'uno' } });
    leggi.complete('uno', new Set());
    expect(leggi.next()?.id).toBe('alba-luca-00-1');
    leggi.complete('alba-luca-00-1', new Set());
    leggi.complete('alba-luca-01-1', new Set());
    leggi.complete('alba-luca-01-2', new Set());
    expect(leggi.step()).toMatchObject({ kind: 'song', song: { id: 'alba-luca-01-canzone' } });
    // Utan låtar går nästa text vidare till nästa sida.
    expect(leggi.next()?.id).toBe('alba-luca-02-1');

    leggi.markHeard('alba-luca-01-canzone');
    expect(leggi.storyRead()).toBe(4);
    expect(leggi.step()).toMatchObject({ kind: 'text', text: { id: 'alba-luca-02-1' } });
  });

  it('varvar en kort följetong med grundkursen, efter texterna på samma nivå', () => {
    const short = (id: string, level: number): StoryPage => ({
      ...page(1, 1, { level }),
      id,
    });
    const course: StoryData = {
      ...story,
      id: 'kort',
      title: 'Kort',
      course: true,
      chapters: [
        {
          n: 1,
          title: 'Uno',
          sv: '',
          pages: [short('kort-1', 1), short('kort-2', 2)],
          songs: [],
        },
      ],
    };
    const text = (id: string, level: number) => ({ ...base.texts[0], id, title: id, level });
    leggi.hydrate({
      ...base,
      texts: [text('uno', 1), text('due', 2), text('tre', 3)],
    });
    store.hydrate([course, story]);
    expect(leggi.path().map((i) => i.id)).toEqual([
      'uno',
      'kort-1',
      'due',
      'kort-2',
      'tre',
      ...store.itemsOf(story).map((i) => i.id),
    ]);

    expect(leggi.next()?.id).toBe('uno');
    leggi.complete('uno', new Set());
    expect(leggi.next()?.id).toBe('kort-1');
    expect(leggi.storyNext()?.id).toBe('kort-1');
    // Nästa sida i följetongen hör till samma följetong — inte till läsordningen.
    expect(store.after('kort-1')?.id).toBe('kort-2');
    expect(store.after('kort-2')).toBeNull();
    leggi.complete('kort-1', new Set());
    expect(leggi.next()?.id).toBe('due');
  });

  it('läser en sida med appens ordlista och berättelsens ovanpå', () => {
    const keys = leggi.tokens('alba-luca-00-1')[0].map((t) => t.key);
    expect(keys).toEqual([null, 'è', 'qui']);
  });

  it('visar den omskrivna sidan när det finns en, med sin egen ordlista', () => {
    store.setAdapted('alba-luca-01-2', adapted('ai-x'));
    const text = leggi.text('alba-luca-01-2');
    expect(text?.id).toBe('alba-luca-01-2');
    expect(leggi.tokens('alba-luca-01-2')[0].map((t) => t.key)).toEqual([
      null,
      'è',
      'qui',
      'adesso',
    ]);
  });

  it('bokför texten som den lästes, även om den skrivits om sedan', () => {
    const before = leggi.tokens('alba-luca-01-2');
    store.setAdapted('alba-luca-01-2', adapted('ai-x'));
    const summary = leggi.complete('alba-luca-01-2', new Set(['qui']), before);
    expect(summary.words).toBe(12);
  });
});

describe('omskrivningen av en sida', () => {
  const p = page(3, 3, {
    level: 4,
    locked: ['Non bevo caffè dopo le sei.'],
    scene: 'Kaffe efter sex.',
  });
  const chapter: StoryChapter = {
    n: 3,
    title: 'Le prime parole',
    sv: '',
    pages: [p, p, p, p],
    songs: [],
  };

  it('håller grammatiken på sidans nivå och språket på läsarens', () => {
    const easier = adaptPrompt({ page: p, chapter, reader: 2, weave: [] });
    expect(easier).toMatch(/Sidan ligger på nivå 4/);
    expect(easier).toMatch(/Läsaren ligger på nivå 2 .*Skriv enklare/);
    expect(easier).toMatch(/imperfetto/i);
    expect(easier).toContain('«Non bevo caffè dopo le sei.»');

    const harder = adaptPrompt({
      page: p,
      chapter,
      reader: 6,
      weave: [{ form: 'già', sv: 'redan' }],
    });
    expect(harder).toMatch(/klarar mer .* bara med grammatik till och med nivå 4/);
    expect(harder).toContain('- già (redan)');
  });

  it('ger en låst replik plats även när läsaren ligger lågt', () => {
    const long = page(14, 2, {
      level: 6,
      locked: ['Potrei dire che ti amo, ma stasera è meglio così.'],
    });
    expect(adaptMaxWords(long, 1)).toBe(10);
  });

  it('godtar inte en sida som tappar en replik eller går över nivån', () => {
    const text = (it: string): UserText => ({ ...adapted('x', it), question });
    expect(adaptProblems(text('Bevo il tè.'), p, 4).join()).toMatch(/låsta repliken saknas/);
    const future = text('Non bevo caffè dopo le sei. Domani berrò il tè.');
    expect(adaptProblems(future, p, 4).join()).toMatch(/futurum/);
    expect(adaptProblems(text('Non bevo caffè dopo le sei.'), p, 4)).toEqual([]);
    expect(adaptProblems(text('Ti amo. Non bevo caffè dopo le sei.'), p, 4).join()).toMatch(
      /ti amo/,
    );
  });
});

describe('påfyllningen och följetongen', () => {
  let leggi: LeggiService;
  let store: StoryStore;
  let ai: FakeAi;
  let supply: SupplyService;

  class FakeAi {
    readonly hasKey = signal(true);
    readonly auto = signal(true);
    readonly status = signal('');
    readonly busy = signal(false);
    writes = 0;
    adapted: string[] = [];
    async write(): Promise<unknown> {
      this.writes++;
      return {};
    }
    async adapt(id: string): Promise<unknown> {
      this.busy.set(true);
      await Promise.resolve();
      this.busy.set(false);
      this.adapted.push(id);
      store.setAdapted(id, adapted('ai-' + id));
      return {};
    }
    async extend(): Promise<unknown> {
      return { added: 0, cost: 0 };
    }
  }

  const settle = async () => {
    for (let i = 0; i < 40; i++) {
      TestBed.tick();
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AiService, useFactory: () => new FakeAi() }],
    });
    leggi = TestBed.inject(LeggiService);
    store = TestBed.inject(StoryStore);
    leggi.hydrate(base);
    store.hydrate([story]);
    TestBed.inject(DataService).hydrate([]);
    ai = TestBed.inject(AiService) as unknown as FakeAi;
    supply = TestBed.inject(SupplyService);
  });

  it('skriver om nästa sida när läsaren är på väg dit, och inga fria texter under tiden', async () => {
    supply.start();
    await settle();
    // Grundkursen är inte läst och följetongen inte påbörjad.
    expect(ai.adapted).toEqual([]);
    expect(ai.writes).toBe(0);

    leggi.complete('uno', new Set());
    await settle();
    expect(ai.adapted).toEqual(['alba-luca-00-1']);

    // En sida som läses just nu skrivs inte om.
    store.reading.set('alba-luca-01-1');
    leggi.complete('alba-luca-00-1', new Set());
    await settle();
    expect(ai.adapted).toEqual(['alba-luca-00-1']);
    store.reading.set(null);
    await settle();
    expect(ai.adapted).toEqual(['alba-luca-00-1', 'alba-luca-01-1']);
    expect(ai.writes).toBe(0);
  });

  it('hoppar över låten till nästa kapitels första sida, och lämnar en misslyckad sida', async () => {
    leggi.complete('uno', new Set());
    leggi.complete('alba-luca-00-1', new Set());
    leggi.complete('alba-luca-01-1', new Set());
    store.markFailed('alba-luca-01-2');
    leggi.complete('alba-luca-01-2', new Set());
    supply.start();
    await settle();
    expect(ai.adapted).toEqual(['alba-luca-02-1']);
  });

  it('skriver aldrig om en följetong som läses varvat med grundkursen', async () => {
    store.hydrate([{ ...story, course: true }]);
    leggi.complete('uno', new Set());
    leggi.complete('alba-luca-00-1', new Set());
    supply.start();
    await settle();
    expect(ai.adapted).toEqual([]);
  });

  it('fyller på med fria texter först när följetongen är läst', async () => {
    for (const id of [
      'uno',
      'alba-luca-00-1',
      'alba-luca-01-1',
      'alba-luca-01-2',
      'alba-luca-02-1',
    ]) {
      leggi.complete(id, new Set());
    }
    leggi.markHeard('alba-luca-01-canzone');
    supply.start();
    await settle();
    expect(ai.writes).toBeGreaterThan(0);
  });
});
