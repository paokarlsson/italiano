import { describe, expect, it } from 'vitest';
import { Deck, McQuestion, Pillar, Question, TagStat } from '../models/quiz.models';
import { decksToExtend, MAX_EXTRA, recommend } from './recommend';

const mc = (deckId: string, n: number, tag = 'a'): McQuestion => ({
  type: 'mc',
  tag,
  q: `q${n}`,
  options: ['a', 'b', 'c'],
  answer: 'a',
  explain: '',
  _k: `${deckId}_${n}`,
  statKey: `${deckId}::${tag}`,
});

const deck = (deckId: string, size = 4, tags = ['a']): Deck => ({
  deckId,
  title: `Mazzo ${deckId}`,
  hint: '',
  pool: [
    ...Array.from({ length: size }, (_, n) => mc(deckId, n, tags[n % tags.length])),
    {
      type: 'match',
      tag: 'match',
      instr: '',
      pairs: [['a', 'b']],
      _k: `${deckId}_m`,
      statKey: `${deckId}::match`,
    },
  ],
});

const pillars: Pillar[] = [
  { pillarId: 'D1', pillarTitle: 'Il collante', decks: [deck('D1.1'), deck('D1.2')] },
  { pillarId: 'D3', pillarTitle: 'Il motore', decks: [deck('D3.7', 4, ['who', 'mean'])] },
];

const NOW = 1_000_000_000_000;
const stat = (attempts: number, correct: number, lastSeen = NOW): TagStat => ({
  attempts,
  correct,
  last5: [],
  lastSeen,
});

describe('recommend', () => {
  const run = (
    lookups: [string, number][],
    tags: Record<string, TagStat> = {},
    deckDone: Record<string, boolean> = {},
  ) =>
    recommend({
      pillars,
      lookups: lookups.map(([deckId, looked]) => ({ deckId, looked })),
      stats: { tags, deckDone },
    });

  it('sätter mazzot där uppslagen hopar sig först, och säger varför', () => {
    const [first, second] = run([
      ['D1.2', 1],
      ['D3.7', 4],
    ]);
    expect(first).toMatchObject({ deckId: 'D3.7', title: 'Mazzo D3.7', pillarTitle: 'Il motore' });
    expect(first.reasons).toEqual(['4 uppslag i texterna hör hit', 'inte övat än']);
    expect(second.deckId).toBe('D1.2');
  });

  it('räknar en svag tagg i gymmet tyngre än ett enstaka uppslag', () => {
    const [first] = run([['D1.2', 1]], { 'D3.7::who': stat(5, 1) });
    expect(first.deckId).toBe('D3.7');
    expect(first.reasons).toEqual(['«läsa av person» ligger på 20 % i gymmet']);
  });

  it('låter ett mazzo som redan sitter sjunka undan', () => {
    const [first, second] = run(
      [
        ['D1.1', 3],
        ['D1.2', 1],
      ],
      { 'D1.1::a': stat(10, 10) },
    );
    expect(first.deckId).toBe('D1.2');
    expect(second.reasons).toContain('sitter i gymmet, men inte i läsningen');
  });

  it('föreslår nästa oklarade mazzo när inget sticker ut — och inget när allt är klarat', () => {
    expect(run([], {}, { 'D1.1': true })).toMatchObject([
      { deckId: 'D1.2', reasons: ['nästa mazzo du inte har klarat'] },
    ]);
    expect(run([], {}, { 'D1.1': true, 'D1.2': true, 'D3.7': true })).toEqual([]);
  });
});

describe('decksToExtend', () => {
  const run = (
    tags: Record<string, TagStat>,
    extras: Record<string, Question[]> = {},
    marks: Record<string, number> = {},
  ) => decksToExtend(pillars, tags, extras, marks, NOW);

  it('bygger ut ett mazzo som är genomgånget men inte sitter', () => {
    // Fyra frågor: sex försök räcker, fem gör det inte.
    expect(run({ 'D1.1::a': stat(6, 3) })).toEqual(['D1.1']);
    expect(run({ 'D1.1::a': stat(5, 2) })).toEqual([]);
    // Para ihop-frågorna räknas inte — de byggs inte ut.
    expect(run({ 'D1.1::a': stat(3, 1), 'D1.1::match': stat(9, 2) })).toEqual([]);
  });

  it('låter ett mazzo som sitter, eller som ingen övar längre, vara ifred', () => {
    expect(run({ 'D1.1::a': stat(10, 9) })).toEqual([]);
    const monthAgo = NOW - 30 * 24 * 60 * 60 * 1000;
    expect(run({ 'D1.1::a': stat(10, 3, monthAgo) })).toEqual([]);
  });

  it('räknar nästa påbyggnad från den förra, inte från början', () => {
    // Hundra försök sedan tidigare ger en påbyggnad, inte flera i rad.
    const tags = { 'D1.1::a': stat(100, 40) };
    expect(run(tags)).toEqual(['D1.1']);
    expect(run(tags, {}, { 'D1.1': 100 })).toEqual([]);
    expect(run({ 'D1.1::a': stat(111, 44) }, {}, { 'D1.1': 100 })).toEqual([]);
    expect(run({ 'D1.1::a': stat(112, 44) }, {}, { 'D1.1': 100 })).toEqual(['D1.1']);
  });

  it('tar det senast övade först och stannar vid taket', () => {
    const tags = {
      'D1.1::a': stat(10, 3, NOW - 5000),
      'D3.7::who': stat(6, 2, NOW - 1000),
      'D3.7::mean': stat(4, 1, NOW - 9000),
    };
    expect(run(tags)).toEqual(['D3.7', 'D1.1']);
    const full = Array.from({ length: MAX_EXTRA }, (_, n) => mc('D3.7', 100 + n));
    expect(run(tags, { 'D3.7': full })).toEqual(['D1.1']);
  });
});
