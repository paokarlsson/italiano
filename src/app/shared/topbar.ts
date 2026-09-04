import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Rubrikraden: tillbaka-knapp, pelare · mazzo, och poäng under en runda. */
@Component({
  selector: 'app-topbar',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'topbar' },
  template: `
    <button class="back" type="button" aria-label="Tillbaka" routerLink="/">←</button>
    <div class="top-meta">
      <div class="top-step">{{ step() }}</div>
      <div class="top-title">{{ title() }}</div>
    </div>
    @if (score() !== null) {
      <div class="score-pill">{{ score() }} pt</div>
    }
  `,
})
export class Topbar {
  readonly step = input.required<string>();
  readonly title = input.required<string>();
  readonly score = input<number | null>(null);
}
