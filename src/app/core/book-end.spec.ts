import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BookSequel, StoryData } from '../models/leggi.models';
import { bookPlanPrompt, reviewLine, sequelOf } from './ai-book';
import { bookSummary, storyItems } from './story';
import { StoryStore } from './story-store';

const page = (id: string, part: number) => ({
  id,
  chapter: 1,
  part,
  title: id,
  sv: '',
  nota: '',
  level: 1,
  narrator: 'f' as const,
  scene: `Scen ${part}.`,
  sentences: [{ it: 'Ciao.', sv: 'Hej.' }],
  question: { sv: '?', options: ['a', 'b', 'c'], answer: 0 },
});

const book: StoryData = {
  id: 'bok',
  title: 'Libro',
  sv: 'En bok.',
  names: [],
  lexicon: {},
  chapters: [
    {
      n: 1,
      title: 'Uno',
      sv: '',
      pages: [page('bok-01-1', 1), page('bok-01-2', 2)],
      songs: [{ id: 'bok-01-s', chapter: 1, part: 1, title: 'La', sv: '', nota: '', lines: [] }],
    },
  ],
};

describe('slutet på en bok', () => {
  it('räknar sidor, ord, uppslag och när boken lästes', () => {
    const items = storyItems(book);
    const day = 24 * 60 * 60 * 1000;
    const half = bookSummary(items, { 'bok-01-1': { at: day, words: 10, looked: 2, times: 1 } });
    expect(half).toMatchObject({ pages: 2, songs: 1, read: 1, total: 3, done: false, own: 80 });

    const all = bookSummary(items, {
      'bok-01-1': { at: day, words: 10, looked: 2, times: 1 },
      'bok-01-2': { at: 3 * day, words: 10, looked: 0, times: 2 },
      'bok-01-s': { at: 3 * day, words: 0, looked: 0, times: 1 },
    });
    expect(all).toMatchObject({
      read: 3,
      done: true,
      words: 20,
      looked: 2,
      own: 90,
      first: day,
      last: 3 * day,
    });
    expect(bookSummary([], {})).toMatchObject({ done: false, own: 100, first: null });
  });

  it('låter omdömet följa med till en uppföljare', () => {
    const review = { stars: 4, note: '  mer Gino! ', at: 1 };
    expect(reviewLine(review)).toBe('4 av 5 — mer Gino!');
    expect(reviewLine({ ...review, note: '' })).toBe('4 av 5');
    const sequel: BookSequel = sequelOf(book, review);
    expect(sequel.review).toBe('4 av 5 — mer Gino!');
    expect(sequelOf(book)).not.toHaveProperty('review');
    expect(bookPlanPrompt({ topic: '', level: 1, pages: 4, sequel })).toContain(
      'Läsarens omdöme om den: 4 av 5 — mer Gino!',
    );
  });

  describe('StoryStore', () => {
    beforeEach(() => TestBed.configureTestingModule({}));

    it('sparar omdömet, inom gränserna', () => {
      const store = TestBed.inject(StoryStore);
      expect(store.review('bok')).toBeNull();
      store.setReview('bok', 9, ` ${'x'.repeat(300)} `);
      expect(store.review('bok')).toMatchObject({ stars: 5, note: 'x'.repeat(280) });
      store.setReview('bok', 0, 'bra');
      expect(store.review('bok')).toMatchObject({ stars: 1, note: 'bra' });
    });
  });
});
