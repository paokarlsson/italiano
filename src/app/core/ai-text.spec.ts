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

  it('behåller repetitionsfrågor som håller formen och hör till en bit i texten', () => {
    const ask = (form: string, patch: object = {}) => ({
      form,
      q: `Vad betyder **${form}**?`,
      options: ['a', 'b', 'c', 'd'],
      answer: 1,
      explain: ' därför ',
      ...patch,
    });
    const { text } = assembleText(
      raw({
        ripasso: [
          ask('Dorme'),
          // Saknar uppslag än så länge — kompletteringen kan ge det ett.
          ask('troppo'),
          ask('cane'),
          ask('gatto', { options: ['a', 'a', 'b'] }),
          ask('gatto', { options: ['a', 'b'] }),
          ask('gatto', { options: ['a', '', 'b'] }),
          ask('gatto', { answer: 4 }),
          ask('gatto', { q: ' ' }),
        ],
      }),
      opts,
    );
    expect(text.questions).toEqual([
      // Formen görs om till gemener, som ordlistans nycklar.
      { ...ask('Dorme'), form: 'dorme', explain: 'därför' },
      { ...ask('troppo'), explain: 'därför' },
    ]);
    // Frågorna följer med genom kompletteringen.
    const repaired = mergeRepair(text, { lexicon: [], names: [] }, namesOf(raw()), opts);
    expect(repaired.text.questions?.length).toBe(2);
    expect(assembleText(raw(), opts).text.questions).toBeUndefined();
  });

  it('tar med rösterna där de går jämnt upp med replikerna', () => {
    const { text } = assembleText(
      raw({
        narrator: 'm',
        sentences: [
          { it: '«Ciao!» dice Giulia.', sv: 'x', speakers: ['f'] },
          { it: '«A» e «B»', sv: 'x', speakers: ['f'] },
          { it: 'Il gatto dorme.', sv: 'x', speakers: [] },
        ],
      }),
      opts,
    );
    expect(text.narrator).toBe('m');
    expect(text.sentences.map((s) => s.speakers)).toEqual([['f'], undefined, undefined]);
    // Saknas berättaren blir den kvinnlig.
    expect(assembleText(raw(), opts).text.narrator).toBe('f');
  });

  it('märker en text från Claude med del och recap, men inte en inklistrad', () => {
    const ai = assembleText(raw({ recap: ' Giulia har en katt. ' }), { ...opts, part: 3 }).text;
    expect(ai).toMatchObject({ part: 3, recap: 'Giulia har en katt.' });
    expect(assembleText(raw(), opts).text.part).toBe(1);

    const paste = assembleText(raw({ recap: 'x' }), { ...opts, source: 'paste' }).text;
    expect(paste.part).toBeUndefined();
    expect(paste.recap).toBeUndefined();
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
    expect(system).toContain('# Repetitionsfrågor (ripasso)');
    expect(system).toContain('- recap:');
    expect(system).toContain('- narrator och speakers:');
    expect(example.narrator).toBe('f');
    expect(example.sentences.every((s) => Array.isArray(s.speakers))).toBe(true);
  });

  it('börjar en berättelse, eller fortsätter den med det som hänt hittills', () => {
    const base = { level: 2, weave: [], avoid: [] };
    const first = writePrompt({ ...base, topic: '' });
    expect(first).toContain('första delen av en berättelse');
    expect(first).toContain('Ämne: välj själv — en vardaglig scen');

    const next = writePrompt({
      ...base,
      topic: '',
      story: {
        part: 3,
        recap: 'Luca har tappat nyckeln.',
        title: 'La chiave',
        last: ['Luca cerca.'],
      },
    });
    expect(next).toContain('del 3 av en berättelse');
    expect(next).toContain('Hittills: Luca har tappat nyckeln.');
    expect(next).toContain('Förra delen, «La chiave»:\nLuca cerca.');
    expect(next).toContain('Ämne: välj själv — nästa scen i berättelsen.');
    expect(next).not.toContain('första delen');

    // En äldre text utan recap går också att fortsätta på, och ämnet får styra scenen.
    const old = writePrompt({
      ...base,
      topic: 'en resa',
      story: { part: 2, recap: '', title: 'La chiave', last: ['Luca cerca.'] },
    });
    expect(old).not.toContain('Hittills');
    expect(old).toContain('Ämne: en resa');
  });

  it('gör texten tät på pelaren där uppslagen hopar sig', () => {
    const base = { level: 4, weave: [], topic: '', avoid: [] };
    const prompt = writePrompt({
      ...base,
      focus: { p: 'D3', decks: ['D3.11 Passato prossimo (avere + -ato)'] },
    });
    expect(prompt).toContain('slår oftast upp ord ur motorn (D3)');
    expect(prompt).toContain('Flest uppslag där hör till: D3.11 Passato prossimo (avere + -ato).');

    expect(writePrompt({ ...base, focus: { p: 'D1', decks: [] } })).not.toContain('Flest uppslag');
    expect(writePrompt({ ...base, focus: null })).not.toContain('slår oftast upp');
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
