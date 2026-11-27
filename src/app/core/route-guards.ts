import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DataService } from './data.service';
import { LeggiService } from './leggi.service';
import { QuizService } from './quiz.service';
import { StoryStore } from './story-store';

/** Okänt mazzo-id i adressfältet → tillbaka till startsidan. */
export const deckExistsGuard: CanActivateFn = (route) => {
  const deckId = route.paramMap.get('deckId');
  const exists = !!deckId && !!inject(DataService).deck(deckId);
  return exists || inject(Router).createUrlTree(['/']);
};

/** Runda och resultat kräver en påbörjad runda för just det mazzot. */
export const activeRoundGuard: CanActivateFn = (route) => {
  const deckId = route.paramMap.get('deckId');
  const quiz = inject(QuizService);
  const active = quiz.deckId() === deckId && quiz.queue().length > 0;
  return active || inject(Router).createUrlTree(['/deck', deckId!]);
};

/** Okänt text-id i adressfältet → tillbaka till startsidan. */
export const textExistsGuard: CanActivateFn = (route) => {
  const textId = route.paramMap.get('textId');
  const exists = !!textId && !!inject(LeggiService).text(textId);
  return exists || inject(Router).createUrlTree(['/']);
};

/** Okänd låt i följetongen → tillbaka till startsidan. */
export const songExistsGuard: CanActivateFn = (route) => {
  const songId = route.paramMap.get('songId');
  const exists = !!songId && !!inject(StoryStore).song(songId);
  return exists || inject(Router).createUrlTree(['/']);
};
