import { Injectable, signal } from '@angular/core';
import { Voice } from '../models/leggi.models';
import { Clip, clipText, voiceOf } from './audio-pack';

const DB_NAME = 'it_companion_audio';
const CLIPS = 'clips';
const META = 'meta';

/** Det som är känt om ett klipp utan att ljudet behöver läsas in. */
interface ClipMeta {
  /** Röstens etikett — se voiceTag(). */
  voice: string;
  text: string;
  bytes: number;
  /** Sant när klippet ligger i ett publicerat paket — hämtat därifrån eller uppladdat dit. */
  pub: boolean;
}

const keyOf = (voice: string, text: string) => `${voice}\n${text}`;

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

/**
 * Ljudklippen i webbläsaren. Ett klipp slås upp på sorts röst — kvinnlig eller manlig — och
 * texten det läser upp, så samma mening eller replik ger alltid samma klipp, var den än står.
 *
 * Ljudet ligger i IndexedDB — localStorage är för litet. Vad som finns hålls också i minnet,
 * så att sidan kan fråga `has()` utan att vänta. Saknas IndexedDB ligger allt i minnet.
 */
@Injectable({ providedIn: 'root' })
export class AudioStore {
  private db: IDBDatabase | null = null;
  private readonly memory = new Map<string, Uint8Array>();
  private readonly meta = new Map<string, ClipMeta>();
  /** Röstetiketterna som har ett klipp för en text. */
  private readonly voices = new Map<string, Set<string>>();

  /** Räknas upp när innehållet ändras, så att det som läser `has()` ritas om. */
  private readonly revision = signal(0);
  readonly count = signal(0);
  readonly bytes = signal(0);

  /** Öppnar lagret och läser in vad som finns. Anropas en gång vid uppstart. */
  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(CLIPS);
        open.result.createObjectStore(META);
      };
      this.db = await done(open);
      const tx = this.db.transaction(META, 'readonly');
      const [keys, values] = await Promise.all([
        done(tx.objectStore(META).getAllKeys()),
        done(tx.objectStore(META).getAll() as IDBRequest<ClipMeta[]>),
      ]);
      keys.forEach((key, i) => this.index(String(key), values[i]));
      this.touch();
    } catch {
      // Privat läge eller spärrad lagring — klippen lever så länge sidan är öppen.
      this.db = null;
    }
  }

  /** Sant om det finns ett klipp för texten med en röst av den sorten. */
  has(text: string, voice: Voice): boolean {
    this.revision();
    return !!this.tagFor(clipText(text), voice);
  }

  /**
   * Klippet för texten med en röst av den sorten. Finns flera tas `prefer` — den egna
   * rösten — om den är en av dem.
   */
  async get(text: string, voice: Voice, prefer?: string): Promise<Uint8Array | null> {
    const normal = clipText(text);
    const tag = this.tagFor(normal, voice, prefer);
    if (!tag) return null;
    return this.read(keyOf(tag, normal));
  }

  private async read(key: string): Promise<Uint8Array | null> {
    if (!this.db) return this.memory.get(key) ?? null;
    const stored = await done(
      this.db.transaction(CLIPS, 'readonly').objectStore(CLIPS).get(key) as IDBRequest<
        ArrayBuffer | undefined
      >,
    );
    return stored ? new Uint8Array(stored) : null;
  }

  /** Lägger in klipp. `pub` säger om de redan ligger i ett publicerat paket. */
  async put(voice: string, clips: readonly Clip[], pub: boolean): Promise<void> {
    if (!clips.length) return;
    const entries = clips.map((clip) => {
      const text = clipText(clip.text);
      const meta: ClipMeta = { voice, text, bytes: clip.bytes.byteLength, pub };
      return { key: keyOf(voice, text), meta, bytes: clip.bytes };
    });
    if (this.db) {
      const tx = this.db.transaction([CLIPS, META], 'readwrite');
      for (const e of entries) {
        // En egen kopia av just de här byten — klippet kan vara en vy in i ett större paket.
        tx.objectStore(CLIPS).put(e.bytes.slice().buffer, e.key);
        tx.objectStore(META).put(e.meta, e.key);
      }
      await finished(tx);
    } else {
      for (const e of entries) this.memory.set(e.key, e.bytes.slice());
    }
    for (const e of entries) this.index(e.key, e.meta);
    this.touch();
  }

  /** Klippen med en viss röstetikett som ännu inte ligger i något publicerat paket. */
  async unpublished(tag: string): Promise<Clip[]> {
    const out: Clip[] = [];
    for (const [key, meta] of this.meta) {
      if (meta.voice !== tag || meta.pub) continue;
      const bytes = await this.read(key);
      if (bytes) out.push({ text: meta.text, bytes });
    }
    return out;
  }

  /** Antal klipp med en viss röstetikett som väntar på att publiceras. */
  pending(tag: string): number {
    this.revision();
    let n = 0;
    for (const meta of this.meta.values()) if (meta.voice === tag && !meta.pub) n++;
    return n;
  }

  /** Märker klipp som publicerade, när paketet de ligger i har laddats upp. */
  async markPublished(voice: string, texts: readonly string[]): Promise<void> {
    const keys = texts.map((t) => keyOf(voice, clipText(t))).filter((k) => this.meta.has(k));
    for (const key of keys) this.meta.set(key, { ...this.meta.get(key)!, pub: true });
    if (this.db && keys.length) {
      const tx = this.db.transaction(META, 'readwrite');
      for (const key of keys) tx.objectStore(META).put(this.meta.get(key)!, key);
      await finished(tx);
    }
    this.touch();
  }

  /** Tömmer lagret. */
  async clear(): Promise<void> {
    if (this.db) {
      const tx = this.db.transaction([CLIPS, META], 'readwrite');
      tx.objectStore(CLIPS).clear();
      tx.objectStore(META).clear();
      await finished(tx);
    }
    this.memory.clear();
    this.meta.clear();
    this.voices.clear();
    this.touch();
  }

  private tagFor(text: string, voice: Voice, prefer?: string): string | null {
    const tags = [...(this.voices.get(text) ?? [])].filter((t) => voiceOf(t) === voice);
    if (!tags.length) return null;
    return prefer !== undefined && tags.includes(prefer) ? prefer : tags[0];
  }

  private index(key: string, meta: ClipMeta): void {
    this.meta.set(key, meta);
    let voices = this.voices.get(meta.text);
    if (!voices) this.voices.set(meta.text, (voices = new Set()));
    voices.add(meta.voice);
  }

  private touch(): void {
    let bytes = 0;
    for (const meta of this.meta.values()) bytes += meta.bytes;
    this.count.set(this.meta.size);
    this.bytes.set(bytes);
    this.revision.update((n) => n + 1);
  }
}
