import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AiService } from './ai.service';
import { AiError } from './ai-text';
import { DataService } from './data.service';
import { LeggiService } from './leggi.service';
import { decksToExtend } from './recommend';
import { StatsService } from './stats.service';

/** Så många olästa texter från Claude som ska ligga färdiga. */
export const STOCK_TARGET = 2;
/** Tak för beställningar i bakgrunden per besök — ett skydd om något skulle gå i ring. */
export const MAX_JOBS = 12;
/** Det som sägs före statusraden när beställningen inte är läsarens egen. */
const LABEL = 'Fyller på · ';

type Job = { kind: 'text' } | { kind: 'deck'; deckId: string };

/**
 * Påfyllningen. Med en nyckel inlagd ser den till att det alltid ligger två olästa texter
 * färdiga, och att ett mazzo som läsaren har gått igenom utan att det sitter får nya
 * frågor. Den gör en sak i taget och väntar medan läsaren själv beställer något.
 *
 * Ett fel stoppar den tills läsaren har läst en text till, ber den försöka igen eller
 * öppnar appen på nytt — den prövar inte om och om igen på ett konto som säger nej.
 */
@Injectable({ providedIn: 'root' })
export class SupplyService {
  private readonly ai = inject(AiService);
  private readonly data = inject(DataService);
  private readonly leggi = inject(LeggiService);
  private readonly stats = inject(StatsService);

  /** Sant när allt är inläst — innan dess ser lagret tomt ut fast det inte är det. */
  private readonly ready = signal(false);
  /** Antal lästa texter när påfyllningen senast gick fel. */
  private readonly stalledAt = signal<number | null>(null);
  private readonly jobs = signal(0);

  /** Varför påfyllningen står stilla — tomt när den går eller inte har något att göra. */
  readonly error = signal('');
  /** Vad som görs just nu. */
  readonly working = signal<Job['kind'] | ''>('');

  /** Sant när påfyllningen är påslagen och har en nyckel att arbeta med. */
  readonly active = computed(() => this.ready() && this.ai.hasKey() && this.ai.auto());

  private readonly stalled = computed(
    () => this.stalledAt() === this.leggi.reads() || this.jobs() >= MAX_JOBS,
  );

  /** Nästa sak att göra: texterna först, sedan mazzot som övats senast. */
  private readonly next = computed<Job | null>(() => {
    if (this.leggi.stock().length < STOCK_TARGET) return { kind: 'text' };
    const [deckId] = decksToExtend(
      this.data.pillars(),
      this.stats.stats().tags,
      this.data.extras(),
      this.data.marks(),
    );
    return deckId ? { kind: 'deck', deckId } : null;
  });

  /** Sant när en text är på väg in i lagret — skrivs nu, eller står näst på tur. */
  readonly textComing = computed(
    () => this.active() && !this.stalled() && this.leggi.stock().length < STOCK_TARGET,
  );

  constructor() {
    effect(() => {
      const job = this.next();
      // Den egna flaggan behövs: AiService är ledig ett ögonblick innan utfallet är bokfört.
      if (!job || !this.active() || this.stalled() || this.working() || this.ai.busy()) return;
      untracked(() => void this.run(job));
    });
  }

  /** Släpper igång påfyllningen. Anropas när allt är inläst vid uppstart. */
  start(): void {
    this.ready.set(true);
  }

  /** Försöker igen efter ett fel eller när taket för besöket är nått. */
  retry(): void {
    this.error.set('');
    this.stalledAt.set(null);
    this.jobs.set(0);
  }

  private async run(job: Job): Promise<void> {
    this.working.set(job.kind);
    this.jobs.update((n) => n + 1);
    try {
      if (job.kind === 'text') {
        await this.ai.write('', true, LABEL);
      } else {
        await this.ai.extend(job.deckId, LABEL);
      }
      this.error.set('');
      if (this.jobs() >= MAX_JOBS) {
        this.error.set(`Påfyllningen vilar efter ${MAX_JOBS} beställningar sedan appen öppnades.`);
      }
    } catch (e) {
      this.stalledAt.set(this.leggi.reads());
      this.error.set(e instanceof AiError ? e.message : 'Något gick fel.');
    } finally {
      this.working.set('');
    }
  }
}
