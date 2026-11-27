import { computed, inject, Injectable, signal } from '@angular/core';
import { Voice } from '../models/leggi.models';
import { clipText } from './audio-pack';
import { AudioStore } from './audio-store';
import { LeggiService } from './leggi.service';
import { Part, textParts, WORD_VOICE } from './speech';
import { VoiceError, VoiceService } from './voice.service';

/** Så många inläsningar som görs samtidigt när allt som saknas läses in. */
const PARALLEL = 2;

/** En del att spela, med en markering som säger var den hör hemma — «s3» för fjärde meningen. */
export interface Cue extends Part {
  mark?: string;
}

const keyOf = (p: Part) => `${p.voice}\n${p.text}`;

/**
 * Ljudet: slår upp ett klipp, läser in det om det saknas och en egen röst finns, och spelar.
 *
 * Ett klipp är en text med en röst — en replik med den som säger den, det berättaren läser,
 * eller ett ord. Uppslaget går billigast först: det som redan ligger i webbläsaren — hämtat
 * ur biblioteket eller inläst tidigare — och först därefter en ny inläsning. Samma klipp
 * läses aldrig in två gånger.
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

  /** Delen som spelas just nu. */
  readonly playing = signal<Cue | null>(null);
  /** Sant medan ett klipp hämtas eller läses in inför uppspelning. */
  readonly loading = signal(false);
  readonly error = signal('');

  /** Hur långt inläsningen av allt som saknas har kommit — null när den inte går. */
  readonly progress = signal<{ done: number; total: number } | null>(null);
  private cancelled = false;

  /**
   * Allt som är värt att ha ljud på: varje del av varje mening i varje text, med rätt röst,
   * och varje form i ordlistorna. En form som slutar på apostrof («l'») går inte att säga
   * för sig och hoppas över.
   */
  readonly wanted = computed(() => {
    const out = new Map<string, Part>();
    const add = (p: Part) => out.set(keyOf(p), p);
    for (const text of [...this.leggi.texts(), ...this.leggi.userTexts()]) {
      textParts(text).flat().forEach(add);
    }
    const forms = [
      ...Object.keys(this.leggi.lexicon()),
      ...this.leggi.userTexts().flatMap((t) => Object.keys(t.lexicon)),
    ];
    for (const form of forms) {
      const text = clipText(form);
      if (text && !text.endsWith("'")) add({ text, voice: WORD_VOICE });
    }
    return [...out.values()];
  });

  /** Det av det önskade som inte finns i webbläsaren än. */
  readonly missing = computed(() => this.wanted().filter((p) => !this.store.has(p.text, p.voice)));

  /** Antal tecken i det som saknas — det ElevenLabs tar betalt för. */
  readonly missingChars = computed(() => this.missing().reduce((n, p) => n + p.text.length, 0));

  /** Sant om delen går att spela: klippet finns, eller går att läsa in. */
  can(part: Part): boolean {
    return this.store.has(part.text, part.voice) || this.voice.ready();
  }

  /** Klippet för en del — ur lagret, eller nyinläst och sparat. Null om det inte går att få. */
  async clip(text: string, voice: Voice): Promise<Uint8Array | null> {
    const normal = clipText(text);
    if (!normal) return null;
    const stored = await this.store.get(normal, voice, this.voice.tag(voice));
    if (stored) return stored;
    if (!this.voice.ready()) return null;

    const key = keyOf({ text: normal, voice });
    let pending = this.inflight.get(key);
    if (!pending) {
      const tag = this.voice.tag(voice);
      pending = this.voice
        .speak(normal, voice)
        .then(async (bytes) => {
          await this.store.put(tag, [{ text: normal, bytes }], false);
          return bytes;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  /**
   * Spelar delarna i följd. Returnerar falskt om det första klippet inte gick att få —
   * då har inget spelats, och den som anropade kan ta till något annat.
   */
  async play(cues: readonly Cue[]): Promise<boolean> {
    this.stop();
    const turn = ++this.turn;
    this.error.set('');
    let played = false;
    for (const cue of cues) {
      let bytes: Uint8Array | null;
      this.loading.set(true);
      try {
        bytes = await this.clip(cue.text, cue.voice);
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
      this.playing.set(cue);
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
      for (let part = queue.shift(); part !== undefined; part = queue.shift()) {
        if (this.cancelled) return;
        await this.clip(part.text, part.voice);
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
      // Kontots förbrukning har ändrats — läs av den igen.
      void this.voice.checkAccount();
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
