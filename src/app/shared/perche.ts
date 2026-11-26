import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AiService } from '../core/ai.service';
import { AiError } from '../core/ai-text';

/**
 * «Perché?» — en knapp som ber Claude förklara det appens egen rad inte räcker till.
 * Syns bara när en nyckel är inlagd. Förklaringen skrivs fram medan den kommer.
 */
@Component({
  selector: 'app-perche',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ai.hasKey()) {
      @if (text()) {
        <p class="pq-text" aria-live="polite">{{ text() }}</p>
      } @else {
        @if (error()) {
          <p class="pq-error" role="alert">{{ error() }}</p>
        }
        <button class="pq-btn" type="button" [disabled]="loading()" (click)="ask()">
          {{ loading() ? 'Claude tänker…' : error() ? 'Försök igen' : 'Perché? Fråga Claude' }}
        </button>
      }
    }
  `,
})
export class Perche {
  /** Det som sägs till Claude — se core/ai-explain.ts. Ny fråga, ny förklaring. */
  readonly prompt = input.required<string>();

  protected readonly ai = inject(AiService);
  protected readonly text = signal('');
  protected readonly error = signal('');
  protected readonly loading = signal(false);

  private controller: AbortController | null = null;

  constructor() {
    effect(() => {
      const prompt = this.prompt();
      untracked(() => {
        this.controller?.abort();
        this.controller = null;
        this.loading.set(false);
        this.error.set('');
        // Redan förklarat en gång — visa det direkt.
        this.text.set(this.ai.explanation(prompt) ?? '');
      });
    });
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }

  protected async ask(): Promise<void> {
    if (this.loading()) return;
    const controller = new AbortController();
    this.controller = controller;
    const live = () => this.controller === controller;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.ai.explain(
        this.prompt(),
        (text) => {
          if (live()) this.text.set(text);
        },
        controller.signal,
      );
    } catch (e) {
      if (live()) {
        this.text.set('');
        this.error.set(e instanceof AiError ? e.message : 'Något gick fel. Försök igen.');
      }
    } finally {
      if (live()) this.loading.set(false);
    }
  }
}
