import { computed, inject, Injectable, signal } from '@angular/core';
import { StoryData, StoryItem, StoryPage, StorySong, UserText } from '../models/leggi.models';
import { StorageService } from './storage.service';
import { storyItems } from './story';

const STORY_KEY = 'it_companion_story_v1';
const STORY_URL = 'data/storie/alba-luca.json';
const CANON_URLS = ['data/storie/alba-luca/varld.md', 'data/storie/alba-luca/handling.md'];

interface StoredStory {
  /** Sidor som Claude skrivit om åt läsaren, per sid-id. */
  adapted?: Record<string, UserText>;
  /** Sidor där omskrivningen inte höll — de läses som de är. */
  failed?: string[];
}

/**
 * Följetongen som följer med appen: sidorna och låtarna som de står, och de sidor som
 * Claude har skrivit om åt läsaren. Utan nyckel finns bara de förra, och det räcker.
 */
@Injectable({ providedIn: 'root' })
export class StoryStore {
  private readonly storage = inject(StorageService);

  private readonly _data = signal<StoryData | null>(null);
  private readonly _adapted = signal<Record<string, UserText>>({});
  private readonly _failed = signal<ReadonlySet<string>>(new Set());
  private canon: Promise<string> | null = null;

  readonly data = this._data.asReadonly();
  readonly adapted = this._adapted.asReadonly();
  readonly failed = this._failed.asReadonly();
  /** Sidan som är öppen just nu — den skrivs inte om under läsningen. */
  readonly reading = signal<string | null>(null);
  /** Allt i läsordning: kapitlets sidor, sedan dess låtar. */
  readonly items = computed(() => storyItems(this._data()));
  private readonly index = computed(() => new Map(this.items().map((item) => [item.id, item])));

  async load(): Promise<void> {
    const [res, raw] = await Promise.all([
      fetch(STORY_URL).catch(() => null),
      this.storage.get(STORY_KEY),
    ]);
    // Berättelsen är ett tillägg — saknas den läser appen vidare utan.
    if (res?.ok) this.hydrate((await res.json()) as StoryData);
    try {
      const stored = JSON.parse(raw ?? '{}') as StoredStory;
      this._adapted.set(stored.adapted ?? {});
      this._failed.set(new Set(stored.failed ?? []));
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Lägger in berättelsen. Anropas av load() — och direkt av tester. */
  hydrate(data: StoryData | null): void {
    this._data.set(data);
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

  /** Det som kommer efter en plats i följetongen, eller null efter den sista. */
  after(id: string): StoryItem | null {
    const items = this.items();
    const i = items.findIndex((item) => item.id === id);
    return i >= 0 ? (items[i + 1] ?? null) : null;
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

  /** Kanon — världen och handlingen — som en text att ge Claude. Hämtas en gång. */
  loadCanon(): Promise<string> {
    this.canon ??= Promise.all(
      CANON_URLS.map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kunde inte läsa ${url} (${res.status})`);
        return res.text();
      }),
    )
      .then((parts) => parts.join('\n\n'))
      .catch((e) => {
        this.canon = null;
        throw e;
      });
    return this.canon;
  }

  private save(): void {
    const stored: StoredStory = { adapted: this._adapted(), failed: [...this._failed()] };
    void this.storage.set(STORY_KEY, JSON.stringify(stored));
  }
}
