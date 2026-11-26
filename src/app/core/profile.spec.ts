import { describe, expect, it } from 'vitest';
import { PillarId, ReadingProfile } from '../models/leggi.models';
import { focusOf } from './profile';

const profile = (
  load: Partial<Record<PillarId, [seen: number, looked: number]>>,
  decks: [string, number][] = [],
): ReadingProfile => ({
  pillars: (['D1', 'D2', 'D3', 'D4'] as PillarId[]).map((p) => ({
    p,
    seen: load[p]?.[0] ?? 0,
    looked: load[p]?.[1] ?? 0,
  })),
  decks: decks.map(([deckId, looked]) => ({ deckId, looked })),
});

describe('focusOf', () => {
  it('pekar ut pelaren med högst andel uppslag, inte den med flest', () => {
    // Limmet står överallt och har flest uppslag, men motorn slås upp oftast.
    const focus = focusOf(profile({ D1: [200, 10], D3: [40, 8], D4: [60, 6] }));
    expect(focus).toMatchObject({ p: 'D3', rate: 20, overall: 8 });
  });

  it('nämner mazzin i pelaren där uppslagen hopar sig', () => {
    const focus = focusOf(
      profile({ D1: [200, 4], D3: [40, 8] }, [
        ['D3.11', 4],
        ['D1.4', 3],
        ['D3.7', 2],
        ['D3.9', 2],
        ['D3.2', 1],
      ]),
    );
    expect(focus?.deckIds).toEqual(['D3.11', 'D3.7']);
  });

  it('väntar tills det finns underlag', () => {
    expect(focusOf(profile({}))).toBeNull();
    expect(focusOf(profile({ D1: [50, 0], D3: [20, 0] }))).toBeNull();
    // För få lästa ord, respektive för få uppslag, i pelaren som sticker ut.
    expect(focusOf(profile({ D1: [100, 1], D3: [10, 5] }))).toBeNull();
    expect(focusOf(profile({ D1: [100, 1], D3: [30, 2] }))).toBeNull();
  });

  it('pekar inte ut något när uppslagen sprider sig jämnt', () => {
    expect(focusOf(profile({ D1: [100, 10], D3: [50, 5], D4: [50, 6] }))).toBeNull();
  });
});
