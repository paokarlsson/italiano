import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AI_MODELS, AiModel, AiResult, AiService } from '../../core/ai.service';
import { AiError, PASTE_MAX_CHARS } from '../../core/ai-text';
import { LeggiService } from '../../core/leggi.service';
import { level, LEVELS } from '../../core/levels';
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

  protected readonly models = AI_MODELS;
  protected readonly levelCount = LEVELS.length;
  protected readonly pasteMax = PASTE_MAX_CHARS;

  protected readonly key = signal('');
  protected readonly topic = signal('');
  protected readonly pasted = signal('');
  protected readonly error = signal('');

  protected readonly level = computed(() => level(this.leggi.level()));
  protected readonly openCount = computed(() => this.leggi.openWords().length);
  protected readonly tooLong = computed(() => this.pasted().trim().length > PASTE_MAX_CHARS);

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected async saveKey(): Promise<void> {
    await this.run(async () => {
      await this.ai.saveKey(this.key());
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

  protected write(): Promise<void> {
    return this.run(async () => this.open(await this.ai.write(this.topic())));
  }

  protected gloss(): Promise<void> {
    return this.run(async () => this.open(await this.ai.gloss(this.pasted())));
  }

  protected remove(text: UserText): void {
    if (confirm(`Ta bort «${text.title}»?`)) this.leggi.removeUserText(text.id);
  }

  protected sourceLabel(text: UserText): string {
    return text.source === 'ai' ? `skriven åt dig · nivå ${text.level}` : 'din text';
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
