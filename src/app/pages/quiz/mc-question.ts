import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { shuffle } from '../../core/utils';
import { McQuestion } from '../../models/quiz.models';

/** Flervalsfråga: ett tryck låser svaret och visar det rätta alternativet. */
@Component({
  selector: 'app-mc-question',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'options' },
  template: `
    @for (option of options(); track $index) {
      <button
        class="opt"
        type="button"
        [disabled]="answered()"
        [class.dim]="answered() && option !== chosen() && option !== question().answer"
        [class.correct]="answered() && option === question().answer"
        [class.wrong]="option === chosen() && option !== question().answer"
        (click)="pick(option)"
      >
        {{ option }}
      </button>
    }
  `,
})
export class McQuestionComponent {
  readonly question = input.required<McQuestion>();
  readonly answered = input(false);
  readonly answer = output<boolean>();

  protected readonly chosen = signal<string | null>(null);
  protected readonly options = computed(() => shuffle(this.question().options));

  constructor() {
    effect(() => {
      this.question();
      untracked(() => this.chosen.set(null));
    });
  }

  protected pick(option: string): void {
    if (this.answered()) return;
    this.chosen.set(option);
    this.answer.emit(option === this.question().answer);
  }
}
