import { computed, inject, Injectable, signal } from '@angular/core';
import { UserText } from '../models/leggi.models';
import { decodePack, encodePack, packName, packNumber, splitPacks } from './audio-pack';
import { AudioStore } from './audio-store';
import { DriveError, DriveFile, DriveService } from './drive.service';
import { LeggiService } from './leggi.service';
import { StorageService } from './storage.service';
import { VoiceService } from './voice.service';

const LIBRARY_KEY = 'it_companion_library_v1';

interface LibraryState {
  /** Fil-id för paketen som redan är inlästa här. */
  loaded: string[];
  /** Id för texterna som redan är publicerade härifrån. */
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

/**
 * Biblioteket: det som delas ut genom den publika mappen. En besökare hämtar paketen med
 * ett tryck, utan inloggning, och får ljud och fler texter. Den som publicerar lägger nya
 * paket i mappen — klippen som lästs in sedan sist, och texterna som har lästs.
 *
 * Paket läggs till och skrivs aldrig om, så den som redan hämtat får bara det nya.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly storage = inject(StorageService);
  private readonly drive = inject(DriveService);
  private readonly store = inject(AudioStore);
  private readonly leggi = inject(LeggiService);
  private readonly voice = inject(VoiceService);

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

  /** Hämtar paketen som saknas och läser in dem: klippen i ljudlagret, texterna bland de egna. */
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
        this.addTexts(pack.texts);
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
   * Publicerar det som är nytt: klippen som lästs in sedan sist, och texterna som har lästs.
   * Kräver inloggning och en mapp. Returnerar antalet paket som laddades upp.
   */
  async publish(): Promise<number> {
    if (this.working()) return 0;
    this.working.set('publish');
    this.error.set('');
    try {
      // Läs av mappen först, så att löpnumren fortsätter där de slutade.
      const files = await this.drive.list();
      this.packs.set(files.filter((f) => packNumber(f.name) !== null));
      this.checked.set(true);
      let number = Math.max(0, ...this.packs().map((p) => packNumber(p.name) ?? 0));

      // Ett paket har en röst. Texterna följer med det första paketet.
      let texts = this.pendingTexts();
      const packs = [];
      for (const voice of ['f', 'm'] as const) {
        const tag = this.voice.tag(voice);
        const clips = await this.store.unpublished(tag);
        if (!clips.length) continue;
        packs.push(...splitPacks(tag, clips, texts));
        texts = [];
      }
      if (texts.length) packs.push(...splitPacks(this.voice.tag('f'), [], texts));
      this.progress.set({ done: 0, total: packs.length });
      let done = 0;
      for (const pack of packs) {
        const file = await this.drive.upload(packName(++number), encodePack(pack));
        // Bokförs paket för paket: går nästa fel är det här ändå klart.
        await this.store.markPublished(
          pack.voice,
          pack.clips.map((c) => c.text),
        );
        this.remember({ loaded: [file.id], published: pack.texts.map((t) => t.id) });
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
