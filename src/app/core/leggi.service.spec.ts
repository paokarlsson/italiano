import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LettureData, Lettura } from '../models/leggi.models';
import { LeggiService } from './leggi.service';

const text = (id: string, it: string): Lettura => ({
  id,
  title: id,
  sv: id,
  nota: '',
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

  it('glömmer allt vid nollställning', () => {
    leggi.complete('uno', new Set(['grande']));
    leggi.reset();
    expect(leggi.own()).toBeNull();
    expect(leggi.openWords()).toEqual([]);
    expect(leggi.next()?.id).toBe('uno');
  });
});
