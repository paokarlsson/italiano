import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { answerPrompt } from '../../core/ai-explain';
import { DataService } from '../../core/data.service';
import { LeggiService } from '../../core/leggi.service';
import { buildRipasso, RipassoItem } from '../../core/ripasso';
import { StatsService } from '../../core/stats.service';
import { mdBold } from '../../core/utils';
import { McQuestion, TfQuestion } from '../../models/quiz.models';
import { Perche } from '../../shared/perche';
import { Topbar } from '../../shared/topbar';
import { McQuestionComponent } from '../quiz/mc-question';
import { TfQuestionComponent } from '../quiz/tf-question';

/** En kort repetition, vald efter det som slagits upp och det som går trögt i gymmet. */
@Component({
  selector: 'app-ripasso',
  imports: [RouterLink, Topbar, Perche, McQuestionComponent, TfQuestionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ripasso.html',
})
export class Ripasso {
  private readonly data = inject(DataService);
  private readonly leggi = inject(LeggiService);
  private readonly stats = inject(StatsService);

  /** Rundan väljs en gång — den ska inte bytas ut när ett ord stängs mitt i. */
  protected readonly items: RipassoItem[] = buildRipasso({
    open: this.leggi.openWordDetails(),
    pillars: this.data.pillars(),
    lexicon: this.leggi.lexicon(),
    weak: this.stats.weakTags(),
  });

  protected readonly pos = signal(0);
  protected readonly answered = signal<boolean | null>(null);
  /** Frågan till Claude om läsaren vill veta varför. */
  protected readonly why = signal<string | null>(null);
  /** Alternativet som valdes på den aktuella flervalsfrågan. */
  private picked: string | null = null;
  protected readonly results = signal<boolean[]>([]);

  protected readonly current = computed<RipassoItem | null>(() => this.items[this.pos()] ?? null);
  protected readonly done = computed(() => this.pos() >= this.items.length);
  protected readonly correct = computed(() => this.results().filter(Boolean).length);
  protected readonly isLast = computed(() => this.pos() === this.items.length - 1);
  /** Orden som inte satt — de ligger kvar som öppna. */
  protected readonly stillOpen = computed(() =>
    this.items.flatMap((item, i) =>
      item.wordKey && this.results()[i] === false ? [item.wordKey] : [],
    ),
  );
  protected readonly nextText = this.leggi.next;

  protected readonly bold = mdBold;
  protected asMc = (item: RipassoItem) => item.question as McQuestion;
  protected asTf = (item: RipassoItem) => item.question as TfQuestion;

  constructor() {
    // Inget att repetera (t.ex. direktlänk hit) — tillbaka till startsidan.
    if (!this.items.length) void inject(Router).navigate(['/'], { replaceUrl: true });
  }

  protected onAnswer(isCorrect: boolean): void {
    const item = this.current();
    if (!item || this.answered() !== null) return;
    const deck = this.data.deck(item.question.statKey.split('::')[0]);
    this.why.set(
      answerPrompt({ question: item.question, picked: this.picked, correct: isCorrect, deck }),
    );
    this.answered.set(isCorrect);
    this.results.update((r) => [...r, isCorrect]);
    if (item.question.statKey) this.stats.recordAnswer(item.question.statKey, isCorrect);
    if (isCorrect && item.wordKey) this.leggi.settle(item.wordKey);
  }

  protected onPicked(option: string): void {
    this.picked = option;
  }

  protected next(): void {
    this.picked = null;
    this.why.set(null);
    this.answered.set(null);
    this.pos.update((p) => p + 1);
  }
}
