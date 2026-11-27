import { computed, inject, Injectable, signal } from '@angular/core';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TEMPLATE,
  IMAGE_MODELS,
  imageFrom,
  imageRequest,
} from './cover';
import { StorageService } from './storage.service';

const GEMINI_KEY = 'it_companion_gemini_v1';
const API = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiSettings {
  apiKey: string;
  model: string;
  /** Mallen som läggs före varje boks prompt — tom betyder standardmallen. */
  template: string;
  /** Läsarens egna bildprompter per bok, där de skiljer sig från bokens. */
  prompts: Record<string, string>;
  /** Antal bilder som skapats härifrån. */
  images: number;
}

const EMPTY: GeminiSettings = { apiKey: '', model: '', template: '', prompts: {}, images: 0 };

/** Ett fel med en förklaring som går att visa. */
export class GeminiError extends Error {}

/**
 * Kopplingen till Googles Gemini API, som ritar omslagen. Som med Claude och ElevenLabs
 * finns ingen server: nyckeln ligger i webbläsarens lagring och anropen går direkt till
 * Google.
 */
@Injectable({ providedIn: 'root' })
export class GeminiService {
  private readonly storage = inject(StorageService);
  private readonly settings = signal<GeminiSettings>(EMPTY);

  readonly hasKey = computed(() => !!this.settings().apiKey);
  readonly model = computed(() => this.settings().model || DEFAULT_IMAGE_MODEL);
  readonly images = computed(() => this.settings().images);
  /** Mallen som gäller: läsarens egen, eller standardmallen. */
  readonly template = computed(() => this.settings().template || DEFAULT_TEMPLATE);
  readonly customTemplate = computed(() => !!this.settings().template);
  readonly models = IMAGE_MODELS;

  async load(): Promise<void> {
    try {
      const raw = await this.storage.get(GEMINI_KEY);
      if (raw) this.settings.set({ ...EMPTY, ...(JSON.parse(raw) as Partial<GeminiSettings>) });
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Prövar nyckeln mot Google och sparar den om den godkänns. */
  async saveKey(key: string): Promise<void> {
    const apiKey = key.trim();
    if (!apiKey) throw new GeminiError('Klistra in nyckeln först.');
    const res = await this.call(`${API}/models?pageSize=1`, apiKey);
    if (!res.ok) throw await this.failure(res);
    this.update({ apiKey });
  }

  clearKey(): void {
    this.update({ apiKey: '' });
  }

  setModel(model: string): void {
    this.update({ model });
  }

  /** Sparar mallen. Samma text som standardmallen, eller tom, betyder standardmallen. */
  setTemplate(text: string): void {
    const t = text.trim();
    this.update({ template: t === DEFAULT_TEMPLATE.trim() ? '' : t });
  }

  resetTemplate(): void {
    this.update({ template: '' });
  }

  /** Läsarens egen bildprompt för en bok — tom om bokens egen gäller. */
  prompt(bookId: string): string {
    return this.settings().prompts[bookId] ?? '';
  }

  /** Sparar en egen bildprompt för en bok. Tom, eller samma som bokens, tar bort den. */
  setPrompt(bookId: string, text: string, original = ''): void {
    const prompts = { ...this.settings().prompts };
    const t = text.trim();
    if (!t || t === original.trim()) delete prompts[bookId];
    else prompts[bookId] = t;
    this.update({ prompts });
  }

  /** Ritar en bild efter prompten. */
  async generate(prompt: string): Promise<{ mime: string; bytes: Uint8Array }> {
    const { apiKey } = this.settings();
    if (!apiKey) throw new GeminiError('Ingen Gemini-nyckel är inlagd.');
    const res = await this.call(
      `${API}/models/${encodeURIComponent(this.model())}:generateContent`,
      apiKey,
      imageRequest(prompt),
    );
    if (!res.ok) throw await this.failure(res);
    try {
      const image = imageFrom(await res.json());
      this.update({ images: this.settings().images + 1 });
      return image;
    } catch (e) {
      throw new GeminiError(e instanceof Error ? e.message : 'Svaret gick inte att läsa.');
    }
  }

  private async call(url: string, apiKey: string, body?: unknown): Promise<Response> {
    try {
      return await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'x-goog-api-key': apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GeminiError('Kunde inte nå Google. Kontrollera anslutningen.');
    }
  }

  /** Ett misslyckat svar som ett fel att visa, med Googles egen förklaring när den finns. */
  private async failure(res: Response): Promise<GeminiError> {
    let said = '';
    try {
      said = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      /* inget att läsa */
    }
    if (res.status === 400 && /api key/i.test(said)) {
      return new GeminiError('Google godkänner inte nyckeln.');
    }
    if (res.status === 401 || res.status === 403) {
      return new GeminiError(`Nyckeln får inte använda Gemini API${said ? `: ${said}` : '.'}`);
    }
    if (res.status === 404) {
      return new GeminiError(`Modellen ${this.model()} finns inte för nyckeln. Välj en annan.`);
    }
    if (res.status === 429) {
      return new GeminiError(`Kvoten är slut för stunden${said ? `: ${said}` : '.'}`);
    }
    return new GeminiError(`Gemini svarade ${res.status}${said ? `: ${said}` : '.'}`);
  }

  private update(patch: Partial<GeminiSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    void this.storage.set(GEMINI_KEY, JSON.stringify(this.settings()));
  }
}
