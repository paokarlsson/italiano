import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LettureData, UserText } from '../models/leggi.models';
import { McQuestion, Pillar } from '../models/quiz.models';
import { AiService } from './ai.service';
import { AiError } from './ai-text';
import { DataService } from './data.service';
import { LeggiService } from './leggi.service';
import { StatsService } from './stats.service';
import { MAX_JOBS, STOCK_TARGET, SupplyService } from './supply.service';

const mc = (n: number): McQuestion => ({
  type: 'mc',
  tag: 'a',
  q: `q${n}`,
  options: ['a', 'b', 'c'],
  answer: 'a',
  explain: '',
  _k: `D1.1_${n}`,
  statKey: 'D1.1::a',
});

const pillars: Pillar[] = [
  {
    pillarId: 'D1',
    pillarTitle: 'Il collante',
    decks: [{ deckId: 'D1.1', title: 'De minsta', hint: '', pool: [mc(0), mc(1)] }],
  },
];

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

/** En AiService som bara räknar beställningar och lägger en text i lagret. */
class FakeAi {
  readonly hasKey = signal(true);
  readonly auto = signal(true);
  readonly status = signal('');
  readonly busy = signal(false);
  writes = 0;
  extended: string[] = [];
  fail: AiError | null = null;
  added = 3;

  constructor(
    private readonly leggi: LeggiService,
    private readonly decks: DataService,
    private readonly attempts: () => number,
  ) {}

  async write(): Promise<unknown> {
    this.busy.set(true);
    await Promise.resolve();
    this.busy.set(false);
    if (this.fail) throw this.fail;
    const n = ++this.writes;
    const text: UserText = {
      ...data.texts[0],
      id: `ai-${n}`,
      title: `ai-${n}`,
      source: 'ai',
      createdAt: n,
      lexicon: data.lexicon,
    };
    this.leggi.addUserText(text);
    return {};
  }

  async extend(deckId: string): Promise<{ added: number; cost: number }> {
    this.busy.set(true);
    await Promise.resolve();
    this.busy.set(false);
    this.extended.push(deckId);
    const n = this.decks.deck(deckId)!.pool.length;
    this.decks.addQuestions(
      deckId,
      Array.from({ length: this.added }, (_, i) => ({ ...mc(n + i), ai: true })),
      this.attempts(),
    );
    return { added: this.added, cost: 0 };
  }
}

describe('SupplyService', () => {
  let ai: FakeAi;
  let leggi: LeggiService;
  let stats: StatsService;
  let supply: SupplyService;

  /** Låter effekten och de väntande beställningarna gå klart. */
  const settle = async () => {
    for (let i = 0; i < 40; i++) {
      TestBed.tick();
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AiService,
          useFactory: () => {
            const stats = TestBed.inject(StatsService);
            return new FakeAi(
              TestBed.inject(LeggiService),
              TestBed.inject(DataService),
              () => stats.stats().tags['D1.1::a']?.attempts ?? 0,
            );
          },
        },
      ],
    });
    leggi = TestBed.inject(LeggiService);
    leggi.hydrate(data);
    TestBed.inject(DataService).hydrate(pillars);
    stats = TestBed.inject(StatsService);
    ai = TestBed.inject(AiService) as unknown as FakeAi;
    supply = TestBed.inject(SupplyService);
  });

  it('väntar tills allt är inläst, och fyller sedan lagret till två texter', async () => {
    await settle();
    expect(ai.writes).toBe(0);

    supply.start();
    expect(supply.textComing()).toBe(true);
    await settle();
    expect(ai.writes).toBe(STOCK_TARGET);
    expect(leggi.stock().map((t) => t.id)).toEqual(['ai-1', 'ai-2']);
    expect(supply.textComing()).toBe(false);
  });

  it('skriver en ny text när en ur lagret har lästs', async () => {
    supply.start();
    await settle();
    leggi.complete('ai-1', new Set());
    await settle();
    expect(ai.writes).toBe(3);
    expect(leggi.stock().map((t) => t.id)).toEqual(['ai-2', 'ai-3']);
    // Nästa text är den äldsta olästa i lagret, efter de inbyggda.
    leggi.complete('uno', new Set());
    expect(leggi.next()?.id).toBe('ai-2');
  });

  it('står still utan nyckel och när påfyllningen är avslagen', async () => {
    ai.auto.set(false);
    supply.start();
    await settle();
    expect(ai.writes).toBe(0);
    expect(supply.textComing()).toBe(false);

    ai.auto.set(true);
    ai.hasKey.set(false);
    await settle();
    expect(ai.writes).toBe(0);
  });

  it('stannar vid ett fel och försöker först när något har hänt', async () => {
    ai.fail = new AiError('rate-limit', 'För många anrop just nu.');
    supply.start();
    await settle();
    expect(supply.error()).toBe('För många anrop just nu.');
    expect(supply.textComing()).toBe(false);

    ai.fail = null;
    await settle();
    expect(ai.writes).toBe(0);

    // En läst text släpper igång den igen.
    leggi.complete('uno', new Set());
    await settle();
    expect(ai.writes).toBe(STOCK_TARGET);
    expect(supply.error()).toBe('');
  });

  it('bygger ut ett mazzo som är genomgånget utan att sitta — efter texterna', async () => {
    for (let i = 0; i < 4; i++) stats.recordAnswer('D1.1::a', i === 0);
    supply.start();
    await settle();
    expect(ai.writes).toBe(STOCK_TARGET);
    expect(ai.extended).toEqual(['D1.1']);
    expect(TestBed.inject(DataService).deck('D1.1')?.pool.length).toBe(5);

    // Nästa påbyggnad räknas från den förra: elva försök till räcker inte, tolv gör det.
    for (let i = 0; i < 11; i++) stats.recordAnswer('D1.1::a', false);
    await settle();
    expect(ai.extended).toEqual(['D1.1']);
    stats.recordAnswer('D1.1::a', false);
    await settle();
    expect(ai.extended).toEqual(['D1.1', 'D1.1']);
  });

  it('prövar inte samma mazzo igen när inget användbart kom tillbaka', async () => {
    ai.added = 0;
    for (let i = 0; i < 4; i++) stats.recordAnswer('D1.1::a', false);
    supply.start();
    await settle();
    expect(ai.extended).toEqual(['D1.1']);
  });

  it('vilar när taket för ett besök är nått', async () => {
    supply.start();
    await settle();
    for (let n = 1; n < MAX_JOBS; n++) {
      leggi.complete(`ai-${n}`, new Set());
      await settle();
    }
    expect(ai.writes).toBe(MAX_JOBS);
    expect(supply.error()).toContain('vilar');

    leggi.complete(`ai-${MAX_JOBS}`, new Set());
    await settle();
    expect(ai.writes).toBe(MAX_JOBS);

    // Lagret hann bli tomt medan påfyllningen vilade.
    supply.retry();
    await settle();
    expect(ai.writes).toBe(MAX_JOBS + STOCK_TARGET);
  });
});
