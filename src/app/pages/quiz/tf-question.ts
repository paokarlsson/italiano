import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TfQuestion } from '../../models/quiz.models';

/** Vero/Falso — samma flöde som flervalsfrågan, med två alternativ. */
@Component({
  selector: 'app-tf-question',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tf-row' },
  template: `
    @for (choice of choices; track choice.value) {
      <button
        class="tf"
        type="button"
        [disabled]="answered()"
        [class.correct]="answered() && choice.value === question().answer"
        [class.wrong]="choice.value === chosen() && choice.value !== question().answer"
        (click)="pick(choice.value)"
      >
        {{ choice.label }}
      </button>
    }
  `,
})
export class TfQuestionComponent {
  readonly question = input.required<TfQuestion>();
  readonly answered = input(false);
  readonly answer = output<boolean>();

  protected readonly choices = [
    { value: true, label: 'Vero' },
    { value: false, label: 'Falso' },
  ];
  protected readonly chosen = signal<boolean | null>(null);

  constructor() {
    effect(() => {
      this.question();
      untracked(() => this.chosen.set(null));
    });
  }

  protected pick(value: boolean): void {
    if (this.answered()) return;
    this.chosen.set(value);
    this.answer.emit(value === this.question().answer);
  }
}
