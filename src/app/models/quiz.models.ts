/** Datamodellen bakom app-data.json — fyra pelare, 66 mazzi, ~1 000 frågor. */

export type QuestionType = 'mc' | 'tf' | 'match';

interface QuestionBase {
  /** Ämnestagg, t.ex. «non» eller «mean» — grupperar frågor i statistiken. */
  tag: string;
  /** Unik nyckel per fråga i mazzot, används för att inte ställa samma fråga två gånger. */
  _k: string;
  /** Nyckel som statistiken förs på: `<deckId>::<tag>`. */
  statKey: string;
}

export interface McQuestion extends QuestionBase {
  type: 'mc';
  q: string;
  options: string[];
  answer: string;
  explain: string;
  kind?: string;
}

export interface TfQuestion extends QuestionBase {
  type: 'tf';
  q: string;
  answer: boolean;
  explain: string;
}

export interface MatchQuestion extends QuestionBase {
  type: 'match';
  instr: string;
  pairs: [string, string][];
}

export type Question = McQuestion | TfQuestion | MatchQuestion;

/** En fråga i den aktuella rundans kö. `_retry` sätts på repetitioner. */
export type QueuedQuestion = Question & { _retry?: boolean };

export interface Deck {
  deckId: string;
  title: string;
  hint: string;
  pool: Question[];
}

export interface Pillar {
  pillarId: string;
  pillarTitle: string;
  decks: Deck[];
}

export interface StatMeta {
  deckId: string;
  deckTitle: string;
  pillarId: string;
  pillarTitle: string;
  tag: string;
}

export interface TagStat {
  attempts: number;
  correct: number;
  last5: boolean[];
  lastSeen: number | null;
}

export interface StatsData {
  tags: Record<string, TagStat>;
  deckDone: Record<string, boolean>;
}

/** En rad i statistikvyn — en tagg med träffsäkerhet och trend. */
export interface StatRow extends StatMeta, TagStat {
  key: string;
  acc: number;
}
