import { Injectable, signal } from '@angular/core';
import { Deck, Pillar, Question, StatMeta } from '../models/quiz.models';

interface DeckEntry {
  deck: Deck;
  pillar: Pillar;
}

/** Läser in mazzin en gång vid uppstart och håller uppslagstabellerna. */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly _pillars = signal<Pillar[]>([]);
  readonly pillars = this._pillars.asReadonly();

  private readonly deckIndex = new Map<string, DeckEntry>();
  private readonly statMeta = new Map<string, StatMeta>();

  async load(): Promise<void> {
    const res = await fetch('data/app-data.json');
    if (!res.ok) throw new Error(`Kunde inte läsa app-data.json (${res.status})`);
    this.hydrate((await res.json()) as Pillar[]);
  }

  /** Bygger uppslagstabellerna. Anropas av load() — och direkt av tester. */
  hydrate(pillars: Pillar[]): void {
    this.deckIndex.clear();
    this.statMeta.clear();
    for (const pillar of pillars) {
      for (const deck of pillar.decks) {
        this.deckIndex.set(deck.deckId, { deck, pillar });
        for (const q of deck.pool) {
          if (!this.statMeta.has(q.statKey)) {
            this.statMeta.set(q.statKey, {
              deckId: deck.deckId,
              deckTitle: deck.title,
              pillarId: pillar.pillarId,
              pillarTitle: pillar.pillarTitle,
              tag: q.tag,
            });
          }
        }
      }
    }
    this._pillars.set(pillars);
  }

  entry(deckId: string): DeckEntry | undefined {
    return this.deckIndex.get(deckId);
  }

  deck(deckId: string): Deck | undefined {
    return this.deckIndex.get(deckId)?.deck;
  }

  pillarOf(deckId: string): Pillar | undefined {
    return this.deckIndex.get(deckId)?.pillar;
  }

  meta(statKey: string): StatMeta | undefined {
    return this.statMeta.get(statKey);
  }

  /** Nästa mazzo i samma pelare, eller undefined om det var det sista. */
  nextDeck(deckId: string): Deck | undefined {
    const decks = this.pillarOf(deckId)?.decks ?? [];
    const idx = decks.findIndex((d) => d.deckId === deckId);
    return idx >= 0 ? decks[idx + 1] : undefined;
  }

  allQuestions(deckId: string): Question[] {
    return this.deck(deckId)?.pool ?? [];
  }
}
