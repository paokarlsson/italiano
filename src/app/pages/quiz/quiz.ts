import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { answerPrompt } from '../../core/ai-explain';
import { QuizService } from '../../core/quiz.service';
import { mdBold } from '../../core/utils';
import { McQuestion, MatchQuestion, QueuedQuestion, TfQuestion } from '../../models/quiz.models';
import { Perche } from '../../shared/perche';
import { Topbar } from '../../shared/topbar';
import { MatchQuestionComponent } from './match-question';
import { McQuestionComponent } from './mc-question';
import { TfQuestionComponent } from './tf-question';

interface Feedback {
  correct: boolean;
  headline: string;
  body: string;
  retried: boolean;
  /** Frågan till Claude om läsaren vill veta varför — null där det inte finns något att fråga om. */
  why: string | null;
}

@Component({
  selector: 'app-quiz',
  imports: [Topbar, Perche, McQuestionComponent, TfQuestionComponent, MatchQuestionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quiz.html',
})
export class Quiz {
  /** Från routens :deckId. */
  readonly deckId = input.required<string>();

  private readonly router = inject(Router);
  protected readonly quiz = inject(QuizService);

  protected readonly feedback = signal<Feedback | null>(null);
  /** Alternativet som valdes på den aktuella flervalsfrågan. */
  private picked: string | null = null;

  protected readonly kindLabel = computed(() => {
    const q = this.quiz.current();
    if (!q) return '';
    if (q.type === 'tf') return 'Sant eller falskt';
    if (q.type === 'match') return 'Para ihop';
    return q.kind || 'Flerval';
  });

  constructor() {
    // Rundan är slut (även vid bakåtnavigering hit) — visa resultatet i stället.
    effect(() => {
      if (this.quiz.roundOver()) {
        void this.router.navigate(['/deck', this.deckId(), 'result']);
      }
    });
  }

  protected asMc = (q: QueuedQuestion) => q as McQuestion;
  protected asTf = (q: QueuedQuestion) => q as TfQuestion;
  protected asMatch = (q: QueuedQuestion) => q as MatchQuestion;

  protected onAnswer(correct: boolean): void {
    const q = this.quiz.current();
    if (!q || this.feedback()) return;
    const deck = this.quiz.deck();
    const why =
      q.type === 'match' ? null : answerPrompt({ question: q, picked: this.picked, correct, deck });
    const retried = this.quiz.submit(correct);
    this.feedback.set({ ...buildFeedback(q, correct, retried), why });
  }

  protected onPicked(option: string): void {
    this.picked = option;
  }

  protected next(): void {
    this.picked = null;
    this.feedback.set(null);
    if (!this.quiz.advance()) {
      void this.router.navigate(['/deck', this.deckId(), 'result']);
    }
  }
}

function buildFeedback(
  q: QueuedQuestion,
  correct: boolean,
  retried: boolean,
): Omit<Feedback, 'why'> {
  if (q.type === 'match') {
    return {
      correct,
      headline: correct ? 'Perfetto!' : 'Ci siamo quasi.',
      body: correct
        ? 'Alla par rätt, utan en enda miss. +1 poäng.'
        : 'Alla par rätt till slut, men med en miss — ingen poäng den här gången.',
      retried,
    };
  }
  return {
    correct,
    headline: correct ? 'Giusto!' : 'Quasi.',
    body: mdBold(q.explain),
    retried,
  };
}
