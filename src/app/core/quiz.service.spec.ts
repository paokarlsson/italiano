import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { DataService } from './data.service';
import { QuizService } from './quiz.service';
import { StatsService } from './stats.service';
import { Deck, Pillar } from '../models/quiz.models';

/** Alla frågor delar tagg, så repetitionslogiken blir oberoende av blandningen. */
const deck: Deck = {
  deckId: 'T1.1',
  title: 'Testmazzo',
  hint: '',
  pool: [
    {
      type: 'mc',
      tag: 'a',
      q: 'a1?',
      options: ['x', 'y'],
      answer: 'x',
      explain: '',
      _k: 'a1',
      statKey: 'T1.1::a',
    },
    {
      type: 'mc',
      tag: 'a',
      q: 'a2?',
      options: ['x', 'y'],
      answer: 'y',
      explain: '',
      _k: 'a2',
      statKey: 'T1.1::a',
    },
    {
      type: 'mc',
      tag: 'a',
      q: 'a3?',
      options: ['x', 'y'],
      answer: 'x',
      explain: '',
      _k: 'a3',
      statKey: 'T1.1::a',
    },
    { type: 'tf', tag: 'a', q: 'a4?', answer: true, explain: '', _k: 'a4', statKey: 'T1.1::a' },
  ],
};
const pillar: Pillar = { pillarId: 'T1', pillarTitle: 'Test', decks: [deck] };

describe('QuizService', () => {
  let quiz: QuizService;
  let stats: StatsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    // Fyller uppslagstabellerna utan att gå via nätverket.
    TestBed.inject(DataService).hydrate([pillar]);
    quiz = TestBed.inject(QuizService);
    stats = TestBed.inject(StatsService);
    quiz.selectDeck('T1.1');
  });

  it('bygger en kö av önskad längd', () => {
    quiz.setDesiredCount(3);
    quiz.begin();
    expect(quiz.queue().length).toBe(3);
    expect(quiz.pos()).toBe(0);
    expect(quiz.asked()).toBe(1);
  });

  it('kapar kön till poolens storlek', () => {
    quiz.setDesiredCount(12);
    quiz.begin();
    expect(quiz.queue().length).toBe(deck.pool.length);
  });

  it('lägger in en repetition på samma tagg efter ett fel svar', () => {
    quiz.setDesiredCount(1);
    quiz.begin();
    const statKey = quiz.current()!.statKey;
    const retried = quiz.submit(false);

    expect(retried).toBe(true);
    expect(quiz.queue().length).toBe(2);
    expect(quiz.queue()[1].statKey).toBe(statKey);
    expect(quiz.queue()[1]._retry).toBe(true);
  });

  it('ger ingen repetition på rätt svar', () => {
    quiz.setDesiredCount(1);
    quiz.begin();
    expect(quiz.submit(true)).toBe(false);
    expect(quiz.queue().length).toBe(1);
    expect(quiz.correct()).toBe(1);
  });

  it('ger högst två repetitioner per tagg och runda', () => {
    quiz.setDesiredCount(1);
    quiz.begin();
    let retries = 0;
    while (quiz.current()) {
      if (quiz.submit(false)) retries++;
      quiz.advance();
    }
    expect(retries).toBe(2);
  });

  it('markerar mazzot som klarat vid minst 60 % rätt', () => {
    quiz.setDesiredCount(4);
    quiz.begin();
    while (quiz.current()) {
      quiz.submit(true);
      quiz.advance();
    }
    expect(stats.isDeckDone('T1.1')).toBe(true);
    expect(quiz.roundOver()).toBe(true);
  });

  it('markerar inte mazzot som klarat när allt går fel', () => {
    quiz.setDesiredCount(4);
    quiz.begin();
    while (quiz.current()) {
      quiz.submit(false);
      quiz.advance();
    }
    expect(stats.isDeckDone('T1.1')).toBe(false);
  });

  it('räknar repetitioner utöver rundans planerade längd', () => {
    quiz.setDesiredCount(1);
    quiz.begin();
    while (quiz.current()) {
      quiz.submit(false);
      quiz.advance();
    }
    expect(quiz.plannedCount()).toBe(1);
    expect(quiz.asked()).toBe(3);
    expect(quiz.hasRepeats()).toBe(true);
  });

  it('repeterar inte när hela poolen redan ligger i kön', () => {
    quiz.setDesiredCount(4);
    quiz.begin();
    expect(quiz.submit(false)).toBe(false);
    expect(quiz.queue().length).toBe(4);
  });
});
