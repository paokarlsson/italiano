import { Lettura, LexEntry, StoryData, StoryItem, StoryPage } from '../models/leggi.models';

/**
 * Följetongen som följer med appen — rena funktioner över dess data. Själva läsningen och
 * det som sparas ligger i LeggiService och StoryStore.
 */

/**
 * Ordlistan en sida läses med: appens, berättelsens ovanpå, och sidans egna poster överst —
 * så att en sida kan förklara «la» som pronomen där resten läser den som artikel.
 */
export function storyLexicon(
  base: Readonly<Record<string, LexEntry>>,
  story: Pick<StoryData, 'lexicon'>,
  page: Pick<StoryPage, 'lexicon'>,
): Record<string, LexEntry> {
  return { ...base, ...story.lexicon, ...(page.lexicon ?? {}) };
}

/** Allt i en följetong i läsordning: kapitlets sidor, sedan dess låtar. */
export function storyItems(story: StoryData | null): StoryItem[] {
  if (!story) return [];
  return story.chapters.flatMap((chapter) => [
    ...chapter.pages.map((page) => ({ kind: 'page' as const, id: page.id, story, chapter, page })),
    ...chapter.songs.map((song) => ({ kind: 'song' as const, id: song.id, story, chapter, song })),
  ]);
}

/** En plats i läsordningen: en inbyggd text, eller en sida eller låt i en följetong. */
export type PathItem = { kind: 'text'; id: string; text: Lettura } | StoryItem;

/**
 * Läsordningen: grundkursen med de följetonger som läses varvat med den, sedan de andra
 * följetongerna. En sida i grundkursens följetong kommer efter grundkursens texter på
 * samma nivå och före den första på en högre; en låt följer sidan före. Nivån räknas som
 * den högsta så långt i berättelsen, så att den aldrig hamnar i oordning.
 */
export function readingPath(texts: readonly Lettura[], stories: readonly StoryData[]): PathItem[] {
  const slots: StoryItem[][] = texts.map(() => []);
  const tail: StoryItem[] = [];
  for (const story of stories.filter((s) => s.course)) {
    let level = 0;
    for (const item of storyItems(story)) {
      if (item.kind === 'page') level = Math.max(level, item.page.level);
      const at = texts.findIndex((t) => (t.level ?? 1) > level);
      (at < 0 ? tail : slots[at]).push(item);
    }
  }
  return [
    ...texts.flatMap((text, i) => [...slots[i], { kind: 'text' as const, id: text.id, text }]),
    ...tail,
    ...stories.filter((s) => !s.course).flatMap(storyItems),
  ];
}

/** Kapitlets namn som det visas: «Prolog» eller «3 · Le prime parole». */
export function chapterLabel(chapter: { n: number; title: string }): string {
  return chapter.n === 0 ? 'Prolog' : `${chapter.n} · ${chapter.title}`;
}
