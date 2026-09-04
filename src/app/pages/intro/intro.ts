import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { QuizService, ROUND_LENGTHS } from '../../core/quiz.service';
import { mdBold, pickRandom } from '../../core/utils';
import { Question } from '../../models/quiz.models';
import { Topbar } from '../../shared/topbar';

interface ExampleCard {
  kind: string;
  question: string;
  answer: string;
}

@Component({
  selector: 'app-intro',
  imports: [Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './intro.html',
})
export class Intro {
  /** Från routens :deckId. */
  readonly deckId = input.required<string>();

  private readonly router = inject(Router);
  protected readonly quiz = inject(QuizService);

  /** Slumpas en gång per mazzo-besök, inte vid varje omritning. */
  protected readonly example = signal<ExampleCard | null>(null);
  protected readonly deck = this.quiz.deck;

  protected readonly lengths = computed(() => {
    const max = this.deck()?.pool.length ?? 0;
    return ROUND_LENGTHS.map((n) => ({
      value: Math.min(n, max),
      label: n === 6 ? 'kort' : n === 8 ? 'standard' : 'lång',
      disabled: n > max,
    }));
  });

  protected readonly bold = mdBold;

  constructor() {
    effect(() => {
      const deckId = this.deckId();
      untracked(() => {
        this.quiz.selectDeck(deckId);
        const deck = this.quiz.deck();
        this.example.set(deck ? pickExample(deck.pool) : null);
      });
    });
  }

  protected choose(n: number): void {
    this.quiz.setDesiredCount(n);
  }

  protected start(): void {
    this.quiz.begin();
    void this.router.navigate(['/deck', this.deckId(), 'quiz']);
  }
}

/** Plockar en representativ fråga ur poolen till förhandsvisningen. */
function pickExample(pool: Question[]): ExampleCard {
  const mcs = pool.filter((q) => q.type === 'mc');
  const tfs = pool.filter((q) => q.type === 'tf');
  const bank = mcs.length ? mcs : tfs.length ? tfs : pool;
  const q = pickRandom(bank);
  if (q.type === 'mc') return { kind: 'Flerval', question: q.q, answer: q.answer };
  if (q.type === 'tf') {
    return { kind: 'Sant eller falskt', question: q.q, answer: q.answer ? 'Vero' : 'Falso' };
  }
  const pair = pickRandom(q.pairs);
  return { kind: 'Para ihop', question: `${q.instr} t.ex. ${pair[0]}`, answer: pair[1] };
}
