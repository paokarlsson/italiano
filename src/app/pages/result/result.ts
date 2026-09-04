import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { QuizService } from '../../core/quiz.service';
import { Topbar } from '../../shared/topbar';

@Component({
  selector: 'app-result',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './result.html',
})
export class Result {
  /** Från routens :deckId. */
  readonly deckId = input.required<string>();

  private readonly data = inject(DataService);
  protected readonly quiz = inject(QuizService);

  protected readonly nextDeck = computed(() => this.data.nextDeck(this.deckId()) ?? null);

  protected readonly summary = computed(() => {
    const correct = this.quiz.correct();
    const total = this.quiz.asked();
    const ratio = total ? correct / total : 0;
    const stars = ratio === 1 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;
    const [msg, sub] =
      ratio === 1
        ? ['Bravissimo!', 'Det här sitter. Gå vidare — eller kör igen för nya exempel.']
        : ratio >= 0.6
          ? ['Bene!', 'Stabilt. Öva igen så drar motorn fram andra frågor ur samma pool.']
          : ['Ci siamo quasi.', 'På väg. Kör en runda till — du får nya exempel varje gång.'];
    return {
      correct,
      total,
      msg,
      sub,
      stars: '★'.repeat(stars) + '☆'.repeat(3 - stars),
    };
  });
}
