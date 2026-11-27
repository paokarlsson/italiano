import { LexEntry, StoryData, StoryItem, StoryPage } from '../models/leggi.models';

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

/** Allt i följetongen i läsordning: kapitlets sidor, sedan dess låtar. */
export function storyItems(story: StoryData | null): StoryItem[] {
  if (!story) return [];
  return story.chapters.flatMap((chapter) => [
    ...chapter.pages.map((page) => ({ kind: 'page' as const, id: page.id, chapter, page })),
    ...chapter.songs.map((song) => ({ kind: 'song' as const, id: song.id, chapter, song })),
  ]);
}

/** Kapitlets namn som det visas: «Prolog» eller «3 · Le prime parole». */
export function chapterLabel(chapter: { n: number; title: string }): string {
  return chapter.n === 0 ? 'Prolog' : `${chapter.n} · ${chapter.title}`;
}
