/**
 * Nivåerna en text kan ligga på. De följer ordningen i de inbyggda texterna, och varje
 * nivå bygger på de föregående. `scope` är det som sägs till Claude när en text beställs.
 */
export interface Level {
  n: number;
  label: string;
  scope: string;
  /** Flest ord en mening får ha. */
  maxWords: number;
}

export const LEVELS: readonly Level[] = [
  {
    n: 1,
    label: 'è och ha',
    scope: 'Presens av essere och avere, artiklar, enkla adjektiv. Inga andra tempus.',
    maxWords: 8,
  },
  {
    n: 2,
    label: 'presens',
    scope:
      "Presens av regelbundna verb, c'è och ci sono, många kognater (-zione, -tà, -ale, -ico).",
    maxWords: 9,
  },
  {
    n: 3,
    label: 'reflexiva och pronomen',
    scope: 'Reflexiva verb, piacere, objektspronomen (lo, la, mi, ti, ci), oregelbundet presens.',
    maxWords: 11,
  },
  {
    n: 4,
    label: 'dåtid: passato prossimo',
    scope: 'Passato prossimo med avere och essere, regelbundna och vanliga oregelbundna particip.',
    maxWords: 12,
  },
  {
    n: 5,
    label: 'dåtid: imperfetto',
    scope: 'Imperfetto, imperfetto mot passato prossimo, stare + gerundio.',
    maxWords: 12,
  },
  {
    n: 6,
    label: 'framtid och artighet',
    scope: 'Futurum, konditionalis (vorrei, potresti), ci och ne.',
    maxWords: 14,
  },
  {
    n: 7,
    label: 'fri text',
    scope: 'Fri text på A2–B1: längre meningar, bisatser med che, relativsatser, alla tempus ovan.',
    maxWords: 18,
  },
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = LEVELS.length;

/** Över det här lästes texten för lätt, under det andra för tungt — andel på egen hand. */
const TOO_EASY = 97;
const TOO_HARD = 85;

export function level(n: number): Level {
  return LEVELS[Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(n))) - 1];
}

/** Vart nivån ska röra sig efter en läsning: ett steg upp, ett ned eller stilla. */
export function levelShift(own: number): -1 | 0 | 1 {
  if (own >= TOO_EASY) return 1;
  if (own < TOO_HARD) return -1;
  return 0;
}
