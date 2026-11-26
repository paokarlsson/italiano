import { describe, expect, it } from 'vitest';
import { LexEntry, OpenWord } from '../models/leggi.models';
import { Deck, McQuestion, Pillar } from '../models/quiz.models';
import { buildRipasso } from './ripasso';
import { tokenize } from './tokenize';

const mc = (deckId: string, n: number, q: string, answer: string, tag = 'a'): McQuestion => ({
  type: 'mc',
  tag,
  q,
  options: [answer, 'x', 'y'],
  answer,
  explain: '',
  _k: `${deckId}_${n}`,
  statKey: `${deckId}::${tag}`,
});

const deck = (deckId: string, pool: Deck['pool']): Deck => ({
  deckId,
  title: deckId,
  hint: '',
  pool,
});

const pillars: Pillar[] = [
  {
    pillarId: 'D1',
    pillarTitle: 'Il collante',
    decks: [deck('D1.9', [mc('D1.9', 0, 'Vad betyder <b>anche</b>?', 'också')])],
  },
  {
    pillarId: 'D2',
    pillarTitle: 'Le regole',
    decks: [
      deck('D2.1', [
        mc('D2.1', 0, 'Engelska <b>nation</b> →', 'nazione'),
        mc('D2.1', 1, 'Engelska <b>solution</b> →', 'soluzione'),
        mc('D2.1', 2, 'Engelska <b>station</b> →', 'stazione'),
        {
          type: 'match',
          tag: 'match',
          instr: 'Para ihop.',
          pairs: [['a', 'b']],
          _k: 'D2.1_3',
          statKey: 'D2.1::match',
        },
      ]),
    ],
  },
  {
    pillarId: 'D4',
    pillarTitle: 'Le parole',
    decks: [deck('D4.3', [mc('D4.3', 0, 'Vad betyder <b>padre</b>?', 'far', 'p')])],
  },
];

const lexicon: Record<string, LexEntry> = {
  anche: { p: 'D1', sv: 'också', deck: 'D1.9' },
  ma: { p: 'D1', sv: 'men' },
  e: { p: 'D1', sv: 'och' },
  non: { p: 'D1', sv: 'inte' },
  il: { p: 'D1', sv: 'bestämd artikel' },
  soluzione: { p: 'D2', sv: 'lösning', note: '-tion → -zione', deck: 'D2.1' },
  cane: { p: 'D4', sv: 'hund' },
  casa: { p: 'D4', sv: 'hus' },
  mare: { p: 'D4', sv: 'hav' },
  libro: { p: 'D4', sv: 'bok' },
};

const open = (key: string, sentence: string, looked = 1): OpenWord => ({
  key,
  entry: lexicon[key],
  looked,
  sentence: tokenize(sentence, lexicon),
});

const build = (words: OpenWord[], weak: { statKey: string; label: string }[] = [], max?: number) =>
  buildRipasso({ open: words, pillars, lexicon, weak }, max);

describe('buildRipasso', () => {
  it('frågar på ordet självt när uppslaget är ett småord som gymmet har en fråga om', () => {
    const [item] = build([open('anche', 'Ha anche un cane.')]);
    expect(item).toMatchObject({ kind: 'word', wordKey: 'anche' });
    expect(item.question._k).toBe('D1.9_0');
  });

  it('bygger en fråga ur meningen när gymmet saknar ordet', () => {
    const [item] = build([open('cane', 'Il cane <non> è qui.')]);
    expect(item).toMatchObject({ kind: 'word', wordKey: 'cane' });
    const q = item.question;
    // Texten kan komma utifrån — allt utom markeringen ska vara oskadliggjort.
    expect(q.type === 'mc' && q.q).toBe('Il <b>cane</b> &lt;non&gt; è qui.');
    expect(q.type === 'mc' && q.answer).toBe('hund');
    expect(q.type === 'mc' && new Set(q.options).size).toBe(4);
    // Frågan hör inte till något mazzo, så den ska inte in i gymmets statistik.
    expect(q.statKey).toBe('');
  });

  it('frågar på samma regel i ett annat ord när uppslaget är ett mönster', () => {
    for (let i = 0; i < 20; i++) {
      const [item] = build([open('soluzione', 'È una soluzione.')]);
      expect(item).toMatchObject({ kind: 'rule', wordKey: 'soluzione' });
      expect(['D2.1_0', 'D2.1_2']).toContain(item.question._k);
    }
  });

  it('tar frågan som följde med texten före mazzot när uppslaget är ett mönster', () => {
    const word: OpenWord = {
      ...open('soluzione', 'È una soluzione.'),
      questions: [
        {
          form: 'soluzione',
          q: 'Engelska **tradition** <blir>',
          options: ['tradizione', 'tradicione', 'traditione', 'tradizzione'],
          answer: 0,
          explain: '-tion → -zione & inget annat',
        },
      ],
    };
    const [item] = build([word]);
    expect(item).toMatchObject({
      kind: 'rule',
      source: 'text',
      wordKey: 'soluzione',
      why: 'Du slog upp «soluzione» — samma regel, annat ord',
    });
    const q = item.question;
    // Frågan kom utifrån: markeringen blir fetstil, allt annat oskadliggörs.
    expect(q.type === 'mc' && q.q).toBe('Engelska <b>tradition</b> &lt;blir&gt;');
    expect(q.type === 'mc' && q.answer).toBe('tradizione');
    expect(q.explain).toBe('-tion → -zione &amp; inget annat');
    expect(q.statKey).toBe('');
  });

  it('låter gymmets fråga på ordet gå före textens, och textens före den byggda', () => {
    const questions = (form: string) => [
      { form, q: `Vad betyder **${form}**?`, options: ['a', 'b', 'c'], answer: 1, explain: '' },
    ];
    const items = build([
      { ...open('anche', 'Ha anche un cane.'), questions: questions('anche') },
      { ...open('cane', 'Ha anche un cane.'), questions: questions('cane') },
      open('casa', 'La casa.'),
    ]);
    const by = (key: string) => items.find((i) => i.wordKey === key)!;
    expect(by('anche')).toMatchObject({ kind: 'word', source: 'gym' });
    expect(by('cane')).toMatchObject({ kind: 'word', source: 'text', why: 'Du slog upp «cane»' });
    expect(by('cane').question).toMatchObject({ answer: 'b', _k: 'text_cane_0' });
    expect(by('casa')).toMatchObject({ kind: 'word', source: 'context' });
  });

  it('tar aldrig para ihop-frågor och aldrig samma fråga två gånger', () => {
    const items = build([
      open('soluzione', 'È una soluzione.'),
      { ...open('soluzione', 'È una soluzione.'), key: 'soluzione2' },
      { ...open('soluzione', 'È una soluzione.'), key: 'soluzione3' },
    ]);
    const keys = items.map((i) => i.question._k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('D2.1_3');
    // Högst två ur samma mazzo — det tredje ordet får en fråga byggd ur meningen.
    expect(keys.filter((k) => k.startsWith('D2.1_')).length).toBe(2);
    expect(items.length).toBe(3);
  });

  it('fyller på med svaga punkter ur gymmet, men stannar vid taket', () => {
    const weak = [{ statKey: 'D4.3::p', label: 'personer' }];
    const items = build([open('anche', 'Ha anche un cane.')], weak);
    expect(items.map((i) => i.kind).sort()).toEqual(['weak', 'word']);
    expect(items.find((i) => i.kind === 'weak')).toMatchObject({
      wordKey: null,
      why: 'Svag punkt i gymmet: personer',
    });

    expect(build([open('anche', 'Ha anche un cane.')], weak, 1).length).toBe(1);
  });

  it('ger en tom runda när inget skaver', () => {
    expect(build([])).toEqual([]);
  });
});
