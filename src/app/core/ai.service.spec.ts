import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserText } from '../models/leggi.models';
import { AiResult, AiService } from './ai.service';
import { RawBookPlan } from './ai-book';
import { AiError } from './ai-text';
import { StoryStore } from './story-store';

const result = (id: string): AiResult => ({
  text: { id } as UserText,
  cost: 0.1,
  missing: [],
  faithful: true,
});

describe('AiService.writeSeries', () => {
  let ai: AiService;
  /** Det varje text beställdes med, och om tjänsten räknades som upptagen under tiden. */
  let calls: { follow: boolean; label: string; busyBetween: boolean }[];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ai = TestBed.inject(AiService);
    calls = [];
  });

  const stubWrite = (fail: number | null = null) =>
    vi.spyOn(ai, 'write').mockImplementation(async (_topic, follow = true, label = '') => {
      calls.push({ follow, label, busyBetween: ai.busy() });
      await Promise.resolve();
      if (calls.length === fail) throw new AiError('rate-limit', 'För många anrop just nu.');
      return result(`ai-${calls.length}`);
    });

  it('skriver texterna i följd, och låter dem fortsätta på varandra', async () => {
    stubWrite();
    const { results, error } = await ai.writeSeries('en resa', false, 3);
    expect(error).toBeNull();
    expect(results.map((r) => r.text.id)).toEqual(['ai-1', 'ai-2', 'ai-3']);
    // Den första börjar en ny berättelse, som läsaren bad om; resten fortsätter på den.
    expect(calls.map((c) => c.follow)).toEqual([false, true, true]);
    expect(calls.map((c) => c.label)).toEqual([
      'Text 1 av 3 · ',
      'Text 2 av 3 · ',
      'Text 3 av 3 · ',
    ]);
  });

  it('räknas som upptagen hela serien igenom, så att påfyllningen väntar', async () => {
    stubWrite();
    const pending = ai.writeSeries('', true, 2);
    expect(ai.busy()).toBe(true);
    await pending;
    expect(calls.every((c) => c.busyBetween)).toBe(true);
    expect(ai.busy()).toBe(false);
  });

  it('behåller det som hann skrivas när en text i serien går fel', async () => {
    stubWrite(3);
    const { results, error } = await ai.writeSeries('', true, 5);
    expect(results.map((r) => r.text.id)).toEqual(['ai-1', 'ai-2']);
    expect(error?.message).toBe('För många anrop just nu.');
    expect(calls.length).toBe(3);
    expect(ai.busy()).toBe(false);
  });

  it('kastar felet när inte ens den första texten blev skriven', async () => {
    stubWrite(1);
    await expect(ai.writeSeries('', true, 3)).rejects.toThrow('För många anrop just nu.');
    expect(ai.busy()).toBe(false);
  });

  it('skriver en enda text utan räknare i statusraden', async () => {
    stubWrite();
    await ai.writeSeries('', true, 1);
    expect(calls).toEqual([{ follow: true, label: '', busyBetween: true }]);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('AiService.writeBook', () => {
  let ai: AiService;
  let store: StoryStore;
  /** Sidorna som beställdes, med etiketten i statusraden. */
  let pages: string[];

  const plan: RawBookPlan = {
    title: 'Ciao, bella!',
    sv: 'En flört.',
    cover: 'En bar.',
    cast: 'Marco och Ingrid.',
    chapters: [
      {
        title: 'Uno',
        sv: 'Ett',
        pages: [
          { title: 'A', sv: 'A', scene: 'Första.', narrator: 'f' },
          { title: 'B', sv: 'B', scene: 'Andra.', narrator: 'm' },
        ],
      },
      {
        title: 'Due',
        sv: 'Två',
        pages: [{ title: 'C', sv: 'C', scene: 'Tredje.', narrator: 'f' }],
      },
    ],
  };
  const six = ['Uno.', 'Due.', 'Tre.', 'Quattro.', 'Cinque.', 'Sei.'];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ai = TestBed.inject(AiService);
    store = TestBed.inject(StoryStore);
    pages = [];
    const svc = ai as any;
    svc.settings.set({ apiKey: 'k', model: 'claude-haiku-5-5', auto: false, spent: 0 });
    vi.spyOn(svc, 'system').mockReturnValue('system');
    vi.spyOn(svc, 'call').mockResolvedValue({ output: plan, cost: 0.01 });
  });

  const stubCompose = (fail: number | null = null, sentences = six) =>
    vi
      .spyOn(ai as any, 'compose')
      .mockImplementation(async (_prompt: any, _effort: any, _meta: any, _w: any, label: any) => {
        pages.push(label as string);
        expect(ai.busy()).toBe(true);
        if (pages.length === fail) throw new AiError('rate-limit', 'För många anrop just nu.');
        const text = {
          id: 'ai-x',
          title: 'T',
          sv: 'T',
          nota: 'N',
          level: 1,
          narrator: 'f',
          sentences: sentences.map((it) => ({ it, sv: 'sv' })),
          question: { sv: 'Q', options: ['a', 'b', 'c'], answer: 0 },
          source: 'ai',
          createdAt: 0,
          lexicon: {},
        } as UserText;
        return { text, cost: 0.1, missing: [], faithful: true };
      });

  it('planerar boken och skriver sidorna i ordning', async () => {
    stubCompose();
    const result = await ai.writeBook({ topic: 'En flört', level: 1, pages: 3 });
    expect(result.error).toBeNull();
    expect([result.written, result.planned]).toEqual([3, 3]);
    expect(result.cost).toBeCloseTo(0.31);
    expect(pages).toEqual(['Sida 1 av 3 · ', 'Sida 2 av 3 · ', 'Sida 3 av 3 · ']);
    const book = store.book(result.id)!;
    expect(book.title).toBe('Ciao, bella!');
    expect(store.itemsOf(book).map((i) => i.id)).toEqual([
      `${result.id}-01-1`,
      `${result.id}-01-2`,
      `${result.id}-02-1`,
    ]);
    expect(store.stories().at(-1)).toBe(book);
    expect(ai.busy()).toBe(false);
  });

  it('försöker en gång till när sidan inte håller, och tar den ändå', async () => {
    stubCompose(null, ['För kort.']);
    const result = await ai.writeBook({ topic: '', level: 1, pages: 3 });
    expect(pages.filter((l) => l.includes('Försöker igen')).length).toBe(3);
    expect(result.written).toBe(3);
  });

  it('behåller det som hann skrivas, och skriver klart senare', async () => {
    stubCompose(2);
    const result = await ai.writeBook({ topic: '', level: 1, pages: 3 });
    expect(result.error?.message).toBe('För många anrop just nu.');
    expect([result.written, result.planned]).toEqual([1, 3]);
    expect(ai.busy()).toBe(false);

    const rest = await ai.continueBook(result.id);
    expect(rest.error).toBeNull();
    expect(rest.written).toBe(3);
    expect(pages.at(-1)).toBe('Sida 3 av 3 · ');
  });
});
