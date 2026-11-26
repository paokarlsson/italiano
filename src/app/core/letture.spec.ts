import { describe, expect, it } from 'vitest';
import appData from '../../../public/data/app-data.json';
import letture from '../../../public/data/letture.json';
import { LettureData } from '../models/leggi.models';
import { Pillar } from '../models/quiz.models';
import { tokenize } from './tokenize';

const data = letture as LettureData;
const pillars = appData as Pillar[];

/** Innehållet skrivs för hand — det här fångar felstavningar innan de blir döda ord i texten. */
describe('letture.json', () => {
  const names = new Set(data.names);
  const tokens = data.texts.flatMap((t) =>
    t.sentences.flatMap((s) => tokenize(s.it, data.lexicon).map((tok) => ({ text: t.id, tok }))),
  );

  it('har ett uppslag för varje ord som inte är ett egennamn', () => {
    const unknown = tokens
      .filter(({ tok }) => !tok.key && !names.has(tok.text.toLocaleLowerCase('it')))
      .map(({ text, tok }) => `${text}: ${tok.text}`);
    expect(unknown).toEqual([]);
  });

  it('har inga poster i ordlistan som ingen text använder', () => {
    const used = new Set(tokens.map(({ tok }) => tok.key));
    expect(Object.keys(data.lexicon).filter((key) => !used.has(key))).toEqual([]);
  });

  it('pekar bara på pelare och mazzi som finns', () => {
    const pillarIds = new Set(pillars.map((p) => p.pillarId));
    const deckIds = new Set(pillars.flatMap((p) => p.decks.map((d) => d.deckId)));
    for (const [key, entry] of Object.entries(data.lexicon)) {
      expect(pillarIds.has(entry.p), `${key}: pelare ${entry.p}`).toBe(true);
      if (entry.deck) expect(deckIds.has(entry.deck), `${key}: mazzo ${entry.deck}`).toBe(true);
    }
  });

  it('har unika id:n, en översättning per mening och ett giltigt facit', () => {
    expect(new Set(data.texts.map((t) => t.id)).size).toBe(data.texts.length);
    for (const t of data.texts) {
      for (const s of t.sentences) expect(s.sv, `${t.id}: ${s.it}`).toBeTruthy();
      expect(t.question.options[t.question.answer], t.id).toBeTruthy();
      expect(new Set(t.question.options).size, t.id).toBe(t.question.options.length);
    }
  });
});
