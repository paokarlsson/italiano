import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/ai.service';
import { DataService } from '../../core/data.service';
import { HintService } from '../../core/hint.service';
import { LeggiService } from '../../core/leggi.service';
import { RIPASSO_MAX } from '../../core/ripasso';
import { StatsService } from '../../core/stats.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class Home {
  private readonly data = inject(DataService);
  protected readonly stats = inject(StatsService);
  protected readonly hints = inject(HintService);
  protected readonly leggi = inject(LeggiService);
  protected readonly ai = inject(AiService);

  protected readonly pillars = this.data.pillars;

  /** Kortet överst: nästa text att läsa, och var i raden den står. */
  protected readonly reading = computed(() => {
    const next = this.leggi.next();
    if (!next) return null;
    return {
      text: next,
      number: this.leggi.number(next.id),
      total: this.leggi.texts().length,
      again: this.leggi.isRead(next.id),
    };
  });

  /** Sant när kortet ska leda till en ny text från Claude i stället för en omläsning. */
  protected readonly writeNext = computed(() => this.leggi.allRead() && this.ai.hasKey());

  /** Antal frågor en repetition skulle få just nu — 0 när inget skaver. */
  protected readonly ripasso = computed(() =>
    Math.min(
      RIPASSO_MAX,
      this.leggi.openWords().length + Math.min(2, this.stats.weakTags().length),
    ),
  );

  protected doneInPillar(pillarIndex: number): number {
    const done = this.stats.stats().deckDone;
    return this.pillars()[pillarIndex].decks.filter((d) => done[d.deckId]).length;
  }

  protected confirmReset(): void {
    if (confirm('Radera alla sparade framsteg och all statistik? Det går inte att ångra.')) {
      this.stats.reset();
      this.leggi.reset();
      this.hints.restore();
    }
  }
}
