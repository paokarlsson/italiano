import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AiResult, AiService } from '../../core/ai.service';
import { AiError, PASTE_MAX_CHARS } from '../../core/ai-text';
import { LeggiService } from '../../core/leggi.service';
import { level, LEVELS } from '../../core/levels';
import { PILLAR_NAMES } from '../../core/profile';
import { ToastService } from '../../core/toast.service';
import { UserText } from '../../models/leggi.models';
import { Topbar } from '../../shared/topbar';

/** Fler texter: beställ en ny text eller gör en egen läsbar. Nyckeln läggs in under Inställningar. */
@Component({
  selector: 'app-testi',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './testi.html',
})
export class Testi {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly ai = inject(AiService);
  protected readonly leggi = inject(LeggiService);

  protected readonly levelCount = LEVELS.length;
  protected readonly pasteMax = PASTE_MAX_CHARS;

  protected readonly topic = signal('');
  protected readonly pasted = signal('');
  protected readonly error = signal('');
  /** Om nästa text ska fortsätta på den senaste — förvalt, så länge det finns en. */
  protected readonly follow = signal(true);
  /** Hur många texter som skrivs på en gång. */
  protected readonly counts = [1, 3, 5] as const;
  protected readonly count = signal<number>(3);
  /** Knappens text: en eller flera, ny berättelse eller nästa del. */
  protected readonly writeLabel = computed(() => {
    const n = this.count();
    const next = !!this.ai.lastPart() && this.follow();
    if (n === 1) return next ? 'Skriv nästa del →' : 'Skriv en text åt mig →';
    return next ? `Skriv nästa ${n} delar →` : `Skriv ${n} texter åt mig →`;
  });

  protected readonly level = computed(() => level(this.leggi.level()));
  protected readonly openCount = computed(() => this.leggi.openWords().length);
  /** Pelaren nästa text görs tät på, som den heter i appen. */
  protected readonly focus = computed(() => {
    const focus = this.ai.focus();
    return focus && PILLAR_NAMES[focus.p];
  });
  protected readonly tooLong = computed(() => this.pasted().trim().length > PASTE_MAX_CHARS);

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected write(): Promise<void> {
    return this.run(async () => {
      const { results, error } = await this.ai.writeSeries(
        this.topic(),
        this.follow(),
        this.count(),
      );
      if (results.length === 1 && !error) return this.open(results[0]);
      // Flera texter: öppna den första, och säg vad hela serien kostade.
      const cost = results.reduce((n, r) => n + r.cost, 0);
      const missing = results.reduce((n, r) => n + r.missing.length, 0);
      const notes = [`ca $${cost.toFixed(2)}`];
      if (missing) notes.push(`${missing} ord utan uppslag`);
      this.toast.show(`${results.length} texter klara · ${notes.join(' · ')}`);
      if (error) {
        this.error.set(
          `${results.length} av ${this.count()} texter skrevs. Nästa gick inte: ${error.message}`,
        );
        return;
      }
      void this.router.navigate(['/leggi', results[0].text.id]);
    });
  }

  protected gloss(): Promise<void> {
    return this.run(async () => this.open(await this.ai.gloss(this.pasted())));
  }

  protected remove(text: UserText): void {
    if (confirm(`Ta bort «${text.title}»?`)) this.leggi.removeUserText(text.id);
  }

  protected sourceLabel(text: UserText): string {
    if (text.source === 'paste') return 'din text';
    const from = text.source === 'shared' ? 'ur biblioteket' : 'skriven åt dig';
    return `${from} · nivå ${text.level}${text.part && text.part > 1 ? ` · del ${text.part}` : ''}`;
  }

  /** Öppnar den nya texten och säger det som är värt att veta om den. */
  private open(result: AiResult): void {
    const notes = [`ca $${result.cost.toFixed(2)}`];
    if (!result.faithful) notes.push('italienskan kan ha ändrats');
    if (result.missing.length) notes.push(`${result.missing.length} ord utan uppslag`);
    this.toast.show(`Klar · ${notes.join(' · ')}`);
    void this.router.navigate(['/leggi', result.text.id]);
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.error.set('');
    try {
      await task();
    } catch (e) {
      this.error.set(e instanceof AiError ? e.message : 'Något gick fel. Försök igen.');
    }
  }
}
