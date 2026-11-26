import { describe, expect, it } from 'vitest';
import { LexEntry } from '../models/leggi.models';
import { tokenize } from './tokenize';

const entry = (sv: string): LexEntry => ({ p: 'D1', sv });
const lexicon: Record<string, LexEntry> = {
  è: entry('är'),
  ho: entry('jag har'),
  "l'": entry('artikel'),
  amico: entry('vän'),
  "c'è": entry('det finns'),
  "ce n'è": entry('det finns av det'),
  'ho mangiato': entry('jag åt'),
  'è arrivato': entry('kom'),
  grande: entry('stor'),
  uno: entry('en'),
};

const keys = (s: string) => tokenize(s, lexicon).map((t) => t.key);
/** Sätter ihop bitarna igen, så som mallen ritar dem. */
const rebuilt = (s: string) =>
  tokenize(s, lexicon)
    .map((t) => t.pre + t.text + t.post + (t.space ? ' ' : ''))
    .join('')
    .trim();

describe('tokenize', () => {
  it('skiljer skiljetecken från ordet och behåller dem', () => {
    const [first, second] = tokenize('«Grande!» è', lexicon);
    expect(first).toMatchObject({ pre: '«', text: 'Grande', post: '!»', key: 'grande' });
    expect(second.key).toBe('è');
  });

  it('delar vid apostrof utan att lägga in mellanslag', () => {
    const tokens = tokenize("L'amico è grande.", lexicon);
    expect(tokens.map((t) => t.key)).toEqual(["l'", 'amico', 'è', 'grande']);
    expect(tokens[0].space).toBe(false);
    expect(rebuilt("L'amico è grande.")).toBe("L'amico è grande.");
  });

  it('låter den längsta enheten i ordlistan vinna', () => {
    expect(keys('Ho mangiato.')).toEqual(['ho mangiato']);
    expect(keys("C'è uno.")).toEqual(["c'è", 'uno']);
    expect(keys("Ce n'è uno.")).toEqual(["ce n'è", 'uno']);
  });

  it('bryter en enhet vid skiljetecken', () => {
    expect(keys('Grande è, arrivato')).toEqual(['grande', 'è', null]);
    expect(keys('Ho, mangiato')).toEqual(['ho', null]);
  });

  it('lämnar okända ord — egennamn — utan uppslag', () => {
    const [name] = tokenize('Maria è grande.', lexicon);
    expect(name).toMatchObject({ text: 'Maria', key: null, entry: null });
  });

  it('förstår typografisk apostrof', () => {
    expect(keys('C’è')).toEqual(["c'è"]);
  });
});
