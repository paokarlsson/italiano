import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AI_MODELS, AiModel, AiResult, AiService } from '../../core/ai.service';
import { AiError, PASTE_MAX_CHARS } from '../../core/ai-text';
import { DataService } from '../../core/data.service';
import { LeggiService } from '../../core/leggi.service';
import { level, LEVELS } from '../../core/levels';
import { PILLAR_NAMES } from '../../core/profile';
import { STOCK_TARGET, SupplyService } from '../../core/supply.service';
import { ToastService } from '../../core/toast.service';
import { UserText } from '../../models/leggi.models';
import { Topbar } from '../../shared/topbar';

/** Fler texter: lägg in en nyckel, beställ en ny text eller gör en egen läsbar. */
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
  protected readonly data = inject(DataService);
  protected readonly supply = inject(SupplyService);

  protected readonly models = AI_MODELS;
  protected readonly levelCount = LEVELS.length;
  protected readonly pasteMax = PASTE_MAX_CHARS;
  protected readonly stockTarget = STOCK_TARGET;

  protected readonly key = signal('');
  protected readonly topic = signal('');
  protected readonly pasted = signal('');
  protected readonly error = signal('');
  /** Om nästa text ska fortsätta på den senaste — förvalt, så länge det finns en. */
  protected readonly follow = signal(true);

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

  protected async saveKey(): Promise<void> {
    await this.run(async () => {
      await this.ai.saveKey(this.key());
      this.supply.retry();
      this.key.set('');
      this.toast.show('Nyckeln är sparad');
    });
  }

  protected removeKey(): void {
    if (confirm('Ta bort nyckeln från den här webbläsaren? Dina texter ligger kvar.')) {
      this.ai.clearKey();
    }
  }

  protected setModel(event: Event): void {
    this.ai.setModel(this.valueOf(event) as AiModel);
  }

  protected toggleAuto(): void {
    this.ai.setAuto(!this.ai.auto());
    this.supply.retry();
  }

  protected removeExtras(): void {
    const n = this.data.extraCount();
    if (confirm(`Ta bort de ${n} frågor som Claude har skrivit till i gymmet?`)) {
      this.data.clearExtras();
    }
  }

  protected write(): Promise<void> {
    return this.run(async () => this.open(await this.ai.write(this.topic(), this.follow())));
  }

  protected gloss(): Promise<void> {
    return this.run(async () => this.open(await this.ai.gloss(this.pasted())));
  }

  protected remove(text: UserText): void {
    if (confirm(`Ta bort «${text.title}»?`)) this.leggi.removeUserText(text.id);
  }

  protected sourceLabel(text: UserText): string {
    if (text.source !== 'ai') return 'din text';
    return `skriven åt dig · nivå ${text.level}${text.part && text.part > 1 ? ` · del ${text.part}` : ''}`;
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
