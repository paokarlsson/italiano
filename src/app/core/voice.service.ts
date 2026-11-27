import { computed, inject, Injectable, signal } from '@angular/core';
import { voiceTag } from './audio-pack';
import { StorageService } from './storage.service';

const VOICE_KEY = 'it_companion_voice_v1';
const API = 'https://api.elevenlabs.io';
/** MP3 i 64 kbit/s — ungefär 8 kB per sekund tal. */
const FORMAT = 'mp3_44100_64';
const LANGUAGE = 'it';

export interface VoiceOption {
  id: string;
  name: string;
}

interface VoiceSettings {
  apiKey: string;
  voiceId: string;
  modelId: string;
  /** Antal tecken som skickats för inläsning härifrån — det ElevenLabs räknar förbrukning i. */
  characters: number;
}

const EMPTY: VoiceSettings = { apiKey: '', voiceId: '', modelId: '', characters: 0 };

/** Ett fel med en förklaring som går att visa. */
export class VoiceError extends Error {}

/**
 * Kopplingen till ElevenLabs, som läser in italienskan. Som med Claude finns ingen server:
 * nyckeln ligger i webbläsarens lagring och anropen går direkt till ElevenLabs.
 *
 * Rösten och modellen väljs en gång och hålls fast — klipp med en annan röst är en annan
 * inläsning och återanvänds inte.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly storage = inject(StorageService);
  private readonly settings = signal<VoiceSettings>(EMPTY);

  readonly hasKey = computed(() => !!this.settings().apiKey);
  readonly voiceId = computed(() => this.settings().voiceId);
  readonly modelId = computed(() => this.settings().modelId);
  readonly characters = computed(() => this.settings().characters);
  /** Sant när det går att läsa in: nyckel, röst och modell är valda. */
  readonly ready = computed(() => {
    const s = this.settings();
    return !!(s.apiKey && s.voiceId && s.modelId);
  });
  /** Etiketten som de egna klippen sparas under. */
  readonly tag = computed(() => voiceTag(this.settings().voiceId, this.settings().modelId));

  /** Rösterna på kontot och modellerna som kan italienska — hämtas med `refresh()`. */
  readonly voices = signal<VoiceOption[]>([]);
  readonly models = signal<VoiceOption[]>([]);

  async load(): Promise<void> {
    const raw = await this.storage.get(VOICE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
      this.settings.set({
        apiKey: parsed.apiKey ?? '',
        voiceId: parsed.voiceId ?? '',
        modelId: parsed.modelId ?? '',
        characters: Number(parsed.characters) || 0,
      });
    } catch {
      /* trasig data ignoreras */
    }
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
  }

  setVoice(voiceId: string): void {
    this.update({ voiceId });
  }

  setModel(modelId: string): void {
    this.update({ modelId });
  }

  /**
   * Hämtar kontots röster och modellerna som kan italienska. Är ingen röst eller modell vald
   * tas den första — den går att byta innan något har lästs in.
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
        .map((m) => ({ id: m.model_id, name: m.name ?? m.model_id })),
    );
    const s = this.settings();
    this.update({
      voiceId: s.voiceId || (this.voices()[0]?.id ?? ''),
      modelId: s.modelId || (this.models()[0]?.id ?? ''),
    });
  }

  /** Läser in en text och ger tillbaka ljudet som MP3. */
  async speak(text: string): Promise<Uint8Array> {
    const { apiKey, voiceId, modelId } = this.settings();
    if (!apiKey || !voiceId || !modelId) throw new VoiceError('Ingen röst är vald.');
    const body: Record<string, unknown> = { text, model_id: modelId };
    // Språket låses där modellen tar emot det: ett ensamt «come» eller «a» ska läsas på
    // italienska. Multilingual v2 stöder inte fältet.
    if (!modelId.includes('multilingual_v2')) body['language_code'] = LANGUAGE;

    const res = await this.send(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${FORMAT}`,
      apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength) throw new VoiceError('ElevenLabs svarade utan ljud.');
    this.update({ characters: this.settings().characters + text.length });
    return bytes;
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
      throw new VoiceError('ElevenLabs säger stopp: för många anrop eller slut på tecken.');
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
