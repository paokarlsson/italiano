import { computed, inject, Injectable, signal } from '@angular/core';
import {
  Lettura,
  LettureData,
  LexEntry,
  LeggiProgress,
  OpenWord,
  PillarId,
  ReadingProfile,
  ReadSummary,
  StoryItem,
  StorySong,
  Token,
  UserText,
} from '../models/leggi.models';
import { levelShift, MAX_LEVEL, MIN_LEVEL } from './levels';
import { StorageService } from './storage.service';
import { storyLexicon } from './story';
import { StoryStore } from './story-store';
import { tokenize } from './tokenize';

const LEGGI_KEY = 'it_companion_leggi_v1';
const TEXTS_KEY = 'it_companion_texts_v1';

const EMPTY: LeggiProgress = { texts: {}, words: {} };

/** Det som står på tur: en text att läsa, eller en låt i följetongen. */
export type Step = { kind: 'text'; text: Lettura } | { kind: 'song'; song: StorySong };

/**
 * Läsningen: texterna, ordlistan och vad som hänt med varje ord.
 *
 * Ett uppslag är inget fel — det är bara det enda appen behöver veta. Ett ord som slogs upp
 * är «öppet» tills det står i en text och läses utan hjälp, eller sitter i en repetition.
 */
@Injectable({ providedIn: 'root' })
export class LeggiService {
  private readonly storage = inject(StorageService);
  private readonly storyStore = inject(StoryStore);

  private readonly _texts = signal<Lettura[]>([]);
  private readonly _userTexts = signal<UserText[]>([]);
  private readonly _progress = signal<LeggiProgress>(EMPTY);
  private _lexicon: Record<string, LexEntry> = {};
  private names: string[] = [];
  /** Texten som delades och bitarna den gav — en omskriven sida är en annan text. */
  private readonly tokenCache = new Map<string, { text: Lettura; tokens: Token[][] }>();

  /** De inbyggda texterna, i läsordning. */
  readonly texts = this._texts.asReadonly();
  /** Texter som Claude skrivit eller läsaren klistrat in, nyast först. */
  readonly userTexts = this._userTexts.asReadonly();
  readonly progress = this._progress.asReadonly();

  /** Antal lästa inbyggda texter. */
  readonly readCount = computed(
    () => this._texts().filter((t) => this._progress().texts[t.id]).length,
  );

  /** Sant när alla inbyggda texter är lästa minst en gång. */
  readonly allRead = computed(
    () => this._texts().length > 0 && this.readCount() === this._texts().length,
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
   * Nivån nästa skrivna text ska ligga på — följer hur de senaste texterna gick.
   * Innan någon läsning har flyttat den: nivån på den svåraste inbyggda text som lästs.
   */
  readonly level = computed(() => {
    const { level, texts } = this._progress();
    if (level) return level;
    const read = this._texts().filter((t) => texts[t.id] && t.level);
    return Math.max(MIN_LEVEL, ...read.map((t) => t.level!));
  });

  /**
   * Var uppslagen hopar sig: per pelare hur ofta dess ord lästs och slagits upp, och vilka
   * mazzin de uppslagna formerna hör till. Underlaget till nästa beställda text.
   */
  readonly profile = computed<ReadingProfile>(() => {
    this._texts();
    const own = this._userTexts();
    const story = this.storyStore.data();
    const adapted = Object.values(this.storyStore.adapted());
    const load: Record<PillarId, { seen: number; looked: number }> = {
      D1: { seen: 0, looked: 0 },
      D2: { seen: 0, looked: 0 },
      D3: { seen: 0, looked: 0 },
      D4: { seen: 0, looked: 0 },
    };
    const decks = new Map<string, number>();
    for (const [key, word] of Object.entries(this._progress().words)) {
      // Den inbyggda ordlistan först; annars den egna text där formen står.
      const entry = Object.hasOwn(this._lexicon, key)
        ? this._lexicon[key]
        : story && Object.hasOwn(story.lexicon, key)
          ? story.lexicon[key]
          : [...own, ...adapted].find((t) => Object.hasOwn(t.lexicon, key))?.lexicon[key];
      if (!entry || !load[entry.p]) continue;
      load[entry.p].seen += word.seen;
      load[entry.p].looked += word.looked;
      if (entry.deck && word.looked) {
        decks.set(entry.deck, (decks.get(entry.deck) ?? 0) + word.looked);
      }
    }
    return {
      pillars: (Object.keys(load) as PillarId[]).map((p) => ({ p, ...load[p] })),
      decks: [...decks]
        .map(([deckId, looked]) => ({ deckId, looked }))
        .sort((a, b) => b.looked - a.looked),
    };
  });

  /**
   * Lagret: olästa texter som Claude skrivit åt läsaren eller som hämtats ur biblioteket,
   * i den ordning de kom.
   */
  readonly stock = computed(() => {
    const read = this._progress().texts;
    return this._userTexts()
      .filter((t) => t.source !== 'paste' && !read[t.id])
      .reverse();
  });

  /**
   * Den senaste berättelsen: delarna i den ordning de kom, från den senaste del 1 och
   * framåt. Texter från Claude och ur biblioteket är delar; inklistrade texter är det inte.
   * En text som saknar delnummer — skriven innan delarna räknades — hör till den berättelse
   * den kom i.
   */
  readonly story = computed(() => {
    const parts = this._userTexts()
      .filter((t) => t.source !== 'paste')
      .reverse();
    let start = 0;
    parts.forEach((t, i) => {
      if (t.part === 1) start = i;
    });
    return parts.slice(start);
  });

  /** Så många texter som lästs sammanlagt, omläsningar inräknade. */
  readonly reads = computed(() =>
    Object.values(this._progress().texts).reduce((n, r) => n + r.times, 0),
  );

  /** Det första i följetongen som inte är läst — en sida eller en låt. Null när allt är det. */
  readonly storyNext = computed<StoryItem | null>(() => {
    const read = this._progress().texts;
    return this.storyStore.items().find((item) => !read[item.id]) ?? null;
  });

  /** Antal lästa sidor och hörda låtar i följetongen. */
  readonly storyRead = computed(() => {
    const read = this._progress().texts;
    return this.storyStore.items().filter((item) => read[item.id]).length;
  });

  /**
   * Nästa text: den första olästa inbyggda, sedan följetongen, sedan den äldsta olästa i
   * lagret. När allt är läst — den inbyggda med flest öppna ord, och vid lika den som
   * lästes för längst sedan.
   */
  readonly next = computed<Lettura | null>(() => {
    const texts = this._texts();
    const read = this._progress().texts;
    const page = this.storyStore.items().find((item) => item.kind === 'page' && !read[item.id]);
    const unread =
      texts.find((t) => !read[t.id]) ?? (page && this.text(page.id)) ?? this.stock()[0];
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

  /** Det som står på tur — som `next`, men med följetongens låtar på sina platser. */
  readonly step = computed<Step | null>(() => {
    const read = this._progress().texts;
    const story = this.storyNext();
    if (story?.kind === 'song' && this._texts().every((t) => read[t.id])) {
      return { kind: 'song', song: story.song };
    }
    const text = this.next();
    return text ? { kind: 'text', text } : null;
  });

  async load(): Promise<void> {
    const res = await fetch('data/letture.json');
    if (!res.ok) throw new Error(`Kunde inte läsa letture.json (${res.status})`);
    this.hydrate((await res.json()) as LettureData);

    const [progress, texts] = await Promise.all([
      this.storage.get(LEGGI_KEY),
      this.storage.get(TEXTS_KEY),
    ]);
    try {
      if (progress) {
        const parsed = JSON.parse(progress) as Partial<LeggiProgress>;
        this._progress.set({
          texts: parsed.texts ?? {},
          words: parsed.words ?? {},
          level: parsed.level,
        });
      }
      if (texts) this._userTexts.set(JSON.parse(texts) as UserText[]);
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Lägger in texter och ordlista. Anropas av load() — och direkt av tester. */
  hydrate(data: LettureData): void {
    this._lexicon = data.lexicon;
    this.names = data.names;
    this.tokenCache.clear();
    this._texts.set(data.texts);
  }

  /** Den inbyggda ordlistan. */
  lexicon(): Readonly<Record<string, LexEntry>> {
    return this._lexicon;
  }

  /** Egennamn i de inbyggda texterna. */
  knownNames(): readonly string[] {
    return this.names;
  }

  /** En text — inbyggd, en sida i följetongen (omskriven åt läsaren om den är det), eller egen. */
  text(id: string): Lettura | undefined {
    return (
      this._texts().find((t) => t.id === id) ??
      this.storyStore.adaptation(id) ??
      this.storyStore.page(id) ??
      this._userTexts().find((t) => t.id === id)
    );
  }

  /** Textens plats bland de inbyggda, från 1 — eller 0 för en egen text. */
  number(id: string): number {
    return this._texts().findIndex((t) => t.id === id) + 1;
  }

  isRead(id: string): boolean {
    return !!this._progress().texts[id];
  }

  /** Texten delad i meningar och uppslagbara bitar. */
  tokens(id: string): Token[][] {
    const text = this.text(id);
    if (!text) return [];
    const cached = this.tokenCache.get(id);
    if (cached?.text === text) return cached.tokens;
    const lexicon = this.lexiconFor(id);
    const tokens = text.sentences.map((s) => tokenize(s.it, lexicon));
    this.tokenCache.set(id, { text, tokens });
    return tokens;
  }

  /**
   * Bokför en läst text: vilka ord som stod i den och vilka av dem som slogs upp. `tokens`
   * är texten som den lästes — en sida i följetongen kan ha skrivits om sedan dess.
   */
  complete(id: string, looked: ReadonlySet<string>, tokens?: Token[][]): ReadSummary {
    const keys = tokens ? keysOf(tokens) : this.keys(id);
    const distinct = [...new Set(keys)];
    const before = this._progress();
    const text = this.text(id);

    const lookedKeys = distinct.filter((k) => looked.has(k));
    const settledKeys = distinct.filter((k) => before.words[k]?.open && !looked.has(k));
    const lookedCount = keys.filter((k) => looked.has(k)).length;
    const own = keys.length ? Math.round((1 - lookedCount / keys.length) * 100) : 100;

    // Bara första läsningen flyttar nivån — en omläsning går alltid lättare.
    const steers = !!text?.level && !before.texts[id];
    const shift = steers ? levelShift(own) : null;
    const level = steers
      ? Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, text!.level! + shift!))
      : before.level;

    const words = { ...before.words };
    for (const k of distinct) {
      const w = words[k] ?? { seen: 0, looked: 0, open: false };
      const hit = looked.has(k);
      words[k] = { seen: w.seen + 1, looked: w.looked + (hit ? 1 : 0), open: hit };
    }
    const texts = {
      ...before.texts,
      [id]: {
        at: Date.now(),
        words: keys.length,
        looked: lookedCount,
        times: (before.texts[id]?.times ?? 0) + 1,
      },
    };
    this.saveProgress({ texts, words, level });

    return {
      words: keys.length,
      looked: lookedCount,
      own,
      lookedKeys,
      settledKeys,
      levelShift: shift,
    };
  }

  /** Bokför en låt i följetongen som hörd — den har inga ord att räkna. */
  markHeard(id: string): void {
    const before = this._progress();
    const prev = before.texts[id];
    const texts = {
      ...before.texts,
      [id]: { at: Date.now(), words: 0, looked: 0, times: (prev?.times ?? 0) + 1 },
    };
    this.saveProgress({ ...before, texts });
  }

  /** De öppna orden med uppslag och sammanhang, mest uppslagna först. */
  openWordDetails(): OpenWord[] {
    const state = this._progress();
    const out: OpenWord[] = [];
    // Senast lästa texten först — där är ordet färskast.
    const ids = Object.entries(state.texts)
      .sort(([, a], [, b]) => b.at - a.at)
      .map(([id]) => id);
    for (const key of this.openWords()) {
      for (const id of ids) {
        const sentence = this.tokens(id).find((s) => s.some((t) => t.key === key));
        const entry = sentence?.find((t) => t.key === key)?.entry;
        if (sentence && entry) {
          const questions = this.text(id)?.questions?.filter((q) => q.form === key);
          out.push({
            key,
            entry,
            looked: state.words[key].looked,
            sentence,
            ...(questions?.length ? { questions } : {}),
          });
          break;
        }
      }
    }
    return out.sort((a, b) => b.looked - a.looked);
  }

  /** Stänger ett öppet ord — det satt i en repetition. */
  settle(key: string): void {
    const prev = this._progress();
    const word = prev.words[key];
    if (!word?.open) return;
    this.saveProgress({ ...prev, words: { ...prev.words, [key]: { ...word, open: false } } });
  }

  addUserText(text: UserText): void {
    this._userTexts.update((list) => [text, ...list.filter((t) => t.id !== text.id)]);
    this.tokenCache.delete(text.id);
    this.saveUserTexts();
  }

  removeUserText(id: string): void {
    this._userTexts.update((list) => list.filter((t) => t.id !== id));
    this.tokenCache.delete(id);
    this.saveUserTexts();
    const prev = this._progress();
    if (prev.texts[id]) {
      const texts = { ...prev.texts };
      delete texts[id];
      this.saveProgress({ ...prev, texts });
    }
  }

  /** Nollställer läsningen. Egna texter ligger kvar — de är innehåll, inte framsteg. */
  reset(): void {
    this.saveProgress(EMPTY);
  }

  /**
   * Ordlistan som gäller för en text. En egen text läses bara med sin egen: där är varje
   * ord förklarat i sitt sammanhang, och «l'» kan vara ett pronomen i stället för en artikel.
   */
  private lexiconFor(id: string): Record<string, LexEntry> {
    const own = this._userTexts().find((t) => t.id === id) ?? this.storyStore.adaptation(id);
    if (own) return own.lexicon;
    const page = this.storyStore.page(id);
    const story = this.storyStore.data();
    return page && story ? storyLexicon(this._lexicon, story, page) : this._lexicon;
  }

  /** Alla uppslagbara bitar i texten, i ordning och med upprepningar. */
  private keys(id: string): string[] {
    return keysOf(this.tokens(id));
  }

  private saveProgress(progress: LeggiProgress): void {
    this._progress.set(progress);
    void this.storage.set(LEGGI_KEY, JSON.stringify(progress));
  }

  private saveUserTexts(): void {
    void this.storage.set(TEXTS_KEY, JSON.stringify(this._userTexts()));
  }
}

/** Alla uppslagbara bitar, i ordning och med upprepningar. */
function keysOf(tokens: Token[][]): string[] {
  return tokens.flat().flatMap((t) => (t.key ? [t.key] : []));
}
