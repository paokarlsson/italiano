import { describe, expect, it } from 'vitest';
import { Deck } from '../models/quiz.models';
import { cleanDeckQuestions, deckPrompt, deckSchema, quickTags, RawDeckQuestions } from './ai-deck';

const deck: Deck = {
  deckId: 'D3.7',
  title: '-are i presens',
  hint: 'parlo…parlano',
  pool: [
    {
      type: 'mc',
      tag: 'who',
      kind: 'Vilken person',
      q: 'Vem gör det i <b>parlano</b>?',
      options: ['jag', 'du', 'vi', 'de'],
      answer: 'de',
      explain: '«-ano» = de.',
      _k: 'D3.7_0',
      statKey: 'D3.7::who',
    },
    {
      type: 'tf',
      tag: 'mean',
      q: '<b>parlo</b> betyder «jag pratar».',
      answer: true,
      explain: '«-o» = jag.',
      _k: 'D3.7_1',
      statKey: 'D3.7::mean',
    },
    {
      type: 'match',
      tag: 'match',
      instr: 'Para ihop.',
      pairs: [['parlo', 'jag pratar']],
      _k: 'D3.7_2',
      statKey: 'D3.7::match',
    },
  ],
};

const ask = (patch: Partial<RawDeckQuestions['mc'][number]> = {}) => ({
  tag: 'who',
  kind: 'Vilken person',
  q: 'Vem gör det i **mangiamo**?',
  options: ['jag', 'du', 'vi', 'de'],
  answer: 2,
  explain: ' «-iamo» = vi & ingen annan ',
  ...patch,
});

describe('att bygga ut ett mazzo', () => {
  it('låser taggen till dem som går att bygga ut', () => {
    expect(quickTags(deck)).toEqual(['who', 'mean']);
    expect(deckSchema(quickTags(deck)).properties.mc.items.properties.tag.enum).toEqual([
      'who',
      'mean',
    ]);
  });

  it('visar Claude mazzot som det är och var det går trögt', () => {
    const prompt = deckPrompt({
      deck,
      pillarTitle: 'Il motore',
      accuracy: { who: 0.4, mean: null },
    });
    expect(prompt).toContain(
      'Skriv 8 nya frågor till mazzot D3.7 «-are i presens» (parlo…parlano)',
    );
    expect(prompt).toContain('- who («läsa av person»): 40 % rätt');
    expect(prompt).toContain('- mean («ordbetydelse»): inte övad');
    // Frågorna visas utan appens nycklar och med fetstilen som markering.
    expect(prompt).toContain('"q":"Vem gör det i **parlano**?"');
    expect(prompt).not.toContain('statKey');
    expect(prompt).not.toContain('Para ihop');
  });

  it('gör svaret till frågor i gymmets form, märkta som skrivna av Claude', () => {
    const questions = cleanDeckQuestions(
      {
        mc: [ask()],
        tf: [
          {
            tag: 'mean',
            q: '**canto** betyder «du sjunger» <eller?>',
            answer: false,
            explain: 'x',
          },
        ],
      },
      deck,
    );
    expect(questions).toEqual([
      {
        type: 'mc',
        tag: 'who',
        kind: 'Vilken person',
        q: 'Vem gör det i <b>mangiamo</b>?',
        options: ['jag', 'du', 'vi', 'de'],
        answer: 'vi',
        explain: '«-iamo» = vi &amp; ingen annan',
        _k: 'D3.7_ai_3',
        statKey: 'D3.7::who',
        ai: true,
      },
      {
        type: 'tf',
        tag: 'mean',
        q: '<b>canto</b> betyder «du sjunger» &lt;eller?&gt;',
        answer: false,
        explain: 'x',
        _k: 'D3.7_ai_4',
        statKey: 'D3.7::mean',
        ai: true,
      },
    ]);
  });

  it('släpper frågor som inte håller formen eller redan finns', () => {
    const questions = cleanDeckQuestions(
      {
        mc: [
          ask({ tag: 'match' }),
          ask({ q: '  ' }),
          ask({ options: ['jag', 'jag', 'vi'] }),
          ask({ options: ['jag', 'vi'] }),
          ask({ answer: 4 }),
          // Samma fråga som redan står i mazzot, och samma nya fråga två gånger.
          ask({ q: 'Vem gör det i **parlano**?' }),
          ask({ q: 'Vem gör det i **cantano**?' }),
          ask({ q: 'vem gör det i «cantano»' }),
        ],
        tf: [{ tag: 'who', q: '**parlo** betyder «jag pratar».', answer: true, explain: '' }],
      },
      deck,
    );
    expect(questions.map((q) => q._k)).toEqual(['D3.7_ai_3']);
    expect(questions[0].type === 'mc' && questions[0].q).toContain('cantano');
  });
});
