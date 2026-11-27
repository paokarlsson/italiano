import { describe, expect, it } from 'vitest';
import { checkPage, lockedMissing, tenseFlags, wordCount } from './story-check';

const s = (it: string) => ({ it, sv: 'x' });

describe('story-check', () => {
  it('räknar ord som läsaren ser dem', () => {
    expect(wordCount("L'amico è qui — davvero.")).toBe(4);
  });

  it('hittar låsta repliker oavsett citattecken och versaler', () => {
    const text = [s('Lei dice: «Sto bene».'), s('«Francese?» chiede lui.')];
    expect(lockedMissing(text, ['Sto bene', 'Francese?', 'Svedese.'])).toEqual(['Svedese.']);
  });

  it('flaggar tempus som nivån inte har kommit till', () => {
    expect(tenseFlags([s('Domani sarò a casa.')], 5)).toHaveLength(1);
    expect(tenseFlags([s('Domani sarò a casa.')], 6)).toEqual([]);
    expect(tenseFlags([s('La mamma cantava sempre.')], 4)).toHaveLength(1);
    expect(tenseFlags([s('Era tardi.')], 4)).toHaveLength(1);
    expect(tenseFlags([s('Ho comprato il pesce.')], 3)).toHaveLength(1);
    expect(tenseFlags([s('Ho comprato il pesce.')], 4)).toEqual([]);
    expect(tenseFlags([s('Ho già mangiato.')], 3)).toHaveLength(1);
  });

  it('låter ord som bara liknar en ändelse vara', () => {
    expect(tenseFlags([s('Le chiavi sono qui. Lui è bravo.')], 1)).toEqual([]);
    expect(tenseFlags([s('Arrivano alle sei.')], 2)).toEqual([]);
  });

  it('säger allt som är fel med en sida', () => {
    const problems = checkPage({
      chapter: 1,
      level: 3,
      sentences: [
        s('Uno.'),
        s('Due tre quattro cinque sei sette otto nove dieci undici dodici tredici.'),
      ],
      locked: ['Sto bene'],
      question: { sv: '?', options: ['a', 'a'], answer: 2 },
    });
    expect(problems.join('\n')).toMatch(/2 meningar/);
    expect(problems.join('\n')).toMatch(/12 ord, taket är 11/);
    expect(problems.join('\n')).toMatch(/Sto bene/);
    expect(problems.join('\n')).toMatch(/2 alternativ/);
    expect(problems.join('\n')).toMatch(/facit/);
  });
});
