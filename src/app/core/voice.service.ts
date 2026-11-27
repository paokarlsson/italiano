import { computed, inject, Injectable, signal } from '@angular/core';
import { Voice } from '../models/leggi.models';
import { voiceTag } from './audio-pack';
import { StorageService } from './storage.service';

const VOICE_KEY = 'it_companion_voice_v1';
const API = 'https://api.elevenlabs.io';
/** MP3 i 64 kbit/s — ungefär 8 kB per sekund tal. */
const FORMAT = 'mp3_44100_64';
const LANGUAGE = 'it';
/** Rösterna som väljs om de finns på kontot och inget annat är valt. */
const PREFERRED: Record<Voice, string> = { f: 'samanta', m: 'daniele' };

export interface VoiceOption {
  id: string;
  name: string;
}

export interface ModelOption extends VoiceOption {
  /** Krediter per tecken — null när ElevenLabs inte säger det. */
  rate: number | null;
}

/** Kontots förbrukning den här perioden, som ElevenLabs räknar den. */
export interface Account {
  used: number;
  limit: number;
  /** När räkningen börjar om — null om det inte är känt. */
  resets: number | null;
}

interface VoiceSettings {
  apiKey: string;
  /** Rösten för kvinnor och för männen, på ElevenLabs. */
  f: string;
  m: string;
  modelId: string;
  /** Antal tecken som skickats för inläsning härifrån. */
  characters: number;
  /** Krediterna de har kostat, räknat på modellens pris per tecken. */
  credits: number;
  /** Sant om någon inläsning räknades med ett gissat pris. */
  guessed: boolean;
}

const EMPTY: VoiceSettings = {
  apiKey: '',
  f: '',
  m: '',
  modelId: '',
  characters: 0,
  credits: 0,
  guessed: false,
};

/** Ett fel med en förklaring som går att visa. */
export class VoiceError extends Error {}

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it');

/**
 * Kopplingen till ElevenLabs, som läser in italienskan med två röster: en kvinnlig och en
 * manlig. Som med Claude finns ingen server: nyckeln ligger i webbläsarens lagring och
 * anropen går direkt till ElevenLabs.
 *
 * Röster och modell väljs en gång och hålls fast — klipp med en annan röst är en annan
 * inläsning och återanvänds inte.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly storage = inject(StorageService);
  private readonly settings = signal<VoiceSettings>(EMPTY);

  readonly hasKey = computed(() => !!this.settings().apiKey);
  readonly modelId = computed(() => this.settings().modelId);
  readonly characters = computed(() => this.settings().characters);
  readonly credits = computed(() => this.settings().credits);
  readonly guessed = computed(() => this.settings().guessed);
  /** Sant när det går att läsa in: nyckel, båda rösterna och modell är valda. */
  readonly ready = computed(() => {
    const s = this.settings();
    return !!(s.apiKey && s.f && s.m && s.modelId);
  });

  /** Rösterna på kontot och modellerna som kan italienska — hämtas med `refresh()`. */
  readonly voices = signal<VoiceOption[]>([]);
  readonly models = signal<ModelOption[]>([]);
  readonly account = signal<Account | null>(null);

  /** Krediter per tecken med den valda modellen — null om det inte är känt. */
  readonly rate = computed(
    () => this.models().find((m) => m.id === this.settings().modelId)?.rate ?? null,
  );

  async load(): Promise<void> {
    const raw = await this.storage.get(VOICE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
      this.settings.set({
        apiKey: parsed.apiKey ?? '',
        f: parsed.f ?? '',
        m: parsed.m ?? '',
        modelId: parsed.modelId ?? '',
        characters: Number(parsed.characters) || 0,
        credits: Number(parsed.credits) || 0,
        guessed: !!parsed.guessed,
      });
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Den valda rösten av en sort. */
  voiceId(voice: Voice): string {
    return this.settings()[voice];
  }

  /** Etiketten som de egna klippen med en röst sparas under. */
  tag(voice: Voice): string {
    const s = this.settings();
    return voiceTag(voice, s[voice], s.modelId);
  }

  /** Prövar nyckeln genom att hämta röster och modeller, och sparar den om det går. */
  async saveKey(apiKey: string): Promise<void> {
    const key = apiKey.trim();
    if (!key) throw new VoiceError('Klistra in en nyckel först.');
    await this.refresh(key);
    this.update({ apiKey: key });
  }

  clearKey(): void {
    this.update({ apiKey: '' });
    this.account.set(null);
  }

  setVoice(voice: Voice, voiceId: string): void {
    this.update({ [voice]: voiceId });
  }

  setModel(modelId: string): void {
    this.update({ modelId });
  }

  /** Nollställer räkningen av det som lästs in härifrån. */
  resetCount(): void {
    this.update({ characters: 0, credits: 0, guessed: false });
  }

  /**
   * Hämtar kontots röster, modellerna som kan italienska och förbrukningen. Är en röst inte
   * vald tas Samanta respektive Daniele om de finns på kontot; är ingen modell vald tas den
   * första. Allt går att byta innan något har lästs in.
   */
  async refresh(apiKey = this.settings().apiKey): Promise<void> {
    if (!apiKey) return;
    const [voices, models] = await Promise.all([
      this.get<{ voices?: { voice_id: string; name?: string }[] }>('/v1/voices', apiKey),
      this.get<
        {
          model_id: string;
          name?: string;
          can_do_text_to_speech?: boolean;
          languages?: { language_id: string }[];
          model_rates?: { character_cost_multiplier?: number };
        }[]
      >('/v1/models', apiKey),
    ]);
    this.voices.set(
      (voices.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name ?? v.voice_id })),
    );
    this.models.set(
      (Array.isArray(models) ? models : [])
        .filter(
          (m) => m.can_do_text_to_speech && m.languages?.some((l) => l.language_id === LANGUAGE),
        )
        .map((m) => ({
          id: m.model_id,
          name: m.name ?? m.model_id,
          rate: m.model_rates?.character_cost_multiplier ?? null,
        })),
    );
    const s = this.settings();
    // En i taget, så att den andra inte får samma röst.
    const f = s.f || this.pick('f', s.m);
    const m = s.m || this.pick('m', f);
    this.update({ f, m, modelId: s.modelId || (this.models()[0]?.id ?? '') });
    await this.checkAccount(apiKey);
  }

  /**
   * Läser av kontots förbrukning. Tyst om det inte går — en nyckel kan sakna rätt att läsa
   * kontot, och då visas bara det som räknats härifrån.
   */
  async checkAccount(apiKey = this.settings().apiKey): Promise<void> {
    if (!apiKey) return;
    try {
      const sub = await this.get<{
        character_count?: number;
        character_limit?: number;
        next_character_count_reset_unix?: number;
      }>('/v1/user/subscription', apiKey);
      if (typeof sub.character_count !== 'number' || typeof sub.character_limit !== 'number') {
        return;
      }
      this.account.set({
        used: sub.character_count,
        limit: sub.character_limit,
        resets: sub.next_character_count_reset_unix
          ? sub.next_character_count_reset_unix * 1000
          : null,
      });
    } catch {
      this.account.set(null);
    }
  }

  /** Läser in en text med en röst och ger tillbaka ljudet som MP3. */
  async speak(text: string, voice: Voice): Promise<Uint8Array> {
    const s = this.settings();
    const voiceId = s[voice];
    if (!s.apiKey || !voiceId || !s.modelId) throw new VoiceError('Rösterna är inte valda.');
    const body: Record<string, unknown> = { text, model_id: s.modelId };
    // Språket låses där modellen tar emot det: ett ensamt «come» eller «a» ska läsas på
    // italienska. Multilingual v2 stöder inte fältet.
    if (!s.modelId.includes('multilingual_v2')) body['language_code'] = LANGUAGE;

    const res = await this.send(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${FORMAT}`,
      s.apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength) throw new VoiceError('ElevenLabs svarade utan ljud.');
    const rate = this.rate();
    const now = this.settings();
    this.update({
      characters: now.characters + text.length,
      credits: now.credits + text.length * (rate ?? 1),
      guessed: now.guessed || rate === null,
    });
    return bytes;
  }

  /** Den önskade rösten om den finns på kontot, annars den första som inte är `taken`. */
  private pick(voice: Voice, taken: string): string {
    const voices = this.voices();
    const wanted = voices.find((v) => plain(v.name).includes(PREFERRED[voice]));
    if (wanted) return wanted.id;
    const other = PREFERRED[voice === 'f' ? 'm' : 'f'];
    const free = voices.filter((v) => v.id !== taken && !plain(v.name).includes(other));
    return (free[0] ?? voices.find((v) => v.id !== taken) ?? voices[0])?.id ?? '';
  }

  private async get<T>(path: string, apiKey: string): Promise<T> {
    return (await (await this.send(path, apiKey)).json()) as T;
  }

  private async send(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(API + path, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'xi-api-key': apiKey },
      });
    } catch {
      throw new VoiceError('Kom inte fram till ElevenLabs. Kontrollera uppkopplingen.');
    }
    if (res.ok) return res;
    if (res.status === 401) throw new VoiceError('ElevenLabs godkände inte nyckeln.');
    if (res.status === 429) {
      throw new VoiceError('ElevenLabs säger stopp: för många anrop eller slut på krediter.');
    }
    // Felsvaret brukar säga vad som är fel — ta med det, det är utvecklaren som läser.
    let detail = '';
    try {
      const json = (await res.json()) as { detail?: { message?: string } | string };
      detail = typeof json.detail === 'string' ? json.detail : (json.detail?.message ?? '');
    } catch {
      /* inget läsbart svar */
    }
    throw new VoiceError(
      `ElevenLabs svarade med ett fel (${res.status}).${detail ? ' ' + detail : ''}`,
    );
  }

  private update(patch: Partial<VoiceSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    void this.storage.set(VOICE_KEY, JSON.stringify(this.settings()));
  }
}
