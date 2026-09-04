import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { HintService } from '../../core/hint.service';
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

  protected readonly pillars = this.data.pillars;

  protected readonly progress = computed(() => {
    const done = this.stats.stats().deckDone;
    let total = 0;
    let cleared = 0;
    for (const p of this.pillars()) {
      for (const d of p.decks) {
        total++;
        if (done[d.deckId]) cleared++;
      }
    }
    return { total, done: cleared, pct: total ? Math.round((cleared / total) * 100) : 0 };
  });

  protected doneInPillar(pillarIndex: number): number {
    const done = this.stats.stats().deckDone;
    return this.pillars()[pillarIndex].decks.filter((d) => done[d.deckId]).length;
  }

  protected confirmReset(): void {
    if (confirm('Radera alla sparade framsteg och all statistik? Det går inte att ångra.')) {
      this.stats.reset();
    }
  }
}
