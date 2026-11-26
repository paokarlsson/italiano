import { describe, expect, it } from 'vitest';
import appData from '../../../public/data/app-data.json';
import letture from '../../../public/data/letture.json';
import { LettureData } from '../models/leggi.models';
import { Pillar } from '../models/quiz.models';
import {
  AiError,
  assembleText,
  exampleFrom,
  glossPrompt,
  mergeRepair,
  namesOf,
  RawText,
  systemPrompt,
  writePrompt,
} from './ai-text';
import { tokenize } from './tokenize';

const data = letture as LettureData;
const pillars = appData as Pillar[];
const deckIds = new Set(pillars.flatMap((p) => p.decks.map((d) => d.deckId)));

const raw = (patch: Partial<RawText> = {}): RawText => ({
  italian: true,
  title: 'Il gatto',
  sv: 'Katten',
  nota: 'Lägg märke till dorme.',
  sentences: [
    { it: 'Il gatto di Giulia dorme.', sv: 'Giulias katt sover.' },
    { it: 'Ha mangiato troppo!', sv: 'Den har ätit för mycket!' },
  ],
  lexicon: [
    { form: 'il', p: 'D1', sv: 'bestämd artikel', note: '', deck: '' },
    { form: 'di', p: 'D1', sv: 'av', note: '', deck: '' },
    { form: 'Gatto', p: 'D4', sv: 'katt', note: '', deck: '' },
    { form: 'dorme', p: 'D3', sv: 'sover', note: 'dorm·e — -e = han/hon (dormire)', deck: 'D3.8' },
    { form: 'ha mangiato', p: 'D3', sv: 'har ätit', note: '', deck: 'D9.99' },
    { form: 'ha', p: 'D1', sv: 'har', note: '', deck: '' },
    { form: 'troppo', p: 'D5', sv: 'för mycket', note: '', deck: '' },
    { form: '', p: 'D1', sv: 'tom', note: '', deck: '' },
  ],
  names: ['Giulia'],
  question: { sv: 'Vad gör katten?', options: ['Sover', 'Äter', 'Leker'], answer: 0 },
  ...patch,
});

const opts = {
  id: 'ai-1',
  source: 'ai' as const,
  level: 3,
  createdAt: 1,
  deckIds,
};

describe('assembleText', () => {
  it('gör ett svar till en text och säger vilka ord som saknar uppslag', () => {
    const { text, missing } = assembleText(raw(), opts);

    // «troppo» hade en ogiltig pelare och föll bort.
    expect(missing).toEqual(['troppo']);
    expect(text).toMatchObject({ id: 'ai-1', source: 'ai', level: 3, title: 'Il gatto' });
    // Nyckeln görs om till gemener, okända mazzi tas bort, oanvända poster rensas.
    expect(Object.keys(text.lexicon).sort()).toEqual(['di', 'dorme', 'gatto', 'ha mangiato', 'il']);
    expect(text.lexicon['dorme'].deck).toBe('D3.8');
    expect(text.lexicon['ha mangiato'].deck).toBeUndefined();
    expect(text.lexicon['gatto'].note).toBeUndefined();
  });

  it('fyller i det som saknades med en komplettering', () => {
    const first = assembleText(raw(), opts);
    const { text, missing } = mergeRepair(
      first.text,
      {
        lexicon: [
          { form: 'troppo', p: 'D1', sv: 'för mycket', note: '', deck: '' },
          // Får inte skriva över posten som redan fanns.
          { form: 'dorme', p: 'D4', sv: 'fel', note: '', deck: '' },
        ],
        names: [],
      },
      namesOf(raw()),
      opts,
    );
    expect(missing).toEqual([]);
    expect(text.lexicon['troppo'].sv).toBe('för mycket');
    expect(text.lexicon['dorme'].sv).toBe('sover');
  });

  it('märker när italienskan i en inklistrad text har ändrats', () => {
    const original = 'Il gatto di Giulia dorme. Ha mangiato troppo!';
    expect(assembleText(raw(), { ...opts, source: 'paste', original }).faithful).toBe(true);
    // Citattecken och mellanslag får skilja, orden får det inte.
    expect(
      assembleText(raw(), { ...opts, source: 'paste', original: `«${original}»\n` }).faithful,
    ).toBe(true);
    expect(
      assembleText(raw(), { ...opts, source: 'paste', original: 'Il gatto dorme.' }).faithful,
    ).toBe(false);
  });

  it('avvisar text som inte är italienska och svar utan användbar fråga', () => {
    const problem = (patch: Partial<RawText>) => {
      try {
        assembleText(raw(patch), opts);
      } catch (e) {
        return e instanceof AiError ? e.problem : 'annat fel';
      }
      return 'inget fel';
    };
    expect(problem({ italian: false })).toBe('not-italian');
    expect(problem({ sentences: [] })).toBe('bad-shape');
    expect(problem({ question: { sv: 'Vad?', options: ['A', 'B'], answer: 2 } })).toBe('bad-shape');
    expect(problem({ question: { sv: 'Vad?', options: ['A', 'A'], answer: 0 } })).toBe('bad-shape');
  });
});

describe('prompterna', () => {
  const ieri = data.texts.find((t) => t.id === 'ieri')!;
  const example = exampleFrom(
    ieri,
    ieri.sentences.map((s) => tokenize(s.it, data.lexicon)),
    data.names,
  );

  it('visar en inbyggd text som mall — och mallen klarar sin egen kontroll', () => {
    expect(example.names).toEqual(['Anna']);
    expect(example.lexicon.map((e) => e.form)).toContain('sono andata');

    const { missing, text } = assembleText(example, opts);
    expect(missing).toEqual([]);
    expect(Object.keys(text.lexicon).length).toBe(example.lexicon.length);
  });

  it('ger Claude pelarna, nivåerna och alla mazzi', () => {
    const system = systemPrompt(pillars, example);
    expect(system).toContain('D3 «motorn»');
    expect(system).toContain('D2.1 -zione');
    expect(system).toContain('"form":"sono andata"');
    expect(system.match(/^\d\. /gm)?.length).toBe(7);
  });

  it('beställer på rätt nivå, med öppna ord och ämne', () => {
    const prompt = writePrompt({
      level: 4,
      weave: [{ form: 'prende', sv: 'tar' }],
      topic: ' en cykeltur ',
      avoid: ['Maria'],
    });
    expect(prompt).toContain('Nivå: 4 av 7.');
    // Det som hör till nivå 5 och 6 nämns som förbjudet; den fria nivå 7 gör det inte.
    expect(prompt).toContain('får inte förekomma: Imperfetto');
    expect(prompt).toContain('Futurum');
    expect(prompt).not.toContain('Fri text');
    expect(prompt).toContain('högst 12 ord per mening');
    expect(prompt).toContain('Ämne: en cykeltur');
    expect(prompt).toContain('- prende (tar)');
    expect(prompt).toContain('Maria');

    expect(writePrompt({ level: 1, weave: [], topic: '', avoid: [] })).not.toContain(
      'slog nyligen',
    );
  });

  it('skickar en inklistrad text som material', () => {
    expect(glossPrompt('  Ciao a tutti.  ')).toContain('<text>\nCiao a tutti.\n</text>');
  });
});
