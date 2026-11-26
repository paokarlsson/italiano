import { computed, inject, Injectable, signal } from '@angular/core';
import { UserText } from '../models/leggi.models';
import {
  AiError,
  assembleText,
  exampleFrom,
  glossPrompt,
  mergeRepair,
  namesOf,
  PASTE_MAX_CHARS,
  RawEntry,
  RawText,
  REPAIR_SCHEMA,
  repairPrompt,
  systemPrompt,
  TEXT_SCHEMA,
  writePrompt,
} from './ai-text';
import { DataService } from './data.service';
import { LeggiService } from './leggi.service';
import { StorageService } from './storage.service';

const AI_KEY = 'it_companion_ai_v1';

/** Så många öppna ord som vävs in i en ny text. */
const WEAVE_MAX = 5;

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

/** Pris i dollar per miljon tokens (in, ut) — Anthropics listpriser, november 2026. */
export const AI_MODELS: readonly {
  id: AiModel;
  label: string;
  note: string;
  price: [number, number];
}[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', note: 'förvald', price: [4, 20] },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'ungefär halva priset', price: [2, 10] },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'billigast', price: [0.1, 0.5] },
];

const DEFAULT_MODEL: AiModel = 'claude-opus-5-5';

interface AiSettings {
  apiKey: string;
  model: AiModel;
}

type Effort = 'low' | 'medium';
type Schema = typeof TEXT_SCHEMA | typeof REPAIR_SCHEMA;

/** Resultatet av en beställning: texten, och det läsaren bör få veta om den. */
export interface AiResult {
  text: UserText;
  /** Ungefärlig kostnad i dollar, räknad på listpriset för den valda modellen. */
  cost: number;
  /** Ord som blev utan uppslag trots komplettering. */
  missing: string[];
  /** Falskt om italienskan i en inklistrad text inte längre är ordagrant densamma. */
  faithful: boolean;
}

/**
 * Kopplingen till Claude. Appen har ingen server: nyckeln ligger i webbläsarens lagring och
 * anropen går direkt till Anthropic. SDK:t laddas först när det behövs.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly storage = inject(StorageService);
  private readonly data = inject(DataService);
  private readonly leggi = inject(LeggiService);

  private readonly settings = signal<AiSettings>({ apiKey: '', model: DEFAULT_MODEL });

  readonly hasKey = computed(() => !!this.settings().apiKey);
  readonly model = computed(() => this.settings().model);
  /** Vad som pågår just nu — tomt när inget anrop är igång. */
  readonly status = signal('');
  readonly busy = computed(() => !!this.status());

  async load(): Promise<void> {
    const raw = await this.storage.get(AI_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<AiSettings>;
      this.settings.set({
        apiKey: parsed.apiKey ?? '',
        model: AI_MODELS.some((m) => m.id === parsed.model) ? parsed.model! : DEFAULT_MODEL,
      });
    } catch {
      /* trasig data ignoreras */
    }
  }

  /** Prövar nyckeln mot Anthropic och sparar den om den godkänns. */
  async saveKey(apiKey: string): Promise<void> {
    const key = apiKey.trim();
    if (!key) throw new AiError('no-key', 'Klistra in en nyckel först.');
    this.status.set('Prövar nyckeln…');
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      await client.models.retrieve(this.settings().model);
      this.update({ apiKey: key });
    } catch (error) {
      throw await describe(error);
    } finally {
      this.status.set('');
    }
  }

  clearKey(): void {
    this.update({ apiKey: '' });
  }

  setModel(model: AiModel): void {
    this.update({ model });
  }

  /** Beställer en ny text på läsarens nivå, med de öppna orden invävda. */
  async write(topic: string): Promise<AiResult> {
    const level = this.leggi.level();
    const weave = this.leggi
      .openWordDetails()
      .slice(0, WEAVE_MAX)
      .map((w) => ({ form: w.key, sv: w.entry.sv }));
    const avoid = [...this.leggi.texts(), ...this.leggi.userTexts()].map((t) => t.title);
    return this.produce(
      writePrompt({ level, weave, topic, avoid }),
      'medium',
      { source: 'ai', level },
      weave.map((w) => w.form),
    );
  }

  /** Gör en inklistrad italiensk text läsbar: meningar, översättning och uppslag. */
  async gloss(pasted: string): Promise<AiResult> {
    const original = pasted.trim();
    if (!original) throw new AiError('bad-shape', 'Klistra in en text först.');
    if (original.length > PASTE_MAX_CHARS) {
      throw new AiError('too-long', `Texten är för lång — högst ${PASTE_MAX_CHARS} tecken.`);
    }
    return this.produce(glossPrompt(original), 'medium', {
      source: 'paste',
      level: null,
      original,
    });
  }

  private async produce(
    prompt: string,
    effort: Effort,
    meta: { source: 'ai' | 'paste'; level: number | null; original?: string },
    weave: string[] = [],
  ): Promise<AiResult> {
    if (!this.hasKey()) throw new AiError('no-key', 'Ingen nyckel är inlagd.');
    if (this.busy()) throw new AiError('api', 'En text är redan på väg.');
    this.status.set('Skickar… det brukar ta en halv minut');
    try {
      const system = this.system(meta.level, weave);
      const opts = {
        deckIds: new Set(this.data.pillars().flatMap((p) => p.decks.map((d) => d.deckId))),
      };
      const first = await this.call(system, prompt, TEXT_SCHEMA, effort);
      const raw = first.output as RawText;
      let { text, missing, faithful } = assembleText(raw, {
        ...opts,
        ...meta,
        id: `${meta.source}-${Date.now().toString(36)}`,
        createdAt: Date.now(),
      });
      let cost = first.cost;

      // En komplettering, inte fler: det som fortfarande saknas blir ord utan uppslag.
      if (missing.length) {
        this.status.set(`Kompletterar ${missing.length} ord…`);
        const second = await this.call(
          system,
          repairPrompt(
            text.sentences.map((s) => s.it),
            missing,
          ),
          REPAIR_SCHEMA,
          'low',
        );
        const repair = second.output as { lexicon: RawEntry[]; names: string[] };
        ({ text, missing } = mergeRepair(text, repair, namesOf(raw), opts));
        cost += second.cost;
      }

      this.leggi.addUserText(text);
      return { text, cost, missing, faithful };
    } catch (error) {
      throw await describe(error);
    } finally {
      this.status.set('');
    }
  }

  /** Ett anrop med svaret låst till ett schema. Returnerar det tolkade svaret och vad det kostade. */
  private async call(
    system: string,
    prompt: string,
    schema: Schema,
    effort: Effort,
  ): Promise<{ output: unknown; cost: number }> {
    const [{ default: Anthropic }, { jsonSchemaOutputFormat }] = await Promise.all([
      import('@anthropic-ai/sdk'),
      import('@anthropic-ai/sdk/helpers/json-schema'),
    ]);
    const { apiKey, model } = this.settings();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    // Haiku har ingen reservmodell på serversidan; de andra får Anthropics förvalda.
    const withFallback = model !== 'claude-haiku-5-5';
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 32000,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort, format: jsonSchemaOutputFormat(schema) },
      ...(withFallback
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    });
    stream.on('text', (_delta, snapshot) => {
      if (this.status().startsWith('Kompletterar')) return;
      this.status.set(snapshot.includes('"lexicon"') ? 'Slår upp orden…' : 'Skriver texten…');
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new AiError('refusal', 'Claude avböjde att skriva den här texten.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiError('too-long', 'Svaret blev för långt och klipptes. Pröva en kortare text.');
    }
    if (!message.parsed_output) {
      throw new AiError('bad-shape', 'Svaret gick inte att läsa. Försök igen.');
    }
    const [input, output] = AI_MODELS.find((m) => m.id === model)!.price;
    const cost =
      (message.usage.input_tokens * input + message.usage.output_tokens * output) / 1_000_000;
    return { output: message.parsed_output, cost };
  }

  /**
   * Systemprompten, med en inbyggd text som mall. Mallen väljs så nära den beställda nivån
   * som möjligt utan att gå över, och helst utan orden som ska vävas in — annars skriver
   * Claude gärna om mallen i stället för att hitta på något nytt.
   */
  private system(level: number | null, weave: readonly string[]): string {
    const all = this.leggi.texts();
    const within = all.filter((t) => level === null || (t.level ?? 1) <= level);
    const pool = within.length ? within : all;
    const forms = new Set(weave);
    const fresh = pool.filter(
      (t) =>
        !this.leggi
          .tokens(t.id)
          .flat()
          .some((token) => token.key && forms.has(token.key)),
    );
    const text = (fresh.length ? fresh : pool).at(-1)!;
    return systemPrompt(
      this.data.pillars(),
      exampleFrom(text, this.leggi.tokens(text.id), this.leggi.knownNames()),
    );
  }

  private update(patch: Partial<AiSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    void this.storage.set(AI_KEY, JSON.stringify(this.settings()));
  }
}

/** Översätter ett fel från SDK:t till något läsaren kan göra något åt. */
async function describe(error: unknown): Promise<AiError> {
  if (error instanceof AiError) return error;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError('bad-key', 'Anthropic godkände inte nyckeln. Kontrollera att den är rätt.');
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError('bad-key', 'Nyckeln har inte tillgång till den valda modellen.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('rate-limit', 'För många anrop just nu. Vänta en stund och försök igen.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError('network', 'Kom inte fram till Anthropic. Kontrollera uppkopplingen.');
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError('api', `Anthropic svarade med ett fel (${error.status ?? '?'}).`);
  }
  return new AiError('api', 'Något gick fel. Försök igen.');
}
