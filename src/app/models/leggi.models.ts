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

/** Rösten som läser: «f» kvinnlig, «m» manlig. */
export type Voice = 'f' | 'm';

export interface Sentence {
  it: string;
  sv: string;
  /** Vem som säger varje replik inom «…» i meningen, i ordning. Saknas en läser berättaren. */
  speakers?: Voice[];
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
  /** Rösten som läser det som står utanför replikerna. I jag-form: den som berättar. */
  narrator?: Voice;
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

/**
 * En sida i en följetong som följer med appen — Alba & Luca eller La valigia blu. En vanlig text, med sin plats
 * i berättelsen och planen den skrevs efter: scenen och replikerna som inte får tappas.
 * Planen följer med så att Claude kan skriva om sidan åt läsaren utan att rubba handlingen.
 */
export interface StoryPage extends Lettura {
  /** Kapitel, 0 för prologen. */
  chapter: number;
  /** Sidan inom kapitlet, från 1. */
  part: number;
  level: number;
  narrator: Voice;
  /** Vad som händer på sidan, på svenska — sidplanens rad. */
  scene: string;
  /** Repliker som ska stå ordagrant i italienskan. */
  locked?: string[];
  /** Poster som bara gäller den här sidan — läggs över berättelsens ordlista. */
  lexicon?: Record<string, LexEntry>;
}

/** En låtsida: refrängen rad för rad, med svenska under. Ingen fråga och ingen nivå. */
export interface StorySong {
  id: string;
  chapter: number;
  part: number;
  title: string;
  sv: string;
  nota: string;
  /** Länk till låten, när den finns. */
  spotify?: string;
  lines: { it: string; sv: string }[];
}

export interface StoryChapter {
  /** 0 för prologen. */
  n: number;
  title: string;
  sv: string;
  pages: StoryPage[];
  /** Låtsidorna efter kapitlets sista sida, i ordning. */
  songs: StorySong[];
}

export interface StoryData {
  id: string;
  title: string;
  /** En rad om berättelsen. */
  sv: string;
  /**
   * Sant om berättelsen läses varvat med grundkursen: varje sida efter grundkursens texter
   * på samma nivå. Annars kommer den efter grundkursen.
   */
  course?: boolean;
  /**
   * Kanon — världen och handlingen — som Claude får när en sida skrivs om åt läsaren.
   * Utan kanon skrivs sidorna inte om.
   */
  canon?: string[];
  /**
   * Bildprompten till bokens framsida: vad omslaget ska visa. Läggs efter mallen när Gemini
   * ritar omslaget — se core/cover.ts.
   */
  cover?: string;
  names: string[];
  /** Berättelsens ordlista — läggs över appens. */
  lexicon: Record<string, LexEntry>;
  chapters: StoryChapter[];
  /** En bok som läsaren själv har beställt av Claude — saknas på böckerna som följer med appen. */
  own?: OwnBook;
}

/** En planerad sida i en egen bok: det som bestämdes innan sidan skrevs. */
export interface BookPagePlan {
  title: string;
  sv: string;
  scene: string;
  narrator: Voice;
}

export interface BookChapterPlan {
  n: number;
  title: string;
  sv: string;
  pages: BookPagePlan[];
}

/**
 * Det som hör till en egen bok: beställningen och planen. Boken skrivs sida för sida efter
 * planen; sidorna som är skrivna står i kapitlen, och de som återstår kan skrivas senare.
 */
export interface OwnBook {
  /** Läsarens beställning, med egna ord. */
  topic: string;
  level: number;
  createdAt: number;
  /** Personerna, på svenska — så att varje sida håller dem lika. */
  cast: string;
  plan: BookChapterPlan[];
  /** Sant för en bok som hämtats ur biblioteket — någon annan beställde den. */
  shared?: boolean;
}

/** En plats i följetongen: en sida att läsa eller en låt att lyssna på. */
export type StoryItem =
  | { kind: 'page'; id: string; story: StoryData; chapter: StoryChapter; page: StoryPage }
  | { kind: 'song'; id: string; story: StoryData; chapter: StoryChapter; song: StorySong };

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
