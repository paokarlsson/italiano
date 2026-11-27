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

/** En repetitionsfråga som följer med en text, knuten till en form i den. */
export interface TextQuestion {
  /** Formen frågan hör till — en nyckel i textens ordlista. */
  form: string;
  /** Frågan, med det som frågas efter inom **…**. */
  q: string;
  options: string[];
  /** Index i `options`. */
  answer: number;
  explain: string;
}

export interface Lettura {
  id: string;
  title: string;
  /** Titeln på svenska. */
  sv: string;
  /** En rad om vad som är nytt i texten. */
  nota: string;
  /** Svårighetsnivå, 1–7 — se core/levels.ts. Saknas på inklistrade texter. */
  level?: number | null;
  sentences: Sentence[];
  /** En fråga om innehållet. `answer` är index i `options`. */
  question: { sv: string; options: string[]; answer: number };
  /** Frågor till repetitionen, om texten har några — se core/ripasso.ts. */
  questions?: TextQuestion[];
}

/**
 * En text som inte följer med appen: skriven av Claude åt läsaren («ai»), inklistrad av
 * läsaren («paste»), eller hämtad ur det delade biblioteket («shared»).
 */
export interface UserText extends Lettura {
  source: 'ai' | 'paste' | 'shared';
  createdAt: number;
  /** Textens egen ordlista — den enda som används när texten läses. */
  lexicon: Record<string, LexEntry>;
  /** Vilken del av berättelsen texten är, från 1 — bara på texter från Claude. */
  part?: number;
  /** Berättelsen så här långt, på svenska — det nästa del får veta om de förra. */
  recap?: string;
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
  /** Nivån nästa skrivna text ska ligga på. */
  level?: number;
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
  /** Hur nivån rörde sig: -1 lättare, 0 samma, 1 svårare — null om texten inte styr nivån. */
  levelShift: -1 | 0 | 1 | null;
}

/** Ett öppet ord med meningen där det senast stod. */
export interface OpenWord {
  key: string;
  entry: LexEntry;
  looked: number;
  /** Meningen ordet stod i, delad i bitar — för att kunna visa det i sitt sammanhang. */
  sentence: Token[];
  /** Frågor på just den här formen som följde med texten. */
  questions?: TextQuestion[];
}

/** Hur ofta ord ur en pelare har slagits upp, räknat över allt som lästs. */
export interface PillarLoad {
  p: PillarId;
  seen: number;
  looked: number;
}

/** Underlaget till en beställning: var läsaren slår upp mest. */
export interface ReadingProfile {
  pillars: PillarLoad[];
  /** Mazzin vars former slagits upp, flest uppslag först. */
  decks: { deckId: string; looked: number }[];
}
