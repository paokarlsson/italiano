/** Datamodellen bakom letture.json — texterna man läser och ordlistan som förklarar dem. */

/** En pelare som lins: «D1» limmet, «D2» reglerna, «D3» motorn, «D4» orden. */
export type PillarId = 'D1' | 'D2' | 'D3' | 'D4';

/** En form i ordlistan. Nyckeln är formen själv, i gemener — «parlano», «ho mangiato». */
export interface LexEntry {
  p: PillarId;
  /** Vad formen betyder här. */
  sv: string;
  /** Hur man ser igenom den: regeln, ändelsen, fällan. */
  note?: string;
  /** Mazzot där samma punkt går att nöta. */
  deck?: string;
}

export interface Sentence {
  it: string;
  sv: string;
}

export interface Lettura {
  id: string;
  title: string;
  /** Titeln på svenska. */
  sv: string;
  /** En rad om vad som är nytt i texten. */
  nota: string;
  sentences: Sentence[];
  /** En fråga om innehållet. `answer` är index i `options`. */
  question: { sv: string; options: string[]; answer: number };
}

export interface LettureData {
  /** Egennamn — står i texterna men slås inte upp. */
  names: string[];
  lexicon: Record<string, LexEntry>;
  texts: Lettura[];
}

/** En bit av en mening: ett ord eller en fast enhet («c'è», «sono andata»). */
export interface Token {
  /** Skiljetecken före ordet. */
  pre: string;
  /** Ordet som det står i texten. */
  text: string;
  /** Skiljetecken efter ordet. */
  post: string;
  /** Mellanslag efter — falskt mitt i «l'amico». */
  space: boolean;
  /** Nyckeln i ordlistan, eller null för egennamn. */
  key: string | null;
  entry: LexEntry | null;
}

/** Vad som hände med ett ord senast det stod i en läst text. */
export interface WordState {
  seen: number;
  looked: number;
  /** Uppslaget senast — släpps när ordet läses utan hjälp. */
  open: boolean;
}

export interface ReadState {
  at: number;
  /** Antal ord i texten och hur många av dem som slogs upp, senaste läsningen. */
  words: number;
  looked: number;
  times: number;
}

export interface LeggiProgress {
  texts: Record<string, ReadState>;
  words: Record<string, WordState>;
}

/** Det som visas när en text är läst. */
export interface ReadSummary {
  words: number;
  looked: number;
  /** Andel av orden som lästes utan uppslag, 0–100. */
  own: number;
  /** Slogs upp den här gången. */
  lookedKeys: string[];
  /** Slogs upp förra gången, lästes utan hjälp nu. */
  settledKeys: string[];
}
