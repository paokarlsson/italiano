import { describe, expect, it } from 'vitest';
import { StoryData, UserText } from '../models/leggi.models';
import {
  bookPagePrompt,
  bookPageProblems,
  bookPlanPrompt,
  cleanPlan,
  namesOn,
  newBook,
  pageId,
  pagesLeft,
  RawBookPlan,
  sequelOf,
  toPage,
  withPage,
} from './ai-book';
import { AiError } from './ai-text';
import { storyItems } from './story';

const raw: RawBookPlan = {
  title: 'Ciao, bella!',
  sv: 'En flört i en bar.',
  cover: 'En bar i Rimini.',
  cast: 'Marco, man, 42. Ingrid, kvinna, svensk ingenjör.',
  chapters: [
    {
      title: 'Il bar',
      sv: 'Baren',
      pages: [
        { title: 'Marco', sv: 'Marco', scene: 'Marco kommer in.', narrator: 'f' },
        { title: 'Ingrid', sv: 'Ingrid', scene: 'Ingrid sitter ensam.', narrator: 'm' },
      ],
    },
    { title: 'Vuoto', sv: 'Tomt', pages: [{ title: 'x', sv: 'x', scene: ' ', narrator: 'f' }] },
    {
      title: 'La fine',
      sv: 'Slutet',
      pages: [
        { title: 'Mamma', sv: 'Mamma', scene: 'Mamma ringer.', narrator: 'm' },
        { title: 'Extra', sv: 'Extra', scene: 'En sida för mycket.', narrator: 'f' },
      ],
    },
  ],
};

const text = (sentences: string[], lexicon: UserText['lexicon'] = {}): UserText => ({
  id: 'ai-x',
  title: 'Marco',
  sv: 'Marco',
  nota: 'En not.',
  level: 1,
  narrator: 'f',
  sentences: sentences.map((it) => ({ it, sv: 'sv' })),
  question: { sv: 'Vem?', options: ['A', 'B', 'C'], answer: 1 },
  source: 'ai',
  createdAt: 0,
  lexicon,
});

const book = (): StoryData =>
  newBook('bok-1', { topic: '  En flört  ', level: 2, pages: 3 }, cleanPlan(raw, 3), 5);

describe('egen bok', () => {
  it('tvättar planen: tomma sidor och kapitel bort, aldrig fler sidor än beställt', () => {
    const plan = cleanPlan(raw, 3);
    expect(plan.plan.map((c) => [c.n, c.title, c.pages.length])).toEqual([
      [1, 'Il bar', 2],
      [2, 'La fine', 1],
    ]);
    expect(plan.cast).toContain('Ingrid');
    expect(() => cleanPlan({ ...raw, chapters: [] }, 3)).toThrow(AiError);
  });

  it('börjar tom, och vet vilka sidor som återstår', () => {
    const b = book();
    expect(b.own).toMatchObject({ topic: 'En flört', level: 2, createdAt: 5 });
    expect(b.chapters).toEqual([]);
    expect(pagesLeft(b).map((p) => pageId(b.id, p.chapter.n, p.part))).toEqual([
      'bok-1-01-1',
      'bok-1-01-2',
      'bok-1-02-1',
    ]);
  });

  it('lägger in skrivna sidor på sin plats, med namnen', () => {
    let b = book();
    const plan = b.own!.plan;
    const lex = { è: { p: 'D1' as const, sv: 'är' }, qui: { p: 'D1' as const, sv: 'här' } };
    // Den andra sidan i kapitel 2 skrivs före den andra i kapitel 1 — ordningen följer planen.
    b = withPage(b, toPage(text(['Marco è qui.'], lex), b, plan[0], 1), ['marco']);
    b = withPage(b, toPage(text(['Mamma è qui.'], lex), b, plan[1], 1), ['mamma']);
    b = withPage(b, toPage(text(['Ingrid è qui.'], lex), b, plan[0], 2), ['ingrid', 'marco']);
    expect(storyItems(b).map((i) => i.id)).toEqual(['bok-1-01-1', 'bok-1-01-2', 'bok-1-02-1']);
    expect(b.names).toEqual(['ingrid', 'mamma', 'marco']);
    expect(pagesLeft(b)).toEqual([]);
    const page = b.chapters[0].pages[1];
    expect(page).toMatchObject({ level: 2, narrator: 'm', scene: 'Ingrid sitter ensam.' });
    expect(page.lexicon).toEqual(lex);
  });

  it('räknar ord utan uppslag som namn bara när de inte saknas', () => {
    const t = text(['Marco è qui.'], { è: { p: 'D1', sv: 'är' } });
    expect(namesOn(t, ['qui'])).toEqual(['marco']);
  });

  it('kontrollerar sidan mot bokens nivå', () => {
    const ok = text(['Uno.', 'Due.', 'Tre.', 'Quattro.', 'Cinque.', 'Sei.']);
    expect(bookPageProblems(ok, 1, [])).toEqual([]);
    const past = text(['Ho mangiato.', 'Due.', 'Tre.', 'Quattro.', 'Cinque.', 'Sei.']);
    expect(bookPageProblems(past, 1, ['xyz']).join(' ')).toMatch(/passato prossimo.*xyz/);
    expect(bookPageProblems(past, 4, [])).toEqual([]);
  });

  it('ger Claude beställningen, planen, nivån och sidan före', () => {
    const b = book();
    expect(bookPlanPrompt({ topic: 'En flört', level: 2, pages: 6 })).toMatch(
      /En flört[\s\S]*Nivå: 2[\s\S]*exakt 6 sidor/,
    );
    const prompt = bookPagePrompt({
      story: b,
      chapter: b.own!.plan[1],
      part: 1,
      previous: { title: 'Ingrid', sentences: ['Ingrid è qui.'] },
      problems: ['för långt'],
    });
    expect(prompt).toContain('sida 3 av 3 i boken');
    expect(prompt).toContain('Mamma ringer.');
    expect(prompt).toContain('högst 9 ord per mening');
    expect(prompt).toContain('Ingrid è qui.');
    expect(prompt).toContain('- för långt');
    expect(prompt).toMatch(/får inte förekomma[\s\S]*Passato prossimo/);
  });

  it('ger en uppföljare den tidigare boken som bakgrund', () => {
    let first = book();
    const plan = first.own!.plan;
    first = withPage(first, toPage(text(['Marco è qui.']), first, plan[0], 1), ['marco']);
    first = withPage(first, toPage(text(['Mamma è qui.']), first, plan[1], 1), ['mamma']);
    const sequel = sequelOf(first);
    expect(sequel).toEqual({
      id: 'bok-1',
      title: 'Ciao, bella!',
      sv: 'En flört i en bar.',
      cast: 'Marco, man, 42. Ingrid, kvinna, svensk ingenjör.',
      scenes: ['Marco kommer in.', 'Mamma ringer.'],
      ending: ['Mamma è qui.'],
    });
    // En bok utan egen rollista — som böckerna i appen — får namnen.
    expect(sequelOf({ ...first, own: undefined }).cast).toBe('Namn i boken: Mamma, Marco.');

    const planPrompt = bookPlanPrompt({ topic: '', level: 2, pages: 4, sequel });
    expect(planPrompt).toMatch(/uppföljare till «Ciao, bella!»/);
    expect(planPrompt).toContain('- Marco kommer in.');
    expect(planPrompt).toContain('Mamma è qui.');
    expect(planPrompt).toContain('Välj själv vad som händer sedan.');

    const next = newBook('bok-2', { topic: '', level: 2, pages: 3, sequel }, cleanPlan(raw, 3), 9);
    expect(next.own!.sequel).toEqual(sequel);
    const pagePrompt = bookPagePrompt({ story: next, chapter: next.own!.plan[0], part: 1 });
    expect(pagePrompt).toContain('Så slutade den: Mamma ringer.');
    expect(pagePrompt).not.toContain('- Marco kommer in.');
    expect(
      newBook('bok-3', { topic: '', level: 2, pages: 3 }, cleanPlan(raw, 3), 9).own,
    ).not.toHaveProperty('sequel');
  });
});
