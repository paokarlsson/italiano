import { PillarId, ReadingProfile } from '../models/leggi.models';

/** Pelarna som de heter i appen. */
export const PILLAR_NAMES: Record<PillarId, string> = {
  D1: 'limmet',
  D2: 'reglerna',
  D3: 'motorn',
  D4: 'orden',
};

/** Så många gånger ord ur en pelare ska ha lästs och slagits upp innan den pekas ut. */
const MIN_SEEN = 15;
const MIN_LOOKED = 3;
/** Så mycket oftare än snittet pelaren ska slås upp för att räknas som det som skaver. */
const ABOVE_AVERAGE = 1.25;
/** Så många mazzin som nämns i beställningen, och uppslagen som krävs för att nämnas. */
const MAX_DECKS = 2;
const MIN_DECK_LOOKED = 2;

/** Pelaren läsaren slår upp mest i — det nästa text ska vara tät på. */
export interface Focus {
  p: PillarId;
  /** Andel uppslag i pelaren och över allt, 0–100. */
  rate: number;
  overall: number;
  /** Mazzin i pelaren där uppslagen hopar sig, flest först. */
  deckIds: string[];
}

/**
 * Pekar ut pelaren där uppslagen hopar sig, eller null när underlaget är för tunt eller
 * uppslagen sprider sig jämnt. Det som jämförs är andelen uppslag — limmet står i varje
 * mening och skulle annars alltid vinna på antal.
 */
export function focusOf(profile: ReadingProfile): Focus | null {
  const seen = profile.pillars.reduce((n, l) => n + l.seen, 0);
  const looked = profile.pillars.reduce((n, l) => n + l.looked, 0);
  if (!seen || !looked) return null;
  const overall = looked / seen;

  const best = profile.pillars
    .filter((l) => l.seen >= MIN_SEEN && l.looked >= MIN_LOOKED)
    .map((l) => ({ p: l.p, rate: l.looked / l.seen }))
    .sort((a, b) => b.rate - a.rate)[0];
  if (!best || best.rate < overall * ABOVE_AVERAGE) return null;

  return {
    p: best.p,
    rate: Math.round(best.rate * 100),
    overall: Math.round(overall * 100),
    deckIds: profile.decks
      .filter((d) => d.deckId.startsWith(best.p + '.') && d.looked >= MIN_DECK_LOOKED)
      .slice(0, MAX_DECKS)
      .map((d) => d.deckId),
  };
}
