import { Sentence } from '../models/leggi.models';
import { level as levelOf } from './levels';

/**
 * Kontrollen av en sida i följetongen: längden, att meningarna ryms på nivån, att de låsta
 * replikerna står kvar, och tydliga tecken på tempus som nivån inte har kommit till än.
 * Samma kontroll gäller sidorna som följer med appen (se story.spec.ts) och sidorna Claude
 * skriver om åt läsaren. Grammatiken går inte att kontrollera helt — det här fångar det
 * uppenbara.
 */

export interface PageShape {
  chapter: number;
  level: number;
  sentences: readonly Sentence[];
  locked?: readonly string[];
  question?: { sv: string; options: readonly string[]; answer: number };
}

export interface CheckOptions {
  /** Flest ord per mening — nivåns tak om inget annat sägs. */
  maxWords?: number;
  /** Former som ser ut som ett tempus men inte är det: «bravo», «chiavi». */
  allow?: ReadonlySet<string>;
}

/** Ord som liknar en tempusändelse utan att vara en. */
export const NOT_A_TENSE: ReadonlySet<string> = new Set([
  'bravo',
  'brava',
  'bravi',
  'brave',
  'ottavo',
  'chiavi',
  'lava',
  'lavo',
  'lavi',
  'salva',
  'salvo',
  'cava',
  'rete',
  'parete',
  'estremo',
  'remo',
  'segrete',
  'subito',
  'foreste',
  'però',
]);

const words = (it: string) =>
  it
    .replace(/’/g, "'")
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));

/** Bara bokstäver, apostrofer och enkla mellanslag, i gemener — för att jämföra repliker. */
export const plainText = (s: string) =>
  ` ${s
    .replace(/’/g, "'")
    .toLocaleLowerCase('it')
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()} `;

/** Antal ord i en mening, räknat som läsaren ser dem: «l'amico» är ett ord. */
export function wordCount(it: string): number {
  return words(it).length;
}

/** De låsta repliker som inte står i texten. */
export function lockedMissing(sentences: readonly Sentence[], locked: readonly string[]): string[] {
  const text = plainText(sentences.map((s) => s.it).join(' '));
  return locked.filter((line) => !text.includes(plainText(line)));
}

const FORMS = (sentence: string) =>
  words(sentence).map((w) => w.toLocaleLowerCase('it').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''));

const FUTURE = /(erò|erai|erà|eremo|erete|eranno|irò|irai|irà|iremo|irete|iranno|rò|rai|rà|ranno)$/;
const CONDITIONAL = /(rei|resti|rebbe|remmo|reste|rebbero)$/;
/** -ire-formerna (-ivo, -ivano) liknar presens av «arrivare» och lämnas därhän. */
const IMPERFECT = /(avo|avi|ava|avamo|avate|avano|evo|evi|eva|evamo|evate|evano)$/;
const IMPERFECT_ESSERE = new Set(['ero', 'eri', 'era', 'eravamo', 'eravate', 'erano']);
const AUX = new Set([
  'ho',
  'hai',
  'ha',
  'abbiamo',
  'avete',
  'hanno',
  'sono',
  'sei',
  'è',
  'siamo',
  'siete',
]);
const COMMON_PARTICIPLES = new Set([
  'stato',
  'stata',
  'fatto',
  'fatta',
  'detto',
  'detta',
  'visto',
  'vista',
  'preso',
  'presa',
  'messo',
  'messa',
  'scritto',
  'letto',
  'aperto',
  'aperta',
  'chiuso',
  'chiusa',
  'perso',
  'persa',
  'venuto',
  'venuta',
  'rimasto',
  'rimasta',
  'nato',
  'nata',
  'morto',
  'morta',
  'successo',
  'risposto',
  'chiesto',
  'vissuto',
  'bevuto',
  'conosciuto',
  'conosciuta',
]);

/**
 * Former som hör till ett tempus nivån inte har kommit till: futurum och konditionalis före
 * nivå 6, imperfetto före nivå 5, passato prossimo före nivå 4.
 */
export function tenseFlags(
  sentences: readonly Sentence[],
  level: number,
  allow: ReadonlySet<string> = NOT_A_TENSE,
): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    const forms = FORMS(s.it);
    forms.forEach((w, i) => {
      if (!w || allow.has(w)) return;
      if (level < 6 && w.length > 3 && (FUTURE.test(w) || CONDITIONAL.test(w))) {
        out.push(`«${w}» ser ut som futurum eller konditionalis (nivå 6)`);
      } else if (level < 5 && (IMPERFECT_ESSERE.has(w) || (w.length > 4 && IMPERFECT.test(w)))) {
        out.push(`«${w}» ser ut som imperfetto (nivå 5)`);
      } else if (level < 4 && AUX.has(w)) {
        const next = forms[i + 1];
        const between = forms[i + 2];
        const participle = (x?: string) =>
          !!x &&
          !allow.has(x) &&
          (COMMON_PARTICIPLES.has(x) || /(ato|ata|ati|ate|uto|uta|uti|ute|ito|iti)$/.test(x));
        if (
          participle(next) ||
          (next && ['già', 'mai', 'sempre', 'appena'].includes(next) && participle(between))
        ) {
          out.push(
            `«${w} ${participle(next) ? next : `${next} ${between}`}» ser ut som passato prossimo (nivå 4)`,
          );
        }
      }
    });
  }
  return out;
}

/** Allt som är fel med en sida, som rader att visa. Tom lista när sidan håller. */
export function checkPage(page: PageShape, opts: CheckOptions = {}): string[] {
  const problems: string[] = [];
  const n = page.sentences.length;
  const min = page.chapter === 0 ? 5 : 6;
  if (n < min || n > 8) problems.push(`${n} meningar — ska vara ${min}–8`);

  const max = opts.maxWords ?? levelOf(page.level).maxWords;
  for (const s of page.sentences) {
    const count = wordCount(s.it);
    if (count > max) problems.push(`${count} ord, taket är ${max}: ${s.it}`);
    if (!s.sv?.trim()) problems.push(`ingen svenska: ${s.it}`);
  }

  for (const line of lockedMissing(page.sentences, page.locked ?? [])) {
    problems.push(`den låsta repliken saknas: ${line}`);
  }
  problems.push(...tenseFlags(page.sentences, page.level, opts.allow ?? NOT_A_TENSE));

  const q = page.question;
  if (q) {
    if (!q.sv.trim()) problems.push('frågan saknas');
    if (q.options.length !== 3)
      problems.push(`frågan har ${q.options.length} alternativ, ska ha 3`);
    if (new Set(q.options).size !== q.options.length) problems.push('två svarsalternativ är lika');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
      problems.push('facit pekar utanför alternativen');
    }
  }
  return problems;
}
