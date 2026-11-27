import { computed, inject, Injectable, signal } from '@angular/core';
import { StoryData, UserText } from '../models/leggi.models';
import { pagesLeft } from './ai-book';
import {
  bookPacks,
  coverPacks,
  Cover,
  decodePack,
  encodePack,
  packName,
  Pack,
  PACK_MAX_BYTES,
  packNumber,
  splitPacks,
} from './audio-pack';
import { AudioStore } from './audio-store';
import { CoverStore } from './cover-store';
import { DriveError, DriveFile, DriveService } from './drive.service';
import { LeggiService } from './leggi.service';
import { StorageService } from './storage.service';
import { StoryStore } from './story-store';
import { VoiceService } from './voice.service';

const LIBRARY_KEY = 'it_companion_library_v1';
/** Så länge sidan ska ha legat i bakgrunden innan biblioteket läses av igen. */
const RESYNC_MS = 10 * 60 * 1000;

interface LibraryState {
  /** Fil-id för paketen som redan är inlästa här. */
  loaded: string[];
  /** Id för texterna och böckerna som redan är publicerade härifrån. */
  published: string[];
}

/** Sant om det som kom ur ett paket ser ut som en text som går att läsa. */
function readable(text: UserText): boolean {
  return (
    typeof text?.id === 'string' &&
    typeof text.title === 'string' &&
    Array.isArray(text.sentences) &&
    text.sentences.length > 0 &&
    text.sentences.every((s) => typeof s?.it === 'string' && typeof s.sv === 'string') &&
    !!text.lexicon &&
    typeof text.lexicon === 'object' &&
    Array.isArray(text.question?.options) &&
    Number.isInteger(text.question.answer)
  );
}

/** Sant om det som kom ur ett paket ser ut som en egen bok som går att läsa. */
function readableBook(book: StoryData): boolean {
  return (
    typeof book?.id === 'string' &&
    typeof book.title === 'string' &&
    !!book.own &&
    Array.isArray(book.own.plan) &&
    Array.isArray(book.names) &&
    Array.isArray(book.chapters) &&
    book.chapters.length > 0 &&
    book.chapters.every(
      (c) =>
        Number.isInteger(c?.n) &&
        Array.isArray(c.pages) &&
        Array.isArray(c.songs) &&
        c.pages.every((p) => readable(p as unknown as UserText)),
    )
  );
}

/**
 * Biblioteket: det som delas ut genom den publika mappen. En besökare hämtar paketen med
 * ett tryck, utan inloggning, och får ljud, bokomslag, fler texter och egna böcker. Den som
 * publicerar lägger nya paket i mappen — klippen som lästs in sedan sist, texterna som har
 * lästs, böckerna som är skrivna klart och omslagen som skapats.
 *
 * Paket läggs till och skrivs aldrig om, så den som redan hämtat får bara det nya.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly storage = inject(StorageService);
  private readonly drive = inject(DriveService);
  private readonly store = inject(AudioStore);
  private readonly covers = inject(CoverStore);
  private readonly leggi = inject(LeggiService);
  private readonly voice = inject(VoiceService);
  private readonly stories = inject(StoryStore);

  private readonly state = signal<LibraryState>({ loaded: [], published: [] });
  /** Paketen som ligger i mappen. */
  readonly packs = signal<DriveFile[]>([]);
  /** Sant när mappen har lästs av minst en gång. */
  readonly checked = signal(false);

  /** Vad som pågår, och hur långt det har kommit. */
  readonly working = signal<'' | 'download' | 'publish'>('');
  readonly progress = signal<{ done: number; total: number } | null>(null);
  readonly error = signal('');

  /** Paketen som inte är hämtade än, och hur mycket de väger. */
  readonly fresh = computed(() => {
    const loaded = new Set(this.state().loaded);
    return this.packs().filter((p) => !loaded.has(p.id));
  });
  readonly freshBytes = computed(() => this.fresh().reduce((n, p) => n + p.size, 0));

  /** Lästa texter från Claude som inte är publicerade än, äldst först. */
  readonly pendingTexts = computed(() => {
    const published = new Set(this.state().published);
    return this.leggi
      .userTexts()
      .filter((t) => t.source === 'ai' && this.leggi.isRead(t.id) && !published.has(t.id))
      .sort((a, b) => a.createdAt - b.createdAt);
  });
  /**
   * Egna böcker som är skrivna klart men inte publicerade än, äldst först. De publiceras en
   * i taget, med publishBook(), när läsaren väljer det — aldrig med resten. En bok som
   * hämtats ur biblioteket publiceras inte igen.
   */
  readonly pendingBooks = computed(() => {
    const published = new Set(this.state().published);
    return this.stories
      .books()
      .filter(
        (b) =>
          b.own &&
          !b.own.shared &&
          !published.has(b.id) &&
          b.chapters.length > 0 &&
          !pagesLeft(b).length,
      )
      .sort((a, b) => a.own!.createdAt - b.own!.createdAt);
  });

  /** Boken som publiceras just nu. */
  readonly publishing = signal<string | null>(null);

  /** Sant om texten eller boken är publicerad härifrån. */
  isPublished(id: string): boolean {
    return this.state().published.includes(id);
  }

  /**
   * Egna omslag som inte ligger i något paket än. Omslaget till en egen bok som inte är
   * publicerad väntar på boken.
   */
  readonly pendingCovers = computed(() => {
    const held = this.heldBooks();
    return Object.entries(this.covers.covers()).filter(([book, c]) => !c.pub && !held.has(book))
      .length;
  });

  /** Egna böcker som inte är publicerade — deras omslag följer med boken, inte före. */
  private readonly heldBooks = computed(() => {
    const published = new Set(this.state().published);
    return new Set(
      this.stories
        .books()
        .filter((b) => !b.own?.shared && !published.has(b.id))
        .map((b) => b.id),
    );
  });
  /** Egna klipp som inte ligger i något paket än, med båda rösterna. */
  readonly pendingClips = computed(
    () => this.store.pending(this.voice.tag('f')) + this.store.pending(this.voice.tag('m')),
  );

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(
        (await this.storage.get(LIBRARY_KEY)) ?? '{}',
      ) as Partial<LibraryState>;
      this.state.set({ loaded: parsed.loaded ?? [], published: parsed.published ?? [] });
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Läser av mappen. Tyst om det inte går — biblioteket är ett tillägg, inget krav. */
  async check(): Promise<void> {
    if (!this.drive.canRead()) return;
    try {
      const files = await this.drive.list();
      this.packs.set(files.filter((f) => packNumber(f.name) !== null));
      this.checked.set(true);
    } catch {
      /* visas först när någon faktiskt försöker hämta */
    }
  }

  /**
   * Läser av mappen och hämtar det som är nytt, utan att någon behöver trycka. Hoppar över
   * hämtningen när webbläsaren ber om att spara data — då finns knappen kvar under Bibliotek.
   */
  async sync(): Promise<void> {
    if (this.working()) return;
    this.lastSync = Date.now();
    await this.check();
    const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
    if (this.fresh().length && !saveData) await this.download();
  }

  /**
   * Hämtar automatiskt: nu, och när sidan kommer tillbaka i förgrunden efter en stund —
   * så att det som publicerats sedan sist kommer in utan omladdning.
   */
  startAuto(): void {
    void this.sync();
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastSync > RESYNC_MS) {
        void this.sync();
      }
    });
  }

  private lastSync = 0;

  /**
   * Hämtar paketen som saknas och läser in dem: klippen i ljudlagret, omslagen bland
   * omslagen, texterna bland de egna och böckerna bland böckerna. Ett senare omslag till samma bok ersätter ett
   * tidigare, eftersom paketen läses i den ordning de publicerades.
   */
  async download(): Promise<void> {
    if (this.working()) return;
    this.working.set('download');
    this.error.set('');
    const packs = this.fresh();
    const total = packs.reduce((n, p) => n + p.size, 0);
    let done = 0;
    this.progress.set({ done, total });
    try {
      for (const file of packs) {
        const pack = decodePack(await this.drive.download(file.id));
        await this.store.put(pack.voice, pack.clips, true);
        for (const cover of pack.covers ?? []) await this.covers.put(cover, true);
        this.addTexts(pack.texts);
        this.addBooks(pack.books ?? []);
        this.remember({ loaded: [file.id] });
        done += file.size;
        this.progress.set({ done, total });
      }
    } catch (e) {
      this.error.set(this.explain(e, 'Hämtningen gick fel.'));
    } finally {
      this.progress.set(null);
      this.working.set('');
    }
  }

  /**
   * Publicerar det som är nytt: klippen som lästs in sedan sist, texterna som har lästs och
   * omslagen som skapats. Egna böcker följer inte med — de publiceras en i taget.
   * Kräver inloggning och en mapp. Returnerar antalet paket som laddades upp.
   */
  publish(): Promise<number> {
    return this.send(async () => {
      // Ett paket har en röst. Texterna följer med det första paketet.
      let texts = this.pendingTexts();
      const packs: Pack[] = [];
      for (const voice of ['f', 'm'] as const) {
        const tag = this.voice.tag(voice);
        const clips = await this.store.unpublished(tag);
        if (!clips.length) continue;
        packs.push(...splitPacks(tag, clips, texts));
        texts = [];
      }
      if (texts.length) packs.push(...splitPacks(this.voice.tag('f'), [], texts));
      const held = this.heldBooks();
      packs.push(...coverPacks(this.covers.unpublished().filter((c) => !held.has(c.book))));
      return packs;
    });
  }

  /**
   * Publicerar en egen bok som är skriven klart, med sitt omslag om det finns ett som inte
   * är publicerat. Returnerar sant när boken ligger i mappen.
   */
  async publishBook(id: string): Promise<boolean> {
    const book = this.pendingBooks().find((b) => b.id === id);
    if (!book || this.working()) return false;
    this.publishing.set(id);
    try {
      const sent = await this.send(async () => {
        const cover: Cover[] = this.covers.unpublished().filter((c) => c.book === id);
        const [pack] = bookPacks([book]);
        // Omslaget i samma paket som boken, om det ryms — annars i ett eget efter.
        return cover.length && encodePack({ ...pack, covers: cover }).byteLength <= PACK_MAX_BYTES
          ? [{ ...pack, covers: cover }]
          : [pack, ...coverPacks(cover)];
      });
      return sent > 0 && this.isPublished(id);
    } finally {
      this.publishing.set(null);
    }
  }

  /**
   * Laddar upp paketen som `build` ger, med löpnummer efter det som redan ligger i mappen.
   * Varje paket bokförs när det är uppladdat. Returnerar antalet paket som kom upp.
   */
  private async send(build: () => Promise<Pack[]>): Promise<number> {
    if (this.working()) return 0;
    this.working.set('publish');
    this.error.set('');
    try {
      // Läs av mappen först, så att löpnumren fortsätter där de slutade.
      const files = await this.drive.list();
      this.packs.set(files.filter((f) => packNumber(f.name) !== null));
      this.checked.set(true);
      let number = Math.max(0, ...this.packs().map((p) => packNumber(p.name) ?? 0));
      const packs = await build();
      this.progress.set({ done: 0, total: packs.length });
      let done = 0;
      for (const pack of packs) {
        const file = await this.drive.upload(packName(++number), encodePack(pack));
        // Bokförs paket för paket: går nästa fel är det här ändå klart.
        await this.store.markPublished(
          pack.voice,
          pack.clips.map((c) => c.text),
        );
        await this.covers.markPublished((pack.covers ?? []).map((c) => c.book));
        this.remember({
          loaded: [file.id],
          published: [...pack.texts.map((t) => t.id), ...(pack.books ?? []).map((b) => b.id)],
        });
        this.packs.update((list) => [...list, file]);
        this.progress.set({ done: ++done, total: packs.length });
      }
      return packs.length;
    } catch (e) {
      this.error.set(this.explain(e, 'Publiceringen gick fel.'));
      return 0;
    } finally {
      this.progress.set(null);
      this.working.set('');
    }
  }

  /** Lägger in texterna ur ett paket som delade texter. En text som redan finns rörs inte. */
  private addTexts(texts: readonly UserText[]): void {
    const have = new Set(this.leggi.userTexts().map((t) => t.id));
    for (const text of texts) {
      if (!readable(text) || have.has(text.id) || this.leggi.text(text.id)) continue;
      this.leggi.addUserText({ ...text, source: 'shared' });
    }
  }

  /**
   * Lägger in böckerna ur ett paket bland de egna, märkta som hämtade. En bok som redan finns
   * — eller har samma id som en följetong i appen — rörs inte.
   */
  private addBooks(books: readonly StoryData[]): void {
    const have = new Set(this.stories.stories().map((s) => s.id));
    for (const book of books) {
      if (!readableBook(book) || have.has(book.id)) continue;
      this.stories.saveBook({ ...book, own: { ...book.own!, shared: true } });
      have.add(book.id);
    }
  }

  private remember(patch: Partial<LibraryState>): void {
    this.state.update((s) => ({
      loaded: [...new Set([...s.loaded, ...(patch.loaded ?? [])])],
      published: [...new Set([...s.published, ...(patch.published ?? [])])],
    }));
    void this.storage.set(LIBRARY_KEY, JSON.stringify(this.state()));
  }

  private explain(error: unknown, fallback: string): string {
    if (error instanceof DriveError) return error.message;
    return error instanceof Error && error.message ? `${fallback} ${error.message}` : fallback;
  }
}
