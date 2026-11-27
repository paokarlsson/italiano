import { computed, inject, Injectable, signal } from '@angular/core';
import { BookChapterPlan, StoryData, UserText } from '../models/leggi.models';
import {
  BOOK_MAX_PAGES,
  BOOK_MIN_PAGES,
  BOOK_PLAN_SCHEMA,
  BOOK_PLAN_SYSTEM,
  BOOK_TOPIC_MAX,
  BookRequest,
  bookPagePrompt,
  bookPageProblems,
  bookPlanPrompt,
  cleanPlan,
  namesOn,
  newBook,
  pagesLeft,
  plannedCount,
  RawBookPlan,
  toPage,
  withPage,
} from './ai-book';
import {
  cleanDeckQuestions,
  DECK_SYSTEM,
  deckPrompt,
  deckSchema,
  quickTags,
  RawDeckQuestions,
} from './ai-deck';
import { EXPLAIN_SYSTEM } from './ai-explain';
import { adaptProblems, adaptPrompt, storySystem } from './ai-story';
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
import { LEVELS } from './levels';
import { focusOf } from './profile';
import { deckStats } from './recommend';
import { StatsService } from './stats.service';
import { StorageService } from './storage.service';
import { StoryStore } from './story-store';

const AI_KEY = 'it_companion_ai_v1';

/** Så många öppna ord som vävs in i en ny text. */
const WEAVE_MAX = 5;
/** Så många förklaringar som hålls kvar i minnet. */
const EXPLAINED_MAX = 200;

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
  /** Om appen fyller på av sig själv: texter på lager och fler frågor i uttömda mazzi. */
  auto: boolean;
  /** Ungefärlig kostnad i dollar för allt som beställts härifrån. */
  spent: number;
}

type Effort = 'low' | 'medium';
type Schema =
  | typeof TEXT_SCHEMA
  | typeof REPAIR_SCHEMA
  | typeof BOOK_PLAN_SCHEMA
  | ReturnType<typeof deckSchema>;
/** Vad som sägs medan svaret skrivs, utifrån det som kommit så långt. */
type Progress = (snapshot: string) => string;

const EMPTY: AiSettings = { apiKey: '', model: DEFAULT_MODEL, auto: true, spent: 0 };

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

/** Resultatet av en bok: hur långt den kom, vad den kostade, och felet om den stannade. */
export interface BookResult {
  id: string;
  cost: number;
  /** Ord som blev utan uppslag, på alla sidor tillsammans. */
  missing: number;
  /** Sidor som är skrivna och sidor i planen. */
  written: number;
  planned: number;
  error: AiError | null;
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
  private readonly stats = inject(StatsService);
  private readonly story = inject(StoryStore);

  private readonly settings = signal<AiSettings>(EMPTY);

  readonly hasKey = computed(() => !!this.settings().apiKey);
  readonly model = computed(() => this.settings().model);
  readonly auto = computed(() => this.settings().auto);
  readonly spent = computed(() => this.settings().spent);
  /** Vad som pågår just nu — tomt när inget anrop är igång. */
  readonly status = signal('');
  /** Sant medan en serie texter skrivs — också i pausen mellan två av dem. */
  private readonly series = signal(false);
  readonly busy = computed(() => !!this.status() || this.series());

  /** Pelaren där uppslagen hopar sig — det nästa text görs tät på. Null när inget sticker ut. */
  readonly focus = computed(() => focusOf(this.leggi.profile()));
  /** Den senaste texten från Claude — den en ny text kan fortsätta på. */
  readonly lastPart = computed(() => this.leggi.userTexts().find((t) => t.source === 'ai') ?? null);

  /** Förklaringar som redan hämtats — samma fråga kostar inget en gång till. */
  private readonly explained = new Map<string, string>();

  async load(): Promise<void> {
    const raw = await this.storage.get(AI_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<AiSettings>;
      this.settings.set({
        apiKey: parsed.apiKey ?? '',
        model: AI_MODELS.some((m) => m.id === parsed.model) ? parsed.model! : DEFAULT_MODEL,
        auto: parsed.auto ?? true,
        spent: Number(parsed.spent) || 0,
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

  /** Nollställer räkningen av det förbrukade. */
  resetSpent(): void {
    this.update({ spent: 0 });
  }

  setModel(model: AiModel): void {
    this.update({ model });
  }

  setAuto(auto: boolean): void {
    this.update({ auto });
  }

  /**
   * Beställer en ny text på läsarens nivå: de öppna orden invävda, tät på pelaren där
   * uppslagen hopar sig, och — om `follow` är sant — som nästa del av berättelsen.
   */
  async write(topic: string, follow = true, label = ''): Promise<AiResult> {
    const level = this.leggi.level();
    const weave = this.weave();
    const avoid = [...this.leggi.texts(), ...this.leggi.userTexts()].map((t) => t.title);
    const focus = this.focusRequest();
    const last = follow ? this.lastPart() : null;
    const part = last ? (last.part ?? 1) + 1 : 1;

    return this.produce(
      writePrompt({
        level,
        weave,
        topic,
        avoid,
        focus,
        story: last && {
          part,
          recap: last.recap ?? '',
          title: last.title,
          last: last.sentences.map((s) => s.it),
        },
      }),
      'medium',
      { source: 'ai', level, part },
      weave.map((w) => w.form),
      label,
    );
  }

  /**
   * Skriver om en sida i följetongen åt läsaren: på läsarens nivå, med de öppna orden
   * invävda och tät på pelaren där uppslagen hopar sig — men med samma scen, berättare,
   * låsta repliker och grammatik som sidan har i planen. Håller omskrivningen inte efter ett
   * andra försök läses sidan som den står, och ingen ny beställs för den.
   */
  async adapt(pageId: string, label = ''): Promise<{ text: UserText | null; cost: number }> {
    const item = this.story.item(pageId);
    if (item?.kind !== 'page') throw new AiError('bad-shape', 'Sidan finns inte i berättelsen.');
    const { page, chapter, story } = item;
    if (!story.canon?.length) throw new AiError('bad-shape', 'Berättelsen skrivs inte om.');
    const canon = await this.story.loadCanon(story).catch(() => {
      throw new AiError('network', 'Berättelsens kanon gick inte att hämta.');
    });
    const reader = this.leggi.level();
    const weave = this.weave();
    const items = this.story.itemsOf(story);
    const before = items
      .slice(
        0,
        items.findIndex((i) => i.id === pageId),
      )
      .reverse()
      .find((i) => i.kind === 'page');
    const prev = before && this.leggi.text(before.id);
    const request = {
      page,
      chapter,
      reader,
      weave,
      focus: this.focusRequest(),
      previous: prev && { title: prev.title, sentences: prev.sentences.map((s) => s.it) },
    };
    const system = storySystem(this.system(null, [], true), canon);
    const meta = { source: 'ai' as const, level: reader, part: page.part };
    const forms = weave.map((w) => w.form);

    let cost = 0;
    let problems: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.compose(
        adaptPrompt({ ...request, problems }),
        'medium',
        meta,
        forms,
        `${label}${attempt ? 'Försöker igen · ' : ''}`,
        system,
      );
      cost += result.cost;
      const text: UserText = { ...result.text, id: pageId, narrator: page.narrator };
      delete text.recap;
      problems = adaptProblems(text, page, reader);
      if (!problems.length && !result.missing.length) {
        this.story.setAdapted(pageId, text);
        return { text, cost };
      }
      if (result.missing.length) problems.push(`ord utan uppslag: ${result.missing.join(', ')}`);
    }
    this.story.markFailed(pageId);
    return { text: null, cost };
  }

  /**
   * Skriver flera texter i följd, som delar i samma berättelse: den första fortsätter på den
   * senaste om `follow` är sant, resten på den som just skrevs. Påfyllningen väntar under
   * tiden. Går en text fel ligger de som hann skrivas kvar, och felet följer med svaret.
   */
  async writeSeries(
    topic: string,
    follow: boolean,
    count: number,
  ): Promise<{ results: AiResult[]; error: AiError | null }> {
    if (this.busy()) throw new AiError('api', 'En beställning är redan på väg.');
    this.series.set(true);
    const results: AiResult[] = [];
    try {
      for (let i = 0; i < count; i++) {
        const label = count > 1 ? `Text ${i + 1} av ${count} · ` : '';
        try {
          results.push(await this.write(topic, follow || i > 0, label));
        } catch (e) {
          const error = e instanceof AiError ? e : new AiError('api', 'Något gick fel.');
          if (!results.length) throw error;
          return { results, error };
        }
      }
      return { results, error: null };
    } finally {
      this.series.set(false);
    }
  }

  /**
   * Beställer en egen bok: först en plan — titel, personer och en scen per sida — sedan
   * sidorna en i taget efter planen, på den valda nivån. Boken sparas efter varje sida, så
   * att det som hunnit skrivas går att läsa om något går fel på vägen, och resten kan
   * skrivas senare med continueBook(). Påfyllningen väntar under tiden.
   */
  async writeBook(req: BookRequest): Promise<BookResult> {
    if (!this.hasKey()) throw new AiError('no-key', 'Ingen nyckel är inlagd.');
    if (this.busy()) throw new AiError('api', 'En beställning är redan på väg.');
    const request: BookRequest = {
      topic: req.topic.trim().slice(0, BOOK_TOPIC_MAX),
      level: Math.min(LEVELS.length, Math.max(1, Math.round(req.level))),
      pages: Math.min(BOOK_MAX_PAGES, Math.max(BOOK_MIN_PAGES, Math.round(req.pages))),
      sequel: req.sequel ?? null,
    };
    this.series.set(true);
    try {
      const say = 'Planerar boken…';
      this.status.set(say);
      let planned;
      try {
        planned = await this.call(
          BOOK_PLAN_SYSTEM,
          bookPlanPrompt(request),
          BOOK_PLAN_SCHEMA,
          'medium',
          () => say,
        );
      } catch (error) {
        throw await describe(error);
      } finally {
        this.status.set('');
      }
      const plan = cleanPlan(planned.output as RawBookPlan, request.pages);
      const now = Date.now();
      const book = newBook(`bok-${now.toString(36)}`, request, plan, now);
      this.story.saveBook(book);
      const filled = await this.fillBook(book.id);
      return { ...filled, cost: filled.cost + planned.cost };
    } finally {
      this.series.set(false);
    }
  }

  /** Skriver de sidor i en egen bok som återstår enligt planen. */
  async continueBook(id: string): Promise<BookResult> {
    if (!this.hasKey()) throw new AiError('no-key', 'Ingen nyckel är inlagd.');
    if (this.busy()) throw new AiError('api', 'En beställning är redan på väg.');
    if (!this.story.book(id)) throw new AiError('bad-shape', 'Boken finns inte.');
    this.series.set(true);
    try {
      return await this.fillBook(id);
    } finally {
      this.series.set(false);
    }
  }

  /** Skriver sidorna som återstår, en i taget. Stannar vid första fel och säger det. */
  private async fillBook(id: string): Promise<BookResult> {
    let cost = 0;
    let missing = 0;
    let error: AiError | null = null;
    for (;;) {
      const story = this.story.book(id);
      if (!story?.own) break;
      const left = pagesLeft(story);
      if (!left.length) break;
      const total = plannedCount(story.own);
      const label = `Sida ${total - left.length + 1} av ${total} · `;
      try {
        const page = await this.writeBookPage(story, left[0].chapter, left[0].part, label);
        cost += page.cost;
        missing += page.missing;
      } catch (e) {
        error = e instanceof AiError ? e : new AiError('api', 'Något gick fel. Försök igen.');
        break;
      }
    }
    const story = this.story.book(id);
    const planned = story?.own ? plannedCount(story.own) : 0;
    const written = story?.chapters.reduce((n, c) => n + c.pages.length, 0) ?? 0;
    return { id, cost, missing, written, planned, error };
  }

  /**
   * En sida i en egen bok, med ett andra försök om den första inte höll för kontrollen. Den
   * bästa av de två läggs in även om den inte höll helt — hellre en sida med ett för långt
   * ord än ingen sida alls.
   */
  private async writeBookPage(
    story: StoryData,
    chapter: BookChapterPlan,
    part: number,
    label: string,
  ): Promise<{ cost: number; missing: number }> {
    const level = story.own!.level;
    const before = story.chapters
      .flatMap((c) => c.pages)
      .filter((p) => p.chapter < chapter.n || (p.chapter === chapter.n && p.part < part))
      .at(-1);
    const previous = before && {
      title: before.title,
      sentences: before.sentences.map((s) => s.it),
    };
    // Samma systemprompt för varje sida, så att den cachas genom hela boken.
    const system = this.system(level, []);
    let cost = 0;
    let problems: string[] = [];
    let best: (AiResult & { problems: string[] }) | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.compose(
        bookPagePrompt({ story, chapter, part, previous, problems }),
        'medium',
        { source: 'ai', level, part },
        [],
        `${label}${attempt ? 'Försöker igen · ' : ''}`,
        system,
      );
      cost += result.cost;
      problems = bookPageProblems(result.text, level, result.missing);
      if (!best || problems.length < best.problems.length) best = { ...result, problems };
      if (!problems.length) break;
    }
    const fresh = this.story.book(story.id) ?? story;
    const page = toPage(best!.text, fresh, chapter, part);
    this.story.saveBook(withPage(fresh, page, namesOn(best!.text, best!.missing)));
    return { cost, missing: best!.missing.length };
  }

  /**
   * Bygger ut ett mazzo med nya frågor på samma punkt, flest där det går sämst för läsaren.
   * Returnerar hur många som höll för kontrollen och lades till.
   */
  async extend(deckId: string, label = ''): Promise<{ added: number; cost: number }> {
    const entry = this.data.entry(deckId);
    if (!entry) throw new AiError('bad-shape', 'Mazzot finns inte.');
    const { deck, pillar } = entry;
    const tags = quickTags(deck);
    if (!tags.length) return { added: 0, cost: 0 };
    if (!this.hasKey()) throw new AiError('no-key', 'Ingen nyckel är inlagd.');
    if (this.busy()) throw new AiError('api', 'En beställning är redan på väg.');

    const stats = this.stats.stats().tags;
    const accuracy = Object.fromEntries(
      tags.map((tag) => {
        const s = stats[`${deckId}::${tag}`];
        return [tag, s?.attempts ? s.correct / s.attempts : null];
      }),
    );
    const say = `${label}Skriver nya frågor till ${deck.title}…`;
    this.status.set(say);
    try {
      const { output, cost } = await this.call(
        DECK_SYSTEM,
        deckPrompt({ deck, pillarTitle: pillar.pillarTitle, accuracy }),
        deckSchema(tags),
        'medium',
        () => say,
      );
      const questions = cleanDeckQuestions(output as RawDeckQuestions, deck);
      this.data.addQuestions(deckId, questions, deckStats(deck, stats).attempts);
      return { added: questions.length, cost };
    } catch (error) {
      throw await describe(error);
    } finally {
      this.status.set('');
    }
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

  /** Skriver en text och lägger den bland läsarens egna. */
  private async produce(
    prompt: string,
    effort: Effort,
    meta: { source: 'ai' | 'paste'; level: number | null; original?: string; part?: number },
    weave: string[] = [],
    label = '',
  ): Promise<AiResult> {
    const result = await this.compose(prompt, effort, meta, weave, label);
    this.leggi.addUserText(result.text);
    return result;
  }

  /** Skriver en text, med en komplettering om ord saknar uppslag — utan att spara den. */
  private async compose(
    prompt: string,
    effort: Effort,
    meta: { source: 'ai' | 'paste'; level: number | null; original?: string; part?: number },
    weave: string[] = [],
    label = '',
    systemText?: string,
  ): Promise<AiResult> {
    if (!this.hasKey()) throw new AiError('no-key', 'Ingen nyckel är inlagd.');
    // En serie skriver sina texter här en i taget — det är bara ett anrop som pågår som stoppar.
    if (this.status()) throw new AiError('api', 'En beställning är redan på väg.');
    this.status.set(`${label}Skickar… det brukar ta en halv minut`);
    const writing: Progress = (snapshot) =>
      label + (snapshot.includes('"lexicon"') ? 'Slår upp orden…' : 'Skriver texten…');
    try {
      const system = systemText ?? this.system(meta.level, weave);
      const opts = {
        deckIds: new Set(this.data.pillars().flatMap((p) => p.decks.map((d) => d.deckId))),
      };
      const first = await this.call(system, prompt, TEXT_SCHEMA, effort, writing);
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
        const repairing = `${label}Kompletterar ${missing.length} ord…`;
        this.status.set(repairing);
        const second = await this.call(
          system,
          repairPrompt(
            text.sentences.map((s) => s.it),
            missing,
          ),
          REPAIR_SCHEMA,
          'low',
          () => repairing,
        );
        const repair = second.output as { lexicon: RawEntry[]; names: string[] };
        ({ text, missing } = mergeRepair(text, repair, namesOf(raw), opts));
        cost += second.cost;
      }

      return { text, cost, missing, faithful };
    } catch (error) {
      throw await describe(error);
    } finally {
      this.status.set('');
    }
  }

  /** Förklaringen till en fråga, om den redan är hämtad. */
  explanation(prompt: string): string | null {
    return this.explained.get(prompt) ?? null;
  }

  /**
   * «Perché?» — en kort förklaring i löpande text, på den valda modellen med lägsta effort.
   * `onText` får texten så långt den hunnit, medan den skrivs. Avbryts med `signal`.
   */
  async explain(
    prompt: string,
    onText: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.hasKey()) throw new AiError('no-key', 'Ingen nyckel är inlagd.');
    const known = this.explained.get(prompt);
    if (known) {
      onText(known);
      return known;
    }
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const { apiKey, model } = this.settings();
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: 8000,
          system: EXPLAIN_SYSTEM,
          messages: [{ role: 'user', content: prompt }],
          output_config: { effort: 'low' },
          ...fallback(model),
        },
        { signal },
      );
      stream.on('text', (_delta, snapshot) => onText(snapshot.trimStart()));
      const message = await stream.finalMessage();
      this.charge(message.usage);

      if (message.stop_reason === 'refusal') {
        throw new AiError('refusal', 'Claude avböjde att förklara det här.');
      }
      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim();
      if (!text) throw new AiError('bad-shape', 'Det kom ingen förklaring. Försök igen.');

      if (this.explained.size >= EXPLAINED_MAX) {
        this.explained.delete(this.explained.keys().next().value!);
      }
      this.explained.set(prompt, text);
      onText(text);
      return text;
    } catch (error) {
      throw await describe(error);
    }
  }

  /** Ett anrop med svaret låst till ett schema. Returnerar det tolkade svaret och vad det kostade. */
  private async call(
    system: string,
    prompt: string,
    schema: Schema,
    effort: Effort,
    progress: Progress,
  ): Promise<{ output: unknown; cost: number }> {
    const [{ default: Anthropic }, { jsonSchemaOutputFormat }] = await Promise.all([
      import('@anthropic-ai/sdk'),
      import('@anthropic-ai/sdk/helpers/json-schema'),
    ]);
    const { apiKey, model } = this.settings();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const stream = client.beta.messages.stream({
      model,
      max_tokens: 32000,
      // Systemprompten — pelarna, nivåerna, mazzin och mallen — är densamma för varje text i
      // en serie och för kompletteringen, så den cachas och läses sedan till en tiondel av
      // priset. Är den för kort för modellens cache händer ingenting.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort, format: jsonSchemaOutputFormat(schema) },
      ...fallback(model),
    });
    stream.on('text', (_delta, snapshot) => this.status.set(progress(snapshot)));
    const message = await stream.finalMessage();
    const cost = this.charge(message.usage);

    if (message.stop_reason === 'refusal') {
      throw new AiError('refusal', 'Claude avböjde den här beställningen.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiError('too-long', 'Svaret blev för långt och klipptes. Pröva en kortare text.');
    }
    if (!message.parsed_output) {
      throw new AiError('bad-shape', 'Svaret gick inte att läsa. Försök igen.');
    }
    return { output: message.parsed_output, cost };
  }

  /** Räknar ut vad ett anrop kostade på listpriset och lägger det till det förbrukade. */
  private charge(usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  }): number {
    const [input, output] = AI_MODELS.find((m) => m.id === this.settings().model)!.price;
    // Att skriva till cachen kostar 1,25 gånger inpriset, att läsa ur den en tiondel.
    const cost =
      (usage.input_tokens * input +
        (usage.cache_creation_input_tokens ?? 0) * input * 1.25 +
        (usage.cache_read_input_tokens ?? 0) * input * 0.1 +
        usage.output_tokens * output) /
      1_000_000;
    this.update({ spent: this.settings().spent + cost });
    return cost;
  }

  /**
   * Systemprompten, med en inbyggd text som mall. Mallen väljs så nära den beställda nivån
   * som möjligt utan att gå över, och helst utan orden som ska vävas in — annars skriver
   * Claude gärna om mallen i stället för att hitta på något nytt.
   */
  private system(level: number | null, weave: readonly string[], fixed = false): string {
    const all = this.leggi.texts();
    // Följetongen har en fast mall, så att systemprompten med kanon cachas mellan sidorna.
    if (fixed) {
      const text = all.at(-1)!;
      return systemPrompt(
        this.data.pillars(),
        exampleFrom(text, this.leggi.tokens(text.id), this.leggi.knownNames()),
      );
    }
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

  /** De öppna orden att väva in, mest uppslagna först. */
  private weave(): { form: string; sv: string }[] {
    return this.leggi
      .openWordDetails()
      .slice(0, WEAVE_MAX)
      .map((w) => ({ form: w.key, sv: w.entry.sv }));
  }

  /** Pelaren där uppslagen hopar sig, med mazzin utskrivna — som en beställning vill ha den. */
  private focusRequest() {
    const focus = this.focus();
    const deckLabel = (id: string) => {
      const deck = this.data.deck(id);
      return deck ? `${id} ${deck.title}${deck.hint ? ` (${deck.hint})` : ''}` : id;
    };
    return focus && { p: focus.p, decks: focus.deckIds.map(deckLabel) };
  }

  private update(patch: Partial<AiSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    void this.storage.set(AI_KEY, JSON.stringify(this.settings()));
  }
}

/** Haiku har ingen reservmodell på serversidan; de andra får Anthropics förvalda. */
function fallback(model: AiModel) {
  return model === 'claude-haiku-5-5'
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
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
