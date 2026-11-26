import { LexEntry, OpenWord, TextQuestion, Token } from '../models/leggi.models';
import { McQuestion, Pillar, Question, TfQuestion } from '../models/quiz.models';
import { mdBold, shuffle } from './utils';

/** Så många frågor en repetition har som mest. */
export const RIPASSO_MAX = 6;
/** Så många frågor ett och samma mazzo får bidra med. */
const MAX_PER_DECK = 2;
/** Så många svaga punkter ur gymmet som får fylla ut en kort repetition. */
const MAX_WEAK = 2;

export type RipassoQuestion = McQuestion | TfQuestion;

export interface RipassoItem {
  question: RipassoQuestion;
  /** Ordet som stängs om svaret är rätt. */
  wordKey: string | null;
  /** «word» frågar på ordet självt, «rule» på samma mönster i ett annat ord, «weak» på en svag punkt i gymmet. */
  kind: 'word' | 'rule' | 'weak';
  /** Varifrån frågan kommer: gymmet, texten där ordet stod, eller byggd ur meningen. */
  source: 'gym' | 'text' | 'context';
  /** Varför frågan är med — visas ovanför den. */
  why: string;
}

export interface RipassoInput {
  /** De öppna orden, viktigast först. */
  open: OpenWord[];
  pillars: Pillar[];
  /** Ordlistan som felsvaren hämtas ur. */
  lexicon: Readonly<Record<string, LexEntry>>;
  /** Svaga punkter i gymmet (`<deckId>::<tag>`), svagast först. */
  weak: { statKey: string; label: string }[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isQuick = (q: Question): q is RipassoQuestion => q.type === 'mc' || q.type === 'tf';

/** Sant om frågan handlar om just den här formen — den står markerad i frågan eller är svaret. */
function targets(q: Question, form: string): boolean {
  if (q.type !== 'mc') return false;
  if (q.answer.toLocaleLowerCase('it') === form) return true;
  const f = escapeRegExp(form);
  return new RegExp(`(<b>|\\*\\*|«|")${f}(</b>|\\*\\*|»|")`, 'i').test(q.q.replace(/’/g, "'"));
}

/** Meningen ordet stod i, med ordet markerat. */
function sentenceHtml(sentence: Token[], key: string): string {
  return sentence
    .map((t) => {
      const text = escapeHtml(t.text);
      return (
        escapeHtml(t.pre) +
        (t.key === key ? `<b>${text}</b>` : text) +
        escapeHtml(t.post) +
        (t.space ? ' ' : '')
      );
    })
    .join('')
    .trim();
}

/** En fråga byggd ur ordlistan: ordet i sin mening, betydelsen bland tre andra ur samma pelare. */
function contextQuestion(
  word: OpenWord,
  lexicon: Readonly<Record<string, LexEntry>>,
): McQuestion | null {
  // Felsvaren tas helst ur samma pelare — då liknar de det rätta svaret till sin sort.
  const entries = shuffle(Object.values(lexicon)).filter((e) => e.sv !== word.entry.sv);
  const others = new Set<string>();
  for (const entry of [
    ...entries.filter((e) => e.p === word.entry.p),
    ...entries.filter((e) => e.p !== word.entry.p),
  ]) {
    others.add(entry.sv);
    if (others.size === 3) break;
  }
  if (others.size < 3) return null;
  return {
    type: 'mc',
    tag: 'ripasso',
    kind: 'Vad betyder det markerade?',
    q: sentenceHtml(word.sentence, word.key),
    options: [word.entry.sv, ...others],
    answer: word.entry.sv,
    // Förklaringen ritas som HTML, och posten kan komma från en text utifrån.
    explain: escapeHtml(
      `«${word.key}» = ${word.entry.sv}.${word.entry.note ? ' ' + word.entry.note : ''}`,
    ),
    _k: `ripasso_${word.key}`,
    statKey: '',
  };
}

/** En fråga som följde med texten, i gymmets form. Den kom utifrån, så allt tvättas. */
function fromText(q: TextQuestion, n: number): McQuestion {
  return {
    type: 'mc',
    tag: 'ripasso',
    kind: 'Flerval',
    q: mdBold(escapeHtml(q.q)),
    options: q.options,
    answer: q.options[q.answer],
    explain: escapeHtml(q.explain),
    _k: `text_${q.form}_${n}`,
    statKey: '',
  };
}

/**
 * Väljer uppgifter efter det som skaver.
 *
 * Ord repeteras som ord, regler på nya ord. Ett uppslag i limmet eller orden (D1, D4) blir en
 * fråga på just det ordet: ur gymmet om det finns en, annars den som följde med texten,
 * annars byggd ur meningen där det stod. Ett uppslag i reglerna eller motorn (D2, D3) blir
 * en fråga på samma mönster i ett annat ord, eftersom det är mönstret som ska sitta: den
 * som följde med texten om det finns en, annars en ur mazzot för mönstret. Blir rundan kort
 * fylls den på med svaga punkter ur gymmets statistik.
 */
export function buildRipasso(input: RipassoInput, max = RIPASSO_MAX): RipassoItem[] {
  const decks = input.pillars.flatMap((p) => p.decks);
  const pool = (deckId: string) => decks.find((d) => d.deckId === deckId)?.pool ?? [];
  const all = decks.flatMap((d) => d.pool);
  const deckOf = (q: Question) => q.statKey.split('::')[0];

  const used = new Set<string>();
  const perDeck = new Map<string, number>();
  const take = (candidates: Question[]): RipassoQuestion | null => {
    const q = shuffle(candidates).find(
      (c): c is RipassoQuestion =>
        isQuick(c) && !used.has(c._k) && (perDeck.get(deckOf(c)) ?? 0) < MAX_PER_DECK,
    );
    if (!q) return null;
    used.add(q._k);
    perDeck.set(deckOf(q), (perDeck.get(deckOf(q)) ?? 0) + 1);
    return q;
  };

  const items: RipassoItem[] = [];
  for (const word of input.open) {
    if (items.length >= max) break;
    const isPattern = word.entry.p === 'D2' || word.entry.p === 'D3';
    const lookedUp = `Du slog upp «${word.key}»`;
    const otherWord = `${lookedUp} — ${word.entry.p === 'D2' ? 'samma regel' : 'samma mönster'}, annat ord`;
    const own = shuffle(word.questions ?? [])[0];
    const ownItem = (): RipassoItem => ({
      question: fromText(own, word.questions!.indexOf(own)),
      wordKey: word.key,
      kind: isPattern ? 'rule' : 'word',
      source: 'text',
      why: isPattern ? otherWord : lookedUp,
    });

    if (isPattern) {
      // Textens egen fråga går på just den ändelsen eller regeln — närmare än ett helt mazzo.
      if (own) {
        items.push(ownItem());
        continue;
      }
      if (word.entry.deck) {
        const candidates = pool(word.entry.deck);
        // Helst ett annat ord än det uppslagna — annars prövas minnet, inte mönstret.
        const question = take(candidates.filter((q) => !targets(q, word.key))) ?? take(candidates);
        if (question) {
          items.push({ question, wordKey: word.key, kind: 'rule', source: 'gym', why: otherWord });
          continue;
        }
      }
    }

    const gym = take(all.filter((q) => targets(q, word.key)));
    if (gym) {
      items.push({ question: gym, wordKey: word.key, kind: 'word', source: 'gym', why: lookedUp });
      continue;
    }
    if (own) {
      items.push(ownItem());
      continue;
    }
    const question = contextQuestion(word, input.lexicon);
    if (question) {
      items.push({ question, wordKey: word.key, kind: 'word', source: 'context', why: lookedUp });
    }
  }

  let weak = 0;
  for (const { statKey, label } of input.weak) {
    if (items.length >= max || weak >= MAX_WEAK) break;
    const question = take(all.filter((q) => q.statKey === statKey));
    if (question) {
      items.push({
        question,
        wordKey: null,
        kind: 'weak',
        source: 'gym',
        why: `Svag punkt i gymmet: ${label}`,
      });
      weak++;
    }
  }

  return shuffle(items);
}
