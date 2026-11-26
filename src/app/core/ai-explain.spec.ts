import { describe, expect, it } from 'vitest';
import { McQuestion, TfQuestion } from '../models/quiz.models';
import { answerPrompt, plain, wordPrompt } from './ai-explain';

const mc: McQuestion = {
  type: 'mc',
  tag: 'person',
  kind: 'Vilken person',
  q: 'Vem gör det i <b>parlano</b>?',
  options: ['jag', 'du', 'vi', 'de'],
  answer: 'de',
  explain: '«-ano» = de.',
  _k: 'D3.7_0',
  statKey: 'D3.7::person',
};

const tf: TfQuestion = {
  type: 'tf',
  tag: 'non',
  q: '«non» placeras <b>efter</b> verbet.',
  answer: false,
  explain: '«non» står före verbet.',
  _k: 'D1.1_9',
  statKey: 'D1.1::non',
};

describe('plain', () => {
  it('gör fetstil till markering och tar bort resten av koden', () => {
    expect(plain('Il <b>cane</b> &lt;non&gt; è <i>qui</i> &amp; là.')).toBe(
      'Il **cane** <non> è qui & là.',
    );
  });
});

describe('wordPrompt', () => {
  it('ger Claude formen, meningen och det appen redan sagt', () => {
    const prompt = wordPrompt({
      form: 'sono andata',
      sentence: ' Ieri sono andata al mare. ',
      entry: { p: 'D3', sv: 'jag gick', note: 'essere + andat·a' },
    });
    expect(prompt).toContain('slog upp «sono andata»');
    expect(prompt).toContain('\nIeri sono andata al mare.\n');
    expect(prompt).toContain('- pelare: D3 «motorn»');
    expect(prompt).toContain('- betydelse här: jag gick');
    expect(prompt).toContain('- förklaring: essere + andat·a');

    expect(
      wordPrompt({ form: 'cane', sentence: 'Il cane.', entry: { p: 'D4', sv: 'hund' } }),
    ).not.toContain('förklaring');
  });
});

describe('answerPrompt', () => {
  it('visar frågan, det rätta svaret och det läsaren valde', () => {
    const prompt = answerPrompt({
      question: mc,
      picked: 'vi',
      correct: false,
      deck: { title: 'Presens -are', hint: '-o -i -a' },
    });
    expect(prompt).toContain('ur mazzot «Presens -are» (-o -i -a)');
    expect(prompt).toContain('Vilken person:\nVem gör det i **parlano**?');
    expect(prompt).toContain('Alternativ: jag · du · vi · de');
    expect(prompt).toContain('Rätt svar: de\nLäsaren svarade: vi');
    expect(prompt).toContain('Appen har redan sagt: «-ano» = de.');
    expect(prompt).toContain('vad som gör läsarens svar fel');
  });

  it('frågar varför även när svaret var rätt', () => {
    const prompt = answerPrompt({ question: mc, picked: 'de', correct: true });
    expect(prompt).toContain('Läsaren fick den här frågan:');
    expect(prompt).toContain('Läsaren svarade: de');
    expect(prompt).toContain('svarade rätt men vill förstå varför');
  });

  it('räknar ut vad läsaren svarade på sant eller falskt', () => {
    const wrong = answerPrompt({ question: tf, picked: null, correct: false });
    expect(wrong).toContain('Sant eller falskt: «non» placeras **efter** verbet.');
    expect(wrong).toContain('Rätt svar: falskt\nLäsaren svarade: sant');
    expect(answerPrompt({ question: tf, picked: null, correct: true })).toContain(
      'Läsaren svarade: falskt',
    );
  });
});
