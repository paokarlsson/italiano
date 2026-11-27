import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BookReview,
  StoryData,
  StoryItem,
  StoryPage,
  StorySong,
  UserText,
} from '../models/leggi.models';
import { StorageService } from './storage.service';
import { storyItems } from './story';

const STORY_KEY = 'it_companion_story_v1';
/** Böckerna läsaren själv har beställt av Claude. */
const BOOKS_KEY = 'it_companion_books_v1';
/** Följetongerna som följer med appen, i läsordning. */
const STORY_URLS = [
  'data/storie/valigia-blu.json',
  'data/storie/cane-di-nessuno.json',
  'data/storie/ciao-bella.json',
  'data/storie/alba-luca.json',
];

interface StoredStory {
  /** Sidor som Claude skrivit om åt läsaren, per sid-id. */
  adapted?: Record<string, UserText>;
  /** Sidor där omskrivningen inte höll — de läses som de är. */
  failed?: string[];
  /** Läsarens omdömen om böckerna, per bok-id. */
  reviews?: Record<string, BookReview>;
}

/**
 * Följetongerna som följer med appen: sidorna och låtarna som de står, och de sidor som
 * Claude har skrivit om åt läsaren. Utan nyckel finns bara de förra, och det räcker.
 */
@Injectable({ providedIn: 'root' })
export class StoryStore {
  private readonly storage = inject(StorageService);

  private readonly _stories = signal<readonly StoryData[]>([]);
  private readonly _books = signal<readonly StoryData[]>([]);
  private readonly _adapted = signal<Record<string, UserText>>({});
  private readonly _failed = signal<ReadonlySet<string>>(new Set());
  private readonly _reviews = signal<Record<string, BookReview>>({});
  /** Läsarens omdömen om böckerna, per bok-id. */
  readonly reviews = this._reviews.asReadonly();
  private readonly canon = new Map<string, Promise<string>>();

  /** Följetongerna, i läsordning: de som följer med appen, sedan de egna böckerna. */
  readonly stories = computed(() => [...this._stories(), ...this._books()]);
  /** De egna böckerna, den senaste först. */
  readonly books = computed(() => [...this._books()].reverse());
  readonly adapted = this._adapted.asReadonly();
  readonly failed = this._failed.asReadonly();
  /** Sidan som är öppen just nu — den skrivs inte om under läsningen. */
  readonly reading = signal<string | null>(null);
  /** Allt i alla följetonger: per följetong kapitlets sidor, sedan dess låtar. */
  readonly items = computed(() => this.stories().flatMap(storyItems));
  private readonly index = computed(() => new Map(this.items().map((item) => [item.id, item])));

  async load(): Promise<void> {
    const [stories, raw, books] = await Promise.all([
      Promise.all(STORY_URLS.map((url) => this.fetchStory(url))),
      this.storage.get(STORY_KEY),
      this.storage.get(BOOKS_KEY),
    ]);
    this.hydrate(stories.filter((s): s is StoryData => !!s));
    try {
      const own = JSON.parse(books ?? '[]') as StoryData[];
      if (Array.isArray(own)) this._books.set(own.filter((b) => b?.id && b.own));
    } catch {
      /* trasig data ignoreras */
    }
    try {
      const stored = JSON.parse(raw ?? '{}') as StoredStory;
      this._adapted.set(stored.adapted ?? {});
      this._failed.set(new Set(stored.failed ?? []));
      this._reviews.set(stored.reviews ?? {});
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Lägger in följetongerna. Anropas av load() — och direkt av tester. */
  hydrate(stories: readonly StoryData[]): void {
    this._stories.set(stories);
  }

  /** Omdömet om en bok, om läsaren har gett ett. */
  review(id: string): BookReview | null {
    return this._reviews()[id] ?? null;
  }

  /** Sparar läsarens omdöme: 1–5 stjärnor och en rad. */
  setReview(id: string, stars: number, note: string): void {
    const review: BookReview = {
      stars: Math.min(5, Math.max(1, Math.round(stars))),
      note: note.trim().slice(0, 280),
      at: Date.now(),
    };
    this._reviews.update((all) => ({ ...all, [id]: review }));
    this.save();
  }

  /** En egen bok, efter id. */
  book(id: string): StoryData | undefined {
    return this._books().find((b) => b.id === id);
  }

  /** Lägger in eller ersätter en egen bok och sparar den. */
  saveBook(book: StoryData): void {
    this._books.update((all) =>
      all.some((b) => b.id === book.id)
        ? all.map((b) => (b.id === book.id ? book : b))
        : [...all, book],
    );
    void this.storage.set(BOOKS_KEY, JSON.stringify(this._books()));
  }

  removeBook(id: string): void {
    this._books.update((all) => all.filter((b) => b.id !== id));
    void this.storage.set(BOOKS_KEY, JSON.stringify(this._books()));
  }

  /** En följetongs sidor och låtar i läsordning. */
  itemsOf(story: StoryData): StoryItem[] {
    return this.items().filter((item) => item.story === story);
  }

  item(id: string): StoryItem | undefined {
    return this.index().get(id);
  }

  page(id: string): StoryPage | undefined {
    const item = this.item(id);
    return item?.kind === 'page' ? item.page : undefined;
  }

  song(id: string): StorySong | undefined {
    const item = this.item(id);
    return item?.kind === 'song' ? item.song : undefined;
  }

  /** Det som kommer efter en plats i följetongen, eller null efter dess sista. */
  after(id: string): StoryItem | null {
    const item = this.item(id);
    if (!item) return null;
    const items = this.itemsOf(item.story);
    return items[items.indexOf(item) + 1] ?? null;
  }

  /** Den omskrivna sidan, om det finns en. */
  adaptation(id: string): UserText | undefined {
    return this._adapted()[id];
  }

  setAdapted(id: string, text: UserText): void {
    this._adapted.update((all) => ({ ...all, [id]: { ...text, id } }));
    this.save();
  }

  /** Omskrivningen höll inte — sidan läses som den är, och ingen ny beställs. */
  markFailed(id: string): void {
    this._failed.update((set) => new Set(set).add(id));
    this.save();
  }

  /** En följetongs kanon — världen och handlingen — som en text att ge Claude. Hämtas en gång. */
  loadCanon(story: StoryData): Promise<string> {
    let canon = this.canon.get(story.id);
    if (!canon) {
      canon = Promise.all(
        (story.canon ?? []).map(async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Kunde inte läsa ${url} (${res.status})`);
          return res.text();
        }),
      )
        .then((parts) => parts.join('\n\n'))
        .catch((e) => {
          this.canon.delete(story.id);
          throw e;
        });
      this.canon.set(story.id, canon);
    }
    return canon;
  }

  /** En följetong är ett tillägg — saknas den läser appen vidare utan. */
  private async fetchStory(url: string): Promise<StoryData | null> {
    try {
      const res = await fetch(url);
      return res.ok ? ((await res.json()) as StoryData) : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    const stored: StoredStory = {
      adapted: this._adapted(),
      failed: [...this._failed()],
      reviews: this._reviews(),
    };
    void this.storage.set(STORY_KEY, JSON.stringify(stored));
  }
}
