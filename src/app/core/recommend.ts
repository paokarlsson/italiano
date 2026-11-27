import { Deck, Pillar, Question, StatsData, TagStat } from '../models/quiz.models';
import { tagLabel } from './tag-labels';

/**
 * Vad som är värt att öva härnäst, och vilka mazzi som behöver fler frågor. Rena funktioner
 * över det appen redan vet: uppslagen under läsningen och träffsäkerheten i gymmet.
 */

/** En tagg räknas som svag under 60 % efter minst tre försök — samma gräns som i statistiken. */
const WEAK_ACC = 0.6;
const WEAK_ATTEMPTS = 3;
/** Över det här, efter minst sex försök och utan svaga taggar, sitter mazzot. */
const SITS_ACC = 0.85;
const SITS_ATTEMPTS = 6;
/** Så mycket väger ett uppslag i texterna respektive en svag tagg i gymmet. */
const LOOKUP_WEIGHT = 2;
const LOOKUP_CAP = 6;
const WEAK_WEIGHT = 3;
const WEAK_CAP = 3;
/** Ett mazzo som redan sitter sjunker undan, hur många uppslag det än har. */
const SITS_FACTOR = 0.25;

export interface Recommendation {
  deckId: string;
  title: string;
  hint: string;
  pillarTitle: string;
  /** Varför just det här — en kort rad per skäl. */
  reasons: string[];
  score: number;
}

export interface RecommendInput {
  pillars: readonly Pillar[];
  /** Uppslag i texterna per mazzo — se LeggiService.profile(). */
  lookups: readonly { deckId: string; looked: number }[];
  stats: StatsData;
}

interface DeckStats {
  attempts: number;
  correct: number;
  lastSeen: number;
  weak: { tag: string; acc: number }[];
}

const isQuick = (q: Question) => q.type !== 'match';

/** Mazzots träffsäkerhet, räknad på flerval och sant/falskt — det som går att bygga ut. */
export function deckStats(deck: Deck, tags: Record<string, TagStat>): DeckStats {
  const out: DeckStats = { attempts: 0, correct: 0, lastSeen: 0, weak: [] };
  for (const key of new Set(deck.pool.filter(isQuick).map((q) => q.statKey))) {
    const s = tags[key];
    if (!s?.attempts) continue;
    out.attempts += s.attempts;
    out.correct += s.correct;
    out.lastSeen = Math.max(out.lastSeen, s.lastSeen ?? 0);
    const acc = s.correct / s.attempts;
    if (s.attempts >= WEAK_ATTEMPTS && acc < WEAK_ACC) {
      out.weak.push({ tag: key.split('::')[1], acc });
    }
  }
  out.weak.sort((a, b) => a.acc - b.acc);
  return out;
}

/**
 * Mazzin värda att satsa på, viktigast först. Två saker talar för ett mazzo: att läsaren
 * slår upp former som hör dit, och att en tagg i det går trögt i gymmet. Ett mazzo som
 * redan sitter sjunker undan. Finns inget som talar för något föreslås det första som
 * inte är klarat, så att det alltid finns en väg vidare.
 */
export function recommend(input: RecommendInput, max = 3): Recommendation[] {
  const lookups = new Map(input.lookups.map((l) => [l.deckId, l.looked]));
  const out: Recommendation[] = [];

  for (const pillar of input.pillars) {
    for (const deck of pillar.decks) {
      const looked = lookups.get(deck.deckId) ?? 0;
      const s = deckStats(deck, input.stats.tags);
      let score =
        LOOKUP_WEIGHT * Math.min(looked, LOOKUP_CAP) +
        WEAK_WEIGHT * Math.min(s.weak.length, WEAK_CAP);
      if (!score) continue;

      const sits =
        !s.weak.length && s.attempts >= SITS_ATTEMPTS && s.correct / s.attempts >= SITS_ACC;
      if (sits) score *= SITS_FACTOR;

      const reasons: string[] = [];
      if (looked) reasons.push(`${looked} uppslag i texterna hör hit`);
      for (const w of s.weak.slice(0, 2)) {
        reasons.push(`«${tagLabel(w.tag)}» ligger på ${Math.round(w.acc * 100)} % i gymmet`);
      }
      if (!s.attempts) reasons.push('inte övat än');
      else if (sits) reasons.push('sitter i gymmet, men inte i läsningen');

      out.push({
        deckId: deck.deckId,
        title: deck.title,
        hint: deck.hint,
        pillarTitle: pillar.pillarTitle,
        reasons,
        score,
      });
    }
  }
  if (out.length) return out.sort((a, b) => b.score - a.score).slice(0, max);

  for (const pillar of input.pillars) {
    const deck = pillar.decks.find((d) => !input.stats.deckDone[d.deckId]);
    if (deck) {
      return [
        {
          deckId: deck.deckId,
          title: deck.title,
          hint: deck.hint,
          pillarTitle: pillar.pillarTitle,
          reasons: ['nästa mazzo du inte har klarat'],
          score: 0,
        },
      ];
    }
  }
  return [];
}

/**
 * Så många gånger sin egen storlek ett mazzo ska ha övats innan det räknas som uttömt —
 * och, när det väl är utbyggt, den senaste påbyggnaden.
 */
const EXHAUSTED = 1.5;
/** Så många frågor en påbyggnad ungefär ger — se EXTEND_COUNT i ai-deck.ts. */
const BATCH = 8;
/** Bara mazzin som övats nyligen byggs ut — äldre än så är ingen på väg tillbaka till. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
/** Tak för hur många frågor som skrivs till ett och samma mazzo. */
export const MAX_EXTRA = 40;

/**
 * Mazzin som behöver fler frågor, senast övade först. Behovet finns när läsaren har gått
 * igenom mazzot så många gånger att frågorna känns igen, fortfarande övar på det, och det
 * ändå inte sitter. Ett mazzo som sitter får vara ifred.
 *
 * `marks` är hur många gånger mazzot hade övats när det senast byggdes ut. Därifrån räknas
 * nästa behov, så att en lång historia inte ger flera påbyggnader i rad.
 */
export function decksToExtend(
  pillars: readonly Pillar[],
  tags: Record<string, TagStat>,
  extras: Readonly<Record<string, readonly Question[]>>,
  marks: Readonly<Record<string, number>> = {},
  now = Date.now(),
): string[] {
  const out: { deckId: string; lastSeen: number }[] = [];
  for (const deck of pillars.flatMap((p) => p.decks)) {
    const quick = deck.pool.filter(isQuick).length;
    if (!quick || (extras[deck.deckId]?.length ?? 0) >= MAX_EXTRA) continue;
    const s = deckStats(deck, tags);
    const mark = marks[deck.deckId];
    const since = s.attempts - (mark ?? 0);
    if (
      since >= (mark === undefined ? quick : BATCH) * EXHAUSTED &&
      s.correct / s.attempts < SITS_ACC &&
      now - s.lastSeen < RECENT_MS
    ) {
      out.push({ deckId: deck.deckId, lastSeen: s.lastSeen });
    }
  }
  return out.sort((a, b) => b.lastSeen - a.lastSeen).map((d) => d.deckId);
}
