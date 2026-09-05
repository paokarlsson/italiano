import { computed, inject, Injectable, signal } from '@angular/core';
import { QueuedQuestion, Question } from '../models/quiz.models';
import { DataService } from './data.service';
import { StatsService } from './stats.service';
import { pickRandom, shuffle } from './utils';

/** Så många extra repetitioner en och samma tagg kan få i en runda. */
const MAX_RETRIES_PER_TAG = 2;
/** Andel rätt som krävs för att ett mazzo ska räknas som klarat. */
const PASS_RATIO = 0.6;

export const ROUND_LENGTHS = [6, 8, 12] as const;

/** Övningsmotorn: bygger rundans kö, räknar poäng och skjuter in repetitioner. */
@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly data = inject(DataService);
  private readonly stats = inject(StatsService);

  private readonly _deckId = signal<string | null>(null);
  private readonly _desiredCount = signal(8);
  private readonly _queue = signal<QueuedQuestion[]>([]);
  private readonly _pos = signal(-1);
  private readonly _correct = signal(0);
  private readonly _asked = signal(0);
  private readonly _plannedCount = signal(0);

  private askedKeys = new Set<string>();
  private retryByTag: Record<string, number> = {};

  readonly deckId = this._deckId.asReadonly();
  readonly desiredCount = this._desiredCount.asReadonly();
  readonly queue = this._queue.asReadonly();
  readonly pos = this._pos.asReadonly();
  readonly correct = this._correct.asReadonly();
  readonly asked = this._asked.asReadonly();
  readonly plannedCount = this._plannedCount.asReadonly();

  readonly current = computed<QueuedQuestion | null>(() => this._queue()[this._pos()] ?? null);
  readonly isRetry = computed(() => !!this.current()?._retry);
  readonly isLast = computed(() => this._pos() >= this._queue().length - 1);
  readonly hasRepeats = computed(() => this._asked() > this._plannedCount());
  readonly deck = computed(() => {
    const id = this._deckId();
    return id ? (this.data.deck(id) ?? null) : null;
  });
  readonly pillar = computed(() => {
    const id = this._deckId();
    return id ? (this.data.pillarOf(id) ?? null) : null;
  });
  /** «Pelare · mazzo» till rubrikraden. */
  readonly stepLabel = computed(() => {
    const pillar = this.pillar();
    const deck = this.deck();
    return pillar && deck ? `${pillar.pillarTitle} · ${deck.deckId}` : '';
  });
  /** Sant när en runda har körts klart och resultatet kan visas. */
  readonly roundOver = computed(
    () => this._queue().length > 0 && this._pos() >= this._queue().length,
  );

  /** Väljer mazzo och nollställer rundan (utan att bygga kön ännu). */
  selectDeck(deckId: string): boolean {
    const deck = this.data.deck(deckId);
    if (!deck) return false;
    this._deckId.set(deckId);
    this._desiredCount.set(Math.min(8, deck.pool.length));
    this.resetRound();
    return true;
  }

  setDesiredCount(n: number): void {
    this._desiredCount.set(n);
  }

  /** Drar nya slumpade frågor ur mazzots pool och startar rundan. */
  begin(): void {
    const deck = this.deck();
    if (!deck) return;
    const n = Math.min(this._desiredCount(), deck.pool.length);
    this.resetRound();
    this._queue.set(shuffle(deck.pool).slice(0, n) as QueuedQuestion[]);
    this._plannedCount.set(n);
    this.advance();
  }

  /** Går till nästa fråga. Returnerar false när rundan är slut. */
  advance(): boolean {
    this._pos.update((p) => p + 1);
    const q = this.current();
    if (!q) {
      this.finishRound();
      return false;
    }
    this.askedKeys.add(q._k);
    this._asked.update((a) => a + 1);
    return true;
  }

  /**
   * Bokför ett svar på den aktuella frågan.
   * Returnerar true om en repetition på samma tagg lades in i kön.
   */
  submit(isCorrect: boolean): boolean {
    const q = this.current();
    if (!q) return false;
    if (isCorrect) this._correct.update((c) => c + 1);
    this.stats.recordAnswer(q.statKey, isCorrect);
    return isCorrect ? false : this.enqueueRetry(q.statKey);
  }

  /** Skjuter in en ny, oställd fråga på samma tagg direkt efter den aktuella. */
  private enqueueRetry(statKey: string): boolean {
    const deck = this.deck();
    if (!deck) return false;
    if ((this.retryByTag[statKey] ?? 0) >= MAX_RETRIES_PER_TAG) return false;

    const remaining = new Set(this._queue().slice(this._pos() + 1));
    const candidates = deck.pool.filter(
      (q: Question) =>
        q.statKey === statKey && !this.askedKeys.has(q._k) && !remaining.has(q as QueuedQuestion),
    );
    if (!candidates.length) return false;

    const clone: QueuedQuestion = { ...pickRandom(candidates), _retry: true };
    this._queue.update((queue) => {
      const next = queue.slice();
      next.splice(this._pos() + 1, 0, clone);
      return next;
    });
    this.retryByTag[statKey] = (this.retryByTag[statKey] ?? 0) + 1;
    return true;
  }

  private finishRound(): void {
    const deckId = this._deckId();
    const asked = this._asked();
    if (deckId && asked && this._correct() / asked >= PASS_RATIO) {
      this.stats.markDeckDone(deckId);
    }
  }

  private resetRound(): void {
    this._queue.set([]);
    this._pos.set(-1);
    this._correct.set(0);
    this._asked.set(0);
    this._plannedCount.set(0);
    this.askedKeys = new Set();
    this.retryByTag = {};
  }
}
