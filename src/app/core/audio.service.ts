import { computed, inject, Injectable, signal } from '@angular/core';
import { clipText } from './audio-pack';
import { AudioStore } from './audio-store';
import { LeggiService } from './leggi.service';
import { VoiceError, VoiceService } from './voice.service';

/** Så många inläsningar som görs samtidigt när allt som saknas läses in. */
const PARALLEL = 2;

/**
 * Ljudet: slår upp ett klipp, läser in det om det saknas och en egen röst finns, och spelar.
 *
 * Uppslaget går billigast först: det som redan ligger i webbläsaren — hämtat ur biblioteket
 * eller inläst tidigare — och först därefter en ny inläsning. Samma text läses aldrig in
 * två gånger.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly store = inject(AudioStore);
  private readonly voice = inject(VoiceService);
  private readonly leggi = inject(LeggiService);

  private readonly inflight = new Map<string, Promise<Uint8Array>>();
  private player: HTMLAudioElement | null = null;
  /** Räknas upp vid varje ny uppspelning, så att en avbruten inte fortsätter. */
  private turn = 0;

  /** Texten som spelas just nu. */
  readonly playing = signal<string | null>(null);
  /** Sant medan ett klipp hämtas eller läses in inför uppspelning. */
  readonly loading = signal(false);
  readonly error = signal('');

  /** Hur långt inläsningen av allt som saknas har kommit — null när den inte går. */
  readonly progress = signal<{ done: number; total: number } | null>(null);
  private cancelled = false;

  /**
   * Allt som är värt att ha ljud på: varje mening i varje text, och varje form i ordlistorna.
   * En form som slutar på apostrof («l'») går inte att säga för sig och hoppas över.
   */
  readonly wanted = computed(() => {
    const out = new Set<string>();
    const texts = [...this.leggi.texts(), ...this.leggi.userTexts()];
    for (const text of texts) for (const s of text.sentences) out.add(clipText(s.it));
    const forms = [
      ...Object.keys(this.leggi.lexicon()),
      ...this.leggi.userTexts().flatMap((t) => Object.keys(t.lexicon)),
    ];
    for (const form of forms) if (!form.endsWith("'")) out.add(clipText(form));
    out.delete('');
    return [...out];
  });

  /** Det av det önskade som inte finns i webbläsaren än. */
  readonly missing = computed(() => this.wanted().filter((t) => !this.store.has(t)));

  /** Sant om texten går att spela: klippet finns, eller går att läsa in. */
  can(text: string): boolean {
    return this.store.has(text) || this.voice.ready();
  }

  /** Klippet för en text — ur lagret, eller nyinläst och sparat. Null om det inte går att få. */
  async clip(text: string): Promise<Uint8Array | null> {
    const normal = clipText(text);
    if (!normal) return null;
    const stored = await this.store.get(normal, this.voice.tag());
    if (stored) return stored;
    if (!this.voice.ready()) return null;

    let pending = this.inflight.get(normal);
    if (!pending) {
      const tag = this.voice.tag();
      pending = this.voice
        .speak(normal)
        .then(async (bytes) => {
          await this.store.put(tag, [{ text: normal, bytes }], false);
          return bytes;
        })
        .finally(() => this.inflight.delete(normal));
      this.inflight.set(normal, pending);
    }
    return pending;
  }

  /**
   * Spelar texterna i följd. Returnerar falskt om det första klippet inte gick att få —
   * då har inget spelats, och den som anropade kan ta till något annat.
   */
  async play(texts: readonly string[]): Promise<boolean> {
    this.stop();
    const turn = ++this.turn;
    this.error.set('');
    let played = false;
    for (const text of texts) {
      let bytes: Uint8Array | null;
      this.loading.set(true);
      try {
        bytes = await this.clip(text);
      } catch (e) {
        if (turn === this.turn) {
          this.error.set(e instanceof VoiceError ? e.message : 'Ljudet gick inte att hämta.');
        }
        bytes = null;
      } finally {
        if (turn === this.turn) this.loading.set(false);
      }
      if (turn !== this.turn) return played;
      if (!bytes) break;
      this.playing.set(text);
      played = true;
      await this.sound(bytes);
      if (turn !== this.turn) return played;
    }
    this.playing.set(null);
    return played;
  }

  stop(): void {
    this.turn++;
    this.player?.pause();
    this.player = null;
    this.playing.set(null);
    this.loading.set(false);
  }

  /** Läser in allt som saknas, ett par i taget. Stannar vid första felet. */
  async fill(): Promise<void> {
    if (this.progress() || !this.voice.ready()) return;
    const queue = [...this.missing()];
    const total = queue.length;
    let done = 0;
    this.cancelled = false;
    this.error.set('');
    this.progress.set({ done, total });
    const worker = async () => {
      for (let text = queue.shift(); text !== undefined; text = queue.shift()) {
        if (this.cancelled) return;
        await this.clip(text);
        this.progress.set({ done: ++done, total });
      }
    };
    try {
      await Promise.all(Array.from({ length: PARALLEL }, worker));
    } catch (e) {
      this.cancelled = true;
      this.error.set(e instanceof VoiceError ? e.message : 'Inläsningen gick fel.');
    } finally {
      this.progress.set(null);
    }
  }

  /** Avbryter inläsningen av allt som saknas — det som hunnit läsas in ligger kvar. */
  cancel(): void {
    this.cancelled = true;
  }

  /** Spelar ett klipp och väntar tills det är slut eller avbrutet. */
  private sound(bytes: Uint8Array): Promise<void> {
    if (typeof Audio === 'undefined') return Promise.resolve();
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'audio/mpeg' }));
    const player = new Audio(url);
    this.player = player;
    return new Promise<void>((resolve) => {
      const finish = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      player.onended = player.onerror = player.onpause = finish;
      player.play().catch(finish);
    });
  }
}
