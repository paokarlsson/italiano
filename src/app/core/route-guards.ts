import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DataService } from './data.service';
import { QuizService } from './quiz.service';

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
