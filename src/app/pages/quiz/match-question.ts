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
import { MatchQuestion } from '../../models/quiz.models';

const SHAKE_MS = 420;

interface Chip {
  key: string;
  text: string;
  pair: number;
  side: 'L' | 'R';
}

/** Para ihop: två kolumner med chips. Poäng bara om alla par tas utan miss. */
@Component({
  selector: 'app-match-question',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'match-cols' },
  template: `
    @for (column of [left(), right()]; track $index) {
      <div class="mcol">
        @for (chip of column; track chip.key) {
          <button
            class="chip"
            type="button"
            [class.sv]="chip.side === 'L'"
            [class.sel]="selected()?.key === chip.key"
            [class.matched]="matched().has(chip.pair)"
            [class.shake]="shaking().includes(chip.key)"
            (click)="pick(chip)"
          >
            {{ chip.text }}
          </button>
        }
      </div>
    }
  `,
})
export class MatchQuestionComponent {
  readonly question = input.required<MatchQuestion>();
  readonly answer = output<boolean>();

  protected readonly selected = signal<Chip | null>(null);
  protected readonly matched = signal<ReadonlySet<number>>(new Set());
  protected readonly shaking = signal<string[]>([]);
  private missed = false;
  private shakeTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly left = computed(() =>
    shuffle(this.question().pairs.map((p, i) => chip(p[0], i, 'L'))),
  );
  protected readonly right = computed(() =>
    shuffle(this.question().pairs.map((p, i) => chip(p[1], i, 'R'))),
  );

  constructor() {
    effect(() => {
      this.question();
      untracked(() => {
        this.selected.set(null);
        this.matched.set(new Set());
        this.shaking.set([]);
        this.missed = false;
      });
    });
  }

  protected pick(chip: Chip): void {
    if (this.matched().has(chip.pair)) return;

    const sel = this.selected();
    if (!sel || sel.side === chip.side) {
      this.selected.set(sel?.key === chip.key ? null : chip);
      return;
    }

    if (sel.pair === chip.pair) {
      const matched = new Set(this.matched()).add(chip.pair);
      this.matched.set(matched);
      this.selected.set(null);
      if (matched.size === this.question().pairs.length) {
        this.answer.emit(!this.missed);
      }
      return;
    }

    this.missed = true;
    this.selected.set(null);
    this.shaking.set([sel.key, chip.key]);
    if (this.shakeTimer) clearTimeout(this.shakeTimer);
    this.shakeTimer = setTimeout(() => this.shaking.set([]), SHAKE_MS);
  }
}

function chip(text: string, pair: number, side: 'L' | 'R'): Chip {
  return { key: `${side}${pair}`, text, pair, side };
}
