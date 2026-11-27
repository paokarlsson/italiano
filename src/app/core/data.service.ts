import { computed, inject, Injectable, signal } from '@angular/core';
import { Deck, Pillar, Question, StatMeta } from '../models/quiz.models';
import { StorageService } from './storage.service';
import { tagLabel } from './tag-labels';

const EXTRA_KEY = 'it_companion_extra_v1';

/** Frågor som skrivits till ett mazzo i efterhand, per mazzo-id. */
export type Extras = Record<string, Question[]>;
/** Hur många gånger ett mazzo hade övats när det senast byggdes ut, per mazzo-id. */
export type Marks = Record<string, number>;

interface StoredExtras {
  questions?: Extras;
  marks?: Marks;
}

interface DeckEntry {
  deck: Deck;
  pillar: Pillar;
}

/**
 * Läser in mazzin en gång vid uppstart och håller uppslagstabellerna. Ett mazzo är de
 * inbyggda frågorna plus de som Claude skrivit till — de senare sparas lokalt.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly storage = inject(StorageService);

  private readonly _pillars = signal<Pillar[]>([]);
  /** Pelarna med allt som går att öva: inbyggda frågor och tillskrivna. */
  readonly pillars = this._pillars.asReadonly();

  private base: Pillar[] = [];
  private readonly _extras = signal<Extras>({});
  readonly extras = this._extras.asReadonly();
  private readonly _marks = signal<Marks>({});
  readonly marks = this._marks.asReadonly();
  /** Antal tillskrivna frågor, över alla mazzi. */
  readonly extraCount = computed(() =>
    Object.values(this._extras()).reduce((n, qs) => n + qs.length, 0),
  );

  private readonly deckIndex = new Map<string, DeckEntry>();
  private readonly statMeta = new Map<string, StatMeta>();

  async load(): Promise<void> {
    const res = await fetch('data/app-data.json');
    if (!res.ok) throw new Error(`Kunde inte läsa app-data.json (${res.status})`);
    const pillars = (await res.json()) as Pillar[];
    let stored: StoredExtras = {};
    try {
      stored = JSON.parse((await this.storage.get(EXTRA_KEY)) ?? '{}') as StoredExtras;
    } catch {
      /* trasig data ignoreras */
    }
    this.hydrate(pillars, stored.questions ?? {}, stored.marks ?? {});
  }

  /** Lägger in mazzin och det som skrivits till. Anropas av load() — och direkt av tester. */
  hydrate(pillars: Pillar[], extras: Extras = {}, marks: Marks = {}): void {
    this.base = pillars;
    this._extras.set(extras);
    this._marks.set(marks);
    this.rebuild();
  }

  /**
   * Lägger nya frågor sist i ett mazzo och sparar dem. `attempts` är hur många gånger
   * mazzot hade övats — därifrån räknas när det är dags att bygga ut igen. Märket sätts
   * också när inga frågor höll för kontrollen, så att samma beställning inte görs om.
   */
  addQuestions(deckId: string, questions: Question[], attempts: number): void {
    if (!this.deckIndex.has(deckId)) return;
    this._marks.update((m) => ({ ...m, [deckId]: attempts }));
    if (questions.length) {
      this._extras.update((e) => ({ ...e, [deckId]: [...(e[deckId] ?? []), ...questions] }));
      this.rebuild();
    }
    this.save();
  }

  /** Tar bort allt som skrivits till — mazzin blir som de följde med appen. */
  clearExtras(): void {
    this._extras.set({});
    this._marks.set({});
    this.rebuild();
    this.save();
  }

  private save(): void {
    const stored: StoredExtras = { questions: this._extras(), marks: this._marks() };
    void this.storage.set(EXTRA_KEY, JSON.stringify(stored));
  }

  /** Bygger uppslagstabellerna ur de inbyggda mazzin och det som skrivits till. */
  private rebuild(): void {
    const extras = this._extras();
    const pillars = this.base.map((pillar) => ({
      ...pillar,
      decks: pillar.decks.map((deck) =>
        extras[deck.deckId]?.length
          ? { ...deck, pool: [...deck.pool, ...extras[deck.deckId]] }
          : deck,
      ),
    }));
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
              tagLabel: tagLabel(q.tag),
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
