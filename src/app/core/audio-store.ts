import { Injectable, signal } from '@angular/core';
import { Clip, clipText } from './audio-pack';

const DB_NAME = 'it_companion_audio';
const CLIPS = 'clips';
const META = 'meta';

/** Det som är känt om ett klipp utan att ljudet behöver läsas in. */
interface ClipMeta {
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
 * Ljudklippen i webbläsaren. Ett klipp slås upp på rösten och texten det läser upp, så samma
 * mening eller ord ger alltid samma klipp, var det än står.
 *
 * Ljudet ligger i IndexedDB — localStorage är för litet. Vad som finns hålls också i minnet,
 * så att sidan kan fråga `has()` utan att vänta. Saknas IndexedDB ligger allt i minnet.
 */
@Injectable({ providedIn: 'root' })
export class AudioStore {
  private db: IDBDatabase | null = null;
  private readonly memory = new Map<string, Uint8Array>();
  private readonly meta = new Map<string, ClipMeta>();
  /** Rösterna som har ett klipp för en text. */
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

  /** Sant om det finns ett klipp för texten — med just den rösten, eller med vilken som helst. */
  has(text: string, voice?: string): boolean {
    this.revision();
    const voices = this.voices.get(clipText(text));
    return !!voices && (voice === undefined ? voices.size > 0 : voices.has(voice));
  }

  /** Klippet för texten: med den föredragna rösten om det finns, annars med någon annan. */
  async get(text: string, prefer?: string): Promise<Uint8Array | null> {
    const normal = clipText(text);
    const voices = this.voices.get(normal);
    if (!voices?.size) return null;
    const voice = prefer !== undefined && voices.has(prefer) ? prefer : [...voices][0];
    const key = keyOf(voice, normal);
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

  /** Klippen med en viss röst som ännu inte ligger i något publicerat paket. */
  async unpublished(voice: string): Promise<Clip[]> {
    const out: Clip[] = [];
    for (const meta of this.meta.values()) {
      if (meta.voice !== voice || meta.pub) continue;
      const bytes = await this.get(meta.text, voice);
      if (bytes) out.push({ text: meta.text, bytes });
    }
    return out;
  }

  /** Antal klipp med en viss röst som väntar på att publiceras. */
  pending(voice: string): number {
    this.revision();
    let n = 0;
    for (const meta of this.meta.values()) if (meta.voice === voice && !meta.pub) n++;
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
