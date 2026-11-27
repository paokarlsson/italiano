import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeggiService } from '../../core/leggi.service';
import { chapterLabel } from '../../core/story';
import { StoryStore } from '../../core/story-store';
import { SupplyService } from '../../core/supply.service';
import { Topbar } from '../../shared/topbar';

/**
 * En låtsida i följetongen: refrängen som den sjungs, rad för rad med svenska under, och
 * länken till låten. Ingen fråga och ingen nivå — det är en autentisk text.
 */
@Component({
  selector: 'app-canzone',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './canzone.html',
})
export class Canzone {
  /** Från routens :songId. */
  readonly songId = input.required<string>();

  private readonly story = inject(StoryStore);
  private readonly leggi = inject(LeggiService);
  protected readonly supply = inject(SupplyService);

  protected readonly item = computed(() => {
    const item = this.story.item(this.songId());
    return item?.kind === 'song' ? item : null;
  });
  protected readonly step = computed(() => {
    const item = this.item();
    return item ? `${item.story.title} · ${chapterLabel(item.chapter)} · låten` : '';
  });

  /** Det som kommer efter låten — nästa kapitels första sida, eller en låt till. */
  protected readonly after = computed(() => this.story.after(this.songId()));
  protected readonly afterPage = computed(() => {
    const after = this.after();
    return after?.kind === 'page' ? after.page : null;
  });
  protected readonly afterSong = computed(() => {
    const after = this.after();
    return after?.kind === 'song' ? after.song : null;
  });

  /** Boken, när låten var det sista som återstod i den. */
  protected readonly bookDone = computed(() => {
    const item = this.item();
    if (!item) return null;
    const all = this.story.itemsOf(item.story);
    return all.every((i) => this.leggi.isRead(i.id)) ? item.story : null;
  });

  constructor() {
    // En låt räknas som hörd när den har öppnats — den har inget att svara på.
    effect(() => {
      const id = this.songId();
      if (this.item()) untracked(() => this.leggi.markHeard(id));
    });
  }
}
