import { computed, inject, Injectable, signal } from '@angular/core';
import {
  Lettura,
  LettureData,
  LexEntry,
  LeggiProgress,
  ReadSummary,
  Token,
} from '../models/leggi.models';
import { StorageService } from './storage.service';
import { tokenize } from './tokenize';

const LEGGI_KEY = 'it_companion_leggi_v1';

const EMPTY: LeggiProgress = { texts: {}, words: {} };

/**
 * Läsningen: texterna, ordlistan och vad som hänt med varje ord.
 *
 * Ett uppslag är inget fel — det är bara det enda appen behöver veta. Ett ord som slogs upp
 * är «öppet» tills det står i en text och läses utan hjälp.
 */
@Injectable({ providedIn: 'root' })
export class LeggiService {
  private readonly storage = inject(StorageService);

  private readonly _texts = signal<Lettura[]>([]);
  private readonly _progress = signal<LeggiProgress>(EMPTY);
  private lexicon: Record<string, LexEntry> = {};
  private readonly tokenCache = new Map<string, Token[][]>();

  readonly texts = this._texts.asReadonly();
  readonly progress = this._progress.asReadonly();

  /** Antal lästa texter. */
  readonly readCount = computed(
    () => this._texts().filter((t) => this._progress().texts[t.id]).length,
  );

  /** Andel av alla lästa ord som lästes utan uppslag, 0–100 — eller null innan något är läst. */
  readonly own = computed(() => {
    let words = 0;
    let looked = 0;
    for (const r of Object.values(this._progress().texts)) {
      words += r.words;
      looked += r.looked;
    }
    return words ? Math.round((1 - looked / words) * 100) : null;
  });

  /** Ord som slogs upp senast de stod i en text. */
  readonly openWords = computed(() =>
    Object.entries(this._progress().words)
      .filter(([, w]) => w.open)
      .map(([key]) => key),
  );

  /**
   * Nästa text: den första olästa. När allt är läst — den med flest öppna ord,
   * och vid lika den som lästes för längst sedan.
   */
  readonly next = computed<Lettura | null>(() => {
    const texts = this._texts();
    const read = this._progress().texts;
    const unread = texts.find((t) => !read[t.id]);
    if (unread) return unread;
    const open = new Set(this.openWords());
    let best: Lettura | null = null;
    let bestOpen = -1;
    for (const t of texts) {
      const n = this.keys(t.id).filter((k) => open.has(k)).length;
      if (n > bestOpen || (n === bestOpen && best && read[t.id].at < read[best.id].at)) {
        best = t;
        bestOpen = n;
      }
    }
    return best;
  });

  async load(): Promise<void> {
    const res = await fetch('data/letture.json');
    if (!res.ok) throw new Error(`Kunde inte läsa letture.json (${res.status})`);
    this.hydrate((await res.json()) as LettureData);

    const raw = await this.storage.get(LEGGI_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<LeggiProgress>;
      this._progress.set({ texts: parsed.texts ?? {}, words: parsed.words ?? {} });
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Lägger in texter och ordlista. Anropas av load() — och direkt av tester. */
  hydrate(data: LettureData): void {
    this.lexicon = data.lexicon;
    this.tokenCache.clear();
    this._texts.set(data.texts);
  }

  text(id: string): Lettura | undefined {
    return this._texts().find((t) => t.id === id);
  }

  /** Textens plats i ordningen, från 1. */
  number(id: string): number {
    return this._texts().findIndex((t) => t.id === id) + 1;
  }

  isRead(id: string): boolean {
    return !!this._progress().texts[id];
  }

  /** Texten delad i meningar och uppslagbara bitar. */
  tokens(id: string): Token[][] {
    let cached = this.tokenCache.get(id);
    if (!cached) {
      const text = this.text(id);
      cached = text ? text.sentences.map((s) => tokenize(s.it, this.lexicon)) : [];
      this.tokenCache.set(id, cached);
    }
    return cached;
  }

  /** Bokför en läst text: vilka ord som stod i den och vilka av dem som slogs upp. */
  complete(id: string, looked: ReadonlySet<string>): ReadSummary {
    const keys = this.keys(id);
    const distinct = [...new Set(keys)];
    const before = this._progress().words;

    const lookedKeys = distinct.filter((k) => looked.has(k));
    const settledKeys = distinct.filter((k) => before[k]?.open && !looked.has(k));
    const lookedCount = keys.filter((k) => looked.has(k)).length;

    this._progress.update((prev) => {
      const words = { ...prev.words };
      for (const k of distinct) {
        const w = words[k] ?? { seen: 0, looked: 0, open: false };
        const hit = looked.has(k);
        words[k] = { seen: w.seen + 1, looked: w.looked + (hit ? 1 : 0), open: hit };
      }
      const texts = {
        ...prev.texts,
        [id]: {
          at: Date.now(),
          words: keys.length,
          looked: lookedCount,
          times: (prev.texts[id]?.times ?? 0) + 1,
        },
      };
      return { texts, words };
    });
    void this.storage.set(LEGGI_KEY, JSON.stringify(this._progress()));

    return {
      words: keys.length,
      looked: lookedCount,
      own: keys.length ? Math.round((1 - lookedCount / keys.length) * 100) : 100,
      lookedKeys,
      settledKeys,
    };
  }

  reset(): void {
    this._progress.set(EMPTY);
    void this.storage.set(LEGGI_KEY, JSON.stringify(EMPTY));
  }

  /** Alla uppslagbara bitar i texten, i ordning och med upprepningar. */
  private keys(id: string): string[] {
    return this.tokens(id)
      .flat()
      .flatMap((t) => (t.key ? [t.key] : []));
  }
}
