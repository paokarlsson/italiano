import { computed, Injectable, signal } from '@angular/core';
import { Cover } from './audio-pack';

const DB_NAME = 'it_companion_covers';
const COVERS = 'covers';

interface Stored {
  mime: string;
  bytes: ArrayBuffer;
  /** Sant när omslaget ligger i ett publicerat paket — hämtat därifrån eller uppladdat dit. */
  pub: boolean;
  at: number;
}

/** Ett omslag som sidan kan visa. */
export interface CoverView {
  url: string;
  bytes: number;
  pub: boolean;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Omslagen i webbläsaren, ett per bok. Bilderna ligger i IndexedDB som ljudet, och visas
 * genom en adress till bilden i minnet. Saknas IndexedDB lever de så länge sidan är öppen.
 */
@Injectable({ providedIn: 'root' })
export class CoverStore {
  private db: IDBDatabase | null = null;
  private readonly stored = new Map<string, Stored>();
  private readonly _covers = signal<Record<string, CoverView>>({});

  /** Omslagen per bok-id. */
  readonly covers = this._covers.asReadonly();
  /** Antal omslag som inte ligger i något publicerat paket än. */
  readonly pending = computed(() => Object.values(this._covers()).filter((c) => !c.pub).length);

  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(COVERS);
      this.db = await done(open);
      const store = this.db.transaction(COVERS, 'readonly').objectStore(COVERS);
      const [keys, values] = await Promise.all([
        done(store.getAllKeys()),
        done(store.getAll() as IDBRequest<Stored[]>),
      ]);
      keys.forEach((key, i) => this.stored.set(String(key), values[i]));
      this.publish();
    } catch {
      this.db = null;
    }
  }

  url(book: string): string | null {
    return this._covers()[book]?.url ?? null;
  }

  /**
   * Lägger in ett omslag. Ett hämtat omslag (`pub`) tränger inte undan ett eget som inte är
   * publicerat än — det egna är nyare.
   */
  async put(cover: Cover, pub: boolean): Promise<void> {
    const have = this.stored.get(cover.book);
    if (pub && have && !have.pub) return;
    await this.write(cover.book, {
      mime: cover.mime,
      bytes: cover.bytes.slice().buffer,
      pub,
      at: Date.now(),
    });
  }

  /** Omslagen som inte ligger i något publicerat paket än. */
  unpublished(): Cover[] {
    return [...this.stored]
      .filter(([, s]) => !s.pub)
      .map(([book, s]) => ({ book, mime: s.mime, bytes: new Uint8Array(s.bytes) }));
  }

  /** Märker omslag som publicerade, när paketet de ligger i har laddats upp. */
  async markPublished(books: readonly string[]): Promise<void> {
    for (const book of books) {
      const s = this.stored.get(book);
      if (s && !s.pub) await this.write(book, { ...s, pub: true });
    }
  }

  private async write(book: string, entry: Stored): Promise<void> {
    if (this.db) {
      const tx = this.db.transaction(COVERS, 'readwrite');
      tx.objectStore(COVERS).put(entry, book);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    }
    this.stored.set(book, entry);
    this.publish();
  }

  private readonly urls = new Map<string, { entry: Stored; url: string }>();

  /** Gör adresser till bilderna, och släpper dem som inte längre visas. */
  private publish(): void {
    const out: Record<string, CoverView> = {};
    for (const [book, entry] of this.stored) {
      let made = this.urls.get(book);
      if (made?.entry.bytes !== entry.bytes) {
        if (made?.url) URL.revokeObjectURL(made.url);
        // Utan createObjectURL (i tester) finns ingen adress att visa — bilden finns ändå.
        const url =
          typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(new Blob([entry.bytes], { type: entry.mime }))
            : '';
        made = { entry, url };
        this.urls.set(book, made);
      }
      out[book] = { url: made.url, bytes: entry.bytes.byteLength, pub: entry.pub };
    }
    this._covers.set(out);
  }
}
