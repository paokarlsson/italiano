import { Lettura, Sentence, Voice } from '../models/leggi.models';
import { clipText } from './audio-pack';

/**
 * Vem som säger vad. En mening delas i det berättaren läser och replikerna inom «…», och
 * varje del får den röst som passar den som talar. Varje del blir ett eget klipp.
 */

/** Rösten som läser orden i uppslaget. */
export const WORD_VOICE: Voice = 'f';
/** Rösten som läser det som står utanför replikerna, när texten inte säger något annat. */
export const DEFAULT_NARRATOR: Voice = 'f';

export interface Part {
  /** Texten som läses, i den form klipp slås upp på. */
  text: string;
  voice: Voice;
}

const QUOTE = /«([^«»]*)»/g;
const hasLetter = (s: string) => /\p{L}/u.test(s);
/** Det som står mellan replikerna: utan skiljetecken och blanksteg i kanterna. */
const between = (s: string) => s.replace(/^[\s,;:.!?—–-]+/u, '').trim();

/** Antalet repliker inom «…» i en mening. */
export function quoteCount(it: string): number {
  return [...it.matchAll(QUOTE)].length;
}

/** Delar en mening i det berättaren läser och replikerna, med rätt röst på varje. */
export function parts(sentence: Sentence, narrator: Voice = DEFAULT_NARRATOR): Part[] {
  const out: Part[] = [];
  const push = (text: string, voice: Voice) => {
    const normal = clipText(text);
    if (hasLetter(normal)) out.push({ text: normal, voice });
  };
  let at = 0;
  let n = 0;
  for (const m of sentence.it.matchAll(QUOTE)) {
    push(between(sentence.it.slice(at, m.index)), narrator);
    push(m[1], sentence.speakers?.[n] ?? narrator);
    n++;
    at = m.index + m[0].length;
  }
  push(between(sentence.it.slice(at)), narrator);
  return out;
}

/** Alla delar i en text, mening för mening. */
export function textParts(text: Lettura): Part[][] {
  return text.sentences.map((s) => parts(s, text.narrator ?? DEFAULT_NARRATOR));
}

/** Sant om rösterna stämmer med replikerna: en röst per replik, och bara «f» eller «m». */
export function speakersFit(sentence: Sentence): boolean {
  const speakers = sentence.speakers ?? [];
  return (
    (speakers.length === 0 || speakers.length === quoteCount(sentence.it)) &&
    speakers.every((v) => v === 'f' || v === 'm')
  );
}
