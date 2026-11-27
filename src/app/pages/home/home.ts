import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/ai.service';
import { DataService } from '../../core/data.service';
import { HintService } from '../../core/hint.service';
import { AudioStore } from '../../core/audio-store';
import { LeggiService } from '../../core/leggi.service';
import { LibraryService } from '../../core/library.service';
import { recommend } from '../../core/recommend';
import { RIPASSO_MAX } from '../../core/ripasso';
import { StatsService } from '../../core/stats.service';
import { SupplyService } from '../../core/supply.service';
import { megabytes } from '../../core/utils';
import { Lettura, UserText } from '../../models/leggi.models';

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
  protected readonly supply = inject(SupplyService);
  protected readonly library = inject(LibraryService);
  protected readonly audio = inject(AudioStore);

  protected readonly megabytes = megabytes;

  protected readonly pillars = this.data.pillars;

  /**
   * Kortet överst. En oläst text går alltid först — en inbyggd, eller en ur lagret. Är
   * allt läst visar kortet att nästa text skrivs, leder till beställningen, eller — utan
   * nyckel — föreslår en omläsning.
   */
  protected readonly reading = computed(() => {
    const next = this.leggi.next();
    if (!next) return null;
    const total = this.leggi.texts().length;
    const text = (again: boolean) => ({
      kind: 'text' as const,
      text: next,
      label: this.label(next, again),
      total,
    });
    if (!this.leggi.isRead(next.id)) return text(false);
    if (this.supply.textComing()) return { kind: 'coming' as const, total };
    if (this.ai.hasKey()) return { kind: 'write' as const, total };
    return text(true);
  });

  /** Resten av lagret — det som ligger färdigt utöver texten på kortet. */
  protected readonly stock = computed(() => {
    const r = this.reading();
    const shown = r?.kind === 'text' ? r.text.id : null;
    return this.leggi.stock().filter((t) => t.id !== shown);
  });

  /** Mazzin värda att satsa på, viktigast först. */
  protected readonly advice = computed(() =>
    recommend({
      pillars: this.pillars(),
      lookups: this.leggi.profile().decks,
      stats: this.stats.stats(),
    }),
  );

  /** Antal frågor en repetition skulle få just nu — 0 när inget skaver. */
  protected readonly ripasso = computed(() =>
    Math.min(
      RIPASSO_MAX,
      this.leggi.openWords().length + Math.min(2, this.stats.weakTags().length),
    ),
  );

  private label(text: Lettura, again: boolean): string {
    const number = this.leggi.number(text.id);
    if (number) {
      return `${again ? 'Läs om' : 'Leggi'} · text ${number} av ${this.leggi.texts().length}`;
    }
    const { part, source } = text as UserText;
    const from = source === 'shared' ? 'ur biblioteket' : 'skriven åt dig';
    return `Leggi · ${from}${part && part > 1 ? ` · del ${part}` : ''}`;
  }

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
