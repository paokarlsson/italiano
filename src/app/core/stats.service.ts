import { inject, Injectable, signal } from '@angular/core';
import { Deck, StatRow, StatsData } from '../models/quiz.models';
import { DataService } from './data.service';
import { StorageService } from './storage.service';

const STATS_KEY = 'it_companion_stats_v1';
const SAVE_DEBOUNCE_MS = 400;

/** Håller träffsäkerhet per tagg och vilka mazzi som är klarade. */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly storage = inject(StorageService);
  private readonly data = inject(DataService);

  private readonly _stats = signal<StatsData>({ tags: {}, deckDone: {} });
  readonly stats = this._stats.asReadonly();

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    const raw = await this.storage.get(STATS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<StatsData>;
      this._stats.set({ tags: parsed.tags ?? {}, deckDone: parsed.deckDone ?? {} });
    } catch {
      /* trasig data ignoreras */
    }
  }

  recordAnswer(statKey: string, isCorrect: boolean): void {
    this._stats.update((prev) => {
      const s = prev.tags[statKey] ?? { attempts: 0, correct: 0, last5: [], lastSeen: null };
      const last5 = [...s.last5, isCorrect].slice(-5);
      return {
        ...prev,
        tags: {
          ...prev.tags,
          [statKey]: {
            attempts: s.attempts + 1,
            correct: s.correct + (isCorrect ? 1 : 0),
            last5,
            lastSeen: Date.now(),
          },
        },
      };
    });
    this.scheduleSave();
  }

  markDeckDone(deckId: string): void {
    this._stats.update((prev) => ({ ...prev, deckDone: { ...prev.deckDone, [deckId]: true } }));
    this.scheduleSave();
  }

  isDeckDone(deckId: string): boolean {
    return !!this._stats().deckDone[deckId];
  }

  /** Ett mazzo är «svagt» om någon tagg ligger under 60 % efter minst tre försök. */
  deckHasWeakTag(deck: Deck): boolean {
    const tags = this._stats().tags;
    for (const key of new Set(deck.pool.map((q) => q.statKey))) {
      const s = tags[key];
      if (s && s.attempts >= 3 && s.correct / s.attempts < 0.6) return true;
    }
    return false;
  }

  reset(): void {
    this._stats.set({ tags: {}, deckDone: {} });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    void this.storage.set(STATS_KEY, JSON.stringify(this._stats()));
  }

  /** Alla övade taggar, svagast först. */
  rows(): StatRow[] {
    const tags = this._stats().tags;
    const rows: StatRow[] = [];
    for (const [key, s] of Object.entries(tags)) {
      const meta = this.data.meta(key);
      if (!meta || !s.attempts) continue;
      rows.push({ key, ...meta, ...s, acc: s.correct / s.attempts });
    }
    rows.sort((a, b) => a.acc - b.acc || b.attempts - a.attempts);
    return rows;
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.storage.set(STATS_KEY, JSON.stringify(this._stats()));
    }, SAVE_DEBOUNCE_MS);
  }
}
