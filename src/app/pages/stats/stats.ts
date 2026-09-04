import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { buildAIReport } from '../../core/ai-report';
import { StatsService } from '../../core/stats.service';
import { StorageService } from '../../core/storage.service';
import { ToastService } from '../../core/toast.service';
import { relTime, trendStr } from '../../core/utils';
import { StatRow } from '../../models/quiz.models';
import { Topbar } from '../../shared/topbar';

const WEAK = 0.6;
const STRONG = 0.85;

@Component({
  selector: 'app-stats',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats.html',
})
export class Stats {
  private readonly statsService = inject(StatsService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly exportBox = viewChild<ElementRef<HTMLTextAreaElement>>('exportBox');

  protected readonly rows = computed<StatRow[]>(() => {
    this.statsService.stats();
    return this.statsService.rows();
  });

  protected readonly sections = computed(() => {
    const rows = this.rows();
    return [
      { title: 'Behöver jobb', rows: rows.filter((r) => r.acc < WEAK) },
      { title: 'På gång', rows: rows.filter((r) => r.acc >= WEAK && r.acc < STRONG) },
      { title: 'Sitter', rows: rows.filter((r) => r.acc >= STRONG) },
    ].filter((s) => s.rows.length);
  });

  protected readonly storageNote = computed(() => {
    switch (this.storage.currentMode()) {
      case 'claude':
        return null;
      case 'local':
        return 'Sparas via den här webbläsarens lokala lagring.';
      default:
        return (
          'Sparas bara i minnet (försvinner vid omladdning) — ' +
          'använd exporten nedan för att spara en kopia.'
        );
    }
  });

  protected readonly exportText = signal<string | null>(null);

  protected readonly pct = (acc: number) => Math.round(acc * 100);
  protected readonly pctClass = (acc: number) =>
    acc < WEAK ? 'weak' : acc < STRONG ? 'mid' : 'strong';
  protected readonly barColor = (acc: number) =>
    acc < WEAK ? 'var(--brick)' : acc < STRONG ? 'var(--gold)' : 'var(--verde)';
  protected readonly trend = trendStr;
  protected readonly seen = relTime;

  protected async copyForAI(): Promise<void> {
    const text = buildAIReport(this.rows());
    this.exportText.set(text);
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show('Kopierat — klistra in i valfri AI');
    } catch {
      this.exportBox()?.nativeElement.select();
      this.toast.show('Kunde inte kopiera automatiskt — markera texten nedan och kopiera själv');
    }
  }
}
