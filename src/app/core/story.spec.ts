import { describe, expect, it } from 'vitest';
import appData from '../../../public/data/app-data.json';
import letture from '../../../public/data/letture.json';
import story from '../../../public/data/storie/alba-luca.json';
import valigia from '../../../public/data/storie/valigia-blu.json';
import { LettureData, StoryData, Voice } from '../models/leggi.models';
import { Pillar } from '../models/quiz.models';
import { checkPage, plainText } from './story-check';
import { storyLexicon } from './story';
import { tokenize } from './tokenize';

const data = story as StoryData;
const short = valigia as StoryData;
const base = letture as LettureData;
const pillars = appData as Pillar[];

/**
 * Sidplanen ur docs/alba-luca/alba-luca-leggi.md (avsnitt 4 och 5): vem som berättar, på
 * vilken nivå, och vilka repliker som inte får tappas. Sidorna skrivs för hand och mot den
 * här planen — testet fångar det som glider.
 */
const PLAN: Record<string, { voice: Voice; level: number; locked?: string[] }> = {
  'alba-luca-00-1': { voice: 'f', level: 1 },
  'alba-luca-00-2': { voice: 'm', level: 1 },
  'alba-luca-00-3': { voice: 'f', level: 2 },
  'alba-luca-01-1': { voice: 'f', level: 3 },
  'alba-luca-01-2': { voice: 'f', level: 3, locked: ['Sto bene'] },
  'alba-luca-01-3': { voice: 'f', level: 3 },
  'alba-luca-02-1': { voice: 'm', level: 4 },
  'alba-luca-02-2': { voice: 'm', level: 4, locked: ['Che è successo?'] },
  'alba-luca-02-3': { voice: 'm', level: 4 },
  'alba-luca-03-1': { voice: 'm', level: 4 },
  'alba-luca-03-2': {
    voice: 'f',
    level: 4,
    locked: ['Francese?', 'Svedese.', 'Qui il mare non chiede niente.', 'Lo ringrazio.', 'maniman'],
  },
  'alba-luca-03-3': {
    voice: 'm',
    level: 4,
    locked: [
      'Non bevo caffè dopo le sei.',
      'È la cosa meno italiana che ho mai sentito.',
      "Questo spiega l'accento, ma non gli occhi.",
    ],
  },
  'alba-luca-03-4': { voice: 'f', level: 4 },
  'alba-luca-04-1': { voice: 'f', level: 4 },
  'alba-luca-04-2': { voice: 'f', level: 4, locked: ['Non ti ho mai conosciuta davvero.'] },
  'alba-luca-04-3': { voice: 'f', level: 4 },
  'alba-luca-05-1': { voice: 'f', level: 5 },
  'alba-luca-05-2': { voice: 'm', level: 5, locked: ['cantava'] },
  'alba-luca-05-3': { voice: 'f', level: 5, locked: ['Sei sempre presente, ma non ci sei mai.'] },
  'alba-luca-05-4': { voice: 'm', level: 5 },
  'alba-luca-06-1': { voice: 'm', level: 5 },
  'alba-luca-06-2': { voice: 'm', level: 5, locked: ['stanna'] },
  'alba-luca-06-3': { voice: 'm', level: 5 },
  'alba-luca-07-1': { voice: 'f', level: 5 },
  'alba-luca-07-2': { voice: 'm', level: 5, locked: ['In Svezia funzionava.'] },
  'alba-luca-07-3': { voice: 'f', level: 5 },
  'alba-luca-08-1': { voice: 'f', level: 5 },
  'alba-luca-08-2': { voice: 'f', level: 5, locked: ['Ci vediamo domani'] },
  'alba-luca-08-3': { voice: 'f', level: 5, locked: ['Sono solo stanca.', 'Chi è lei?'] },
  'alba-luca-09-1': {
    voice: 'm',
    level: 5,
    locked: ['Come stai?', 'Bene.', "Cosa c'è?", 'Niente.'],
  },
  'alba-luca-09-2': { voice: 'm', level: 5, locked: ['Devi darle tempo.'] },
  'alba-luca-10-1': { voice: 'f', level: 5 },
  'alba-luca-10-2': { voice: 'm', level: 5 },
  'alba-luca-10-3': {
    voice: 'f',
    level: 5,
    locked: [
      'Tre settimane, e non hai detto una parola?',
      'Non dovevo chiedere.',
      'Dovevi vedere.',
    ],
  },
  'alba-luca-10-4': { voice: 'm', level: 5 },
  'alba-luca-11-1': { voice: 'f', level: 5, locked: ['Chi resta non si ferma. Torna.'] },
  'alba-luca-11-2': { voice: 'f', level: 5 },
  'alba-luca-11-3': {
    voice: 'f',
    level: 5,
    locked: ['Non sono brava in questo.', 'Ma voglio imparare.', 'Con te.'],
  },
  'alba-luca-12-1': { voice: 'm', level: 6 },
  'alba-luca-12-2': { voice: 'm', level: 6 },
  'alba-luca-13-1': { voice: 'm', level: 6, locked: ['Non siamo quelli di settembre.'] },
  'alba-luca-13-2': { voice: 'm', level: 6 },
  'alba-luca-13-3': {
    voice: 'f',
    level: 6,
    locked: [
      'La dimenticherò il lunedì.',
      'Lo so.',
      'Ho ancora paura.',
      'Ma non di te.',
      'Di perderti.',
      'Sto bene',
    ],
  },
  'alba-luca-14-1': { voice: 'f', level: 6 },
  'alba-luca-14-2': {
    voice: 'm',
    level: 6,
    locked: ['Potrei dire che ti amo, ma stasera è meglio così.', 'Sei qui.'],
  },
};

const pages = data.chapters.flatMap((c) => c.pages);
const songs = data.chapters.flatMap((c) => c.songs);

describe('Alba & Luca', () => {
  it('följer sidplanen: id, berättare, nivå och låsta repliker', () => {
    for (const page of pages) {
      const plan = PLAN[page.id];
      expect(plan, `${page.id} finns inte i sidplanen`).toBeTruthy();
      expect(page.narrator, `${page.id}: berättare`).toBe(plan.voice);
      expect(page.level, `${page.id}: nivå`).toBe(plan.level);
      expect(page.locked ?? [], `${page.id}: låsta repliker`).toEqual(
        expect.arrayContaining(plan.locked ?? []),
      );
      expect(page.id, `${page.id}: kapitel och sida`).toBe(
        `alba-luca-${String(page.chapter).padStart(2, '0')}-${page.part}`,
      );
    }
  });

  it('har sidorna i ordning, utan luckor', () => {
    data.chapters.forEach((chapter, i) => {
      expect(chapter.n, 'kapitlen i ordning').toBe(i);
      chapter.pages.forEach((page, j) => {
        expect(page.chapter).toBe(chapter.n);
        expect(page.part).toBe(j + 1);
      });
      if (chapter.n > 0)
        expect(chapter.songs.length, `kapitel ${chapter.n}: låt`).toBeGreaterThan(0);
    });
    const ids = [...pages, ...songs].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('låter ingen säga «ti amo» — utom Lucas tanke på sista sidan', () => {
    for (const page of pages) {
      const text = plainText(page.sentences.map((s) => s.it).join(' '));
      if (page.id !== 'alba-luca-14-2') expect(text, page.id).not.toContain(' ti amo ');
    }
  });
});

describe.each([
  { name: 'Alba & Luca', data },
  { name: 'La valigia blu', data: short },
])('$name', ({ data }) => {
  const pages = data.chapters.flatMap((c) => c.pages);
  const songs = data.chapters.flatMap((c) => c.songs);
  const names = new Set([...base.names, ...data.names]);
  const lexiconOf = (page: (typeof pages)[number]) => storyLexicon(base.lexicon, data, page);

  it('håller längd, nivå, låsta repliker och frågans form på varje sida', () => {
    const problems = pages.flatMap((page) => checkPage(page).map((p) => `${page.id}: ${p}`));
    expect(problems).toEqual([]);
  });

  it('har ett uppslag för varje ord som inte är ett egennamn', () => {
    const unknown = pages.flatMap((page) =>
      page.sentences.flatMap((s) =>
        tokenize(s.it, lexiconOf(page))
          .filter((tok) => !tok.key && !names.has(tok.text.toLocaleLowerCase('it')))
          .map((tok) => `${page.id}: ${tok.text}`),
      ),
    );
    expect(unknown).toEqual([]);
  });

  it('har inga poster i berättelsens ordlista som ingen sida använder', () => {
    const used = new Set(
      pages.flatMap((page) =>
        page.sentences.flatMap((s) => tokenize(s.it, lexiconOf(page)).map((t) => t.key)),
      ),
    );
    const unused = [
      ...Object.keys(data.lexicon),
      ...pages.flatMap((p) => Object.keys(p.lexicon ?? {})),
    ].filter((key) => !used.has(key));
    expect(unused).toEqual([]);
  });

  it('pekar bara på pelare och mazzi som finns', () => {
    const pillarIds = new Set(pillars.map((p) => p.pillarId));
    const deckIds = new Set(pillars.flatMap((p) => p.decks.map((d) => d.deckId)));
    const entries = [
      ...Object.entries(data.lexicon),
      ...pages.flatMap((p) => Object.entries(p.lexicon ?? {})),
    ];
    for (const [key, entry] of entries) {
      expect(pillarIds.has(entry.p), `${key}: pelare ${entry.p}`).toBe(true);
      expect(entry.sv, `${key}: betydelse`).toBeTruthy();
      if (entry.deck) expect(deckIds.has(entry.deck), `${key}: mazzo ${entry.deck}`).toBe(true);
    }
  });

  it('har en scen och svenska överallt', () => {
    for (const page of pages) {
      expect(page.scene, page.id).toBeTruthy();
      expect(page.sv, page.id).toBeTruthy();
      expect(page.nota, page.id).toBeTruthy();
    }
  });

  it('har låtsidor med rader på båda språken', () => {
    for (const song of songs) {
      expect(song.lines.length, song.id).toBeGreaterThan(0);
      for (const line of song.lines) {
        expect(line.it.trim(), song.id).toBeTruthy();
        expect(line.sv.trim(), `${song.id}: ${line.it}`).toBeTruthy();
      }
      if (song.spotify) expect(song.spotify).toMatch(/^https:\/\/open\.spotify\.com\/track\//);
    }
  });
});

describe('La valigia blu', () => {
  const pages = short.chapters.flatMap((c) => c.pages);

  it('läses varvat med grundkursen och ligger på de två första nivåerna', () => {
    expect(short.course).toBe(true);
    expect(short.canon ?? []).toEqual([]);
    for (const page of pages) expect([1, 2], page.id).toContain(page.level);
    const levels = pages.map((p) => p.level);
    expect(levels, 'nivån stiger aldrig tillbaka').toEqual([...levels].sort());
    expect(levels).toContain(1);
  });

  it('har sidorna i ordning, utan luckor', () => {
    short.chapters.forEach((chapter, i) => {
      expect(chapter.n).toBe(i + 1);
      chapter.pages.forEach((page, j) => {
        expect(page.id).toBe(`valigia-blu-${String(chapter.n).padStart(2, '0')}-${j + 1}`);
        expect(page.chapter).toBe(chapter.n);
        expect(page.part).toBe(j + 1);
      });
    });
  });

  it('varierar vilket svar som är rätt', () => {
    expect(new Set(pages.map((p) => p.question.answer)).size).toBe(3);
  });
});
