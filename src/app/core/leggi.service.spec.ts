import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LettureData, Lettura, UserText } from '../models/leggi.models';
import { LeggiService } from './leggi.service';

const text = (id: string, it: string, level = 2): Lettura => ({
  id,
  title: id,
  sv: id,
  nota: '',
  level,
  sentences: [{ it, sv: '' }],
  question: { sv: '?', options: ['a', 'b'], answer: 0 },
});

const data: LettureData = {
  names: ['maria'],
  lexicon: {
    è: { p: 'D1', sv: 'är' },
    grande: { p: 'D4', sv: 'stor' },
    casa: { p: 'D4', sv: 'hus' },
    la: { p: 'D1', sv: 'artikel' },
  },
  texts: [text('uno', 'Maria è grande.'), text('due', 'La casa è grande.')],
};

describe('LeggiService', () => {
  let leggi: LeggiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    leggi = TestBed.inject(LeggiService);
    leggi.hydrate(data);
  });

  afterEach(() => vi.restoreAllMocks());

  it('börjar med den första texten och går vidare i ordning', () => {
    expect(leggi.next()?.id).toBe('uno');
    leggi.complete('uno', new Set());
    expect(leggi.next()?.id).toBe('due');
  });

  it('räknar egen läsning på uppslagbara ord, inte på egennamn', () => {
    const summary = leggi.complete('uno', new Set(['grande']));
    expect(summary).toMatchObject({ words: 2, looked: 1, own: 50, lookedKeys: ['grande'] });
    expect(leggi.own()).toBe(50);
    expect(leggi.readCount()).toBe(1);
  });

  it('håller ett uppslaget ord öppet tills det läses utan hjälp', () => {
    leggi.complete('uno', new Set(['grande']));
    expect(leggi.openWords()).toEqual(['grande']);

    const summary = leggi.complete('due', new Set(['casa']));
    expect(summary.settledKeys).toEqual(['grande']);
    expect(leggi.openWords()).toEqual(['casa']);
  });

  it('föreslår texten med flest öppna ord när allt är läst', () => {
    leggi.complete('uno', new Set());
    leggi.complete('due', new Set(['casa', 'la']));
    expect(leggi.next()?.id).toBe('due');
  });

  it('stänger ett öppet ord som satt i en repetition', () => {
    leggi.complete('uno', new Set(['grande']));
    leggi.settle('grande');
    expect(leggi.openWords()).toEqual([]);
  });

  it('ger de öppna orden med meningen de stod i, mest uppslagna först', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    leggi.complete('due', new Set(['casa', 'grande']));
    now.mockReturnValue(2000);
    leggi.complete('uno', new Set(['grande']));
    const [first, second] = leggi.openWordDetails();
    expect(first).toMatchObject({ key: 'grande', looked: 2, entry: { sv: 'stor' } });
    // Meningen hämtas ur den senast lästa texten.
    expect(first.sentence.map((t) => t.text).join(' ')).toBe('Maria è grande');
    expect(second.key).toBe('casa');
  });

  it('låter första läsningen flytta nivån — upp, ned eller inte alls', () => {
    expect(leggi.level()).toBe(1);
    // Inga uppslag: för lätt, ett steg över textens nivå.
    expect(leggi.complete('uno', new Set()).levelShift).toBe(1);
    expect(leggi.level()).toBe(3);
    // En omläsning räknas inte.
    expect(leggi.complete('uno', new Set(['grande', 'è'])).levelShift).toBeNull();
    expect(leggi.level()).toBe(3);
    // Hälften uppslaget: för tungt, ett steg under.
    expect(leggi.complete('due', new Set(['casa', 'la'])).levelShift).toBe(-1);
    expect(leggi.level()).toBe(1);
  });

  it('läser en egen text med dess egen ordlista ovanpå den inbyggda', () => {
    const own: UserText = {
      ...text('ai-1', 'Il gatto è grande.', 4),
      source: 'ai',
      createdAt: 1,
      lexicon: { gatto: { p: 'D4', sv: 'katt' }, grande: { p: 'D4', sv: 'vuxen' } },
    };
    leggi.addUserText(own);

    expect(leggi.text('ai-1')?.title).toBe('ai-1');
    expect(leggi.number('ai-1')).toBe(0);
    const keys = leggi.tokens('ai-1')[0].map((t) => [t.key, t.entry?.sv]);
    expect(keys).toEqual([
      [null, undefined],
      ['gatto', 'katt'],
      ['è', 'är'],
      ['grande', 'vuxen'],
    ]);
    // Egna texter räknas inte in bland de inbyggda.
    expect(leggi.texts().length).toBe(2);
    expect(leggi.next()?.id).toBe('uno');

    leggi.complete('ai-1', new Set());
    leggi.removeUserText('ai-1');
    expect(leggi.text('ai-1')).toBeUndefined();
    expect(leggi.isRead('ai-1')).toBe(false);
  });

  it('glömmer allt vid nollställning', () => {
    leggi.complete('uno', new Set(['grande']));
    leggi.reset();
    expect(leggi.own()).toBeNull();
    expect(leggi.openWords()).toEqual([]);
    expect(leggi.next()?.id).toBe('uno');
  });
});
