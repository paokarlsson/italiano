import { describe, expect, it } from 'vitest';
import { buildAIReport } from './ai-report';
import { StatRow } from '../models/quiz.models';

function row(over: Partial<StatRow> = {}): StatRow {
  return {
    key: 'D1.1::mean',
    tag: 'mean',
    deckId: 'D1.1',
    deckTitle: 'De minsta',
    pillarId: 'D1',
    pillarTitle: 'Il collante',
    attempts: 5,
    correct: 1,
    last5: [false, true, false, false, false],
    lastSeen: Date.now(),
    acc: 0.2,
    ...over,
  };
}

describe('buildAIReport', () => {
  it('säger ifrån när det inte finns någon data', () => {
    expect(buildAIReport([])).toContain('(ingen data än)');
  });

  it('grupperar raderna under pelare och mazzo', () => {
    const text = buildAIReport([
      row(),
      row({
        key: 'D1.2::verb',
        tag: 'verb',
        deckId: 'D1.2',
        deckTitle: 'Motorn',
        acc: 0.9,
        correct: 9,
        attempts: 10,
      }),
    ]);
    expect(text).toContain('## Il collante');
    expect(text).toContain('  D1.1 — De minsta');
    expect(text).toContain('  D1.2 — Motorn');
    expect(text).toContain('- mean: 20% (1/5), senaste 5: ✗ ✓ ✗ ✗ ✗, senast övat nyss');
    expect(text.indexOf('D1.1')).toBeLessThan(text.indexOf('D1.2'));
  });

  it('sorterar svagaste taggen först inom ett mazzo', () => {
    const text = buildAIReport([
      row({ key: 'D1.1::form', tag: 'form', acc: 0.8, correct: 8, attempts: 10 }),
      row({ key: 'D1.1::mean', tag: 'mean', acc: 0.2 }),
    ]);
    expect(text.indexOf('- mean:')).toBeLessThan(text.indexOf('- form:'));
  });
});
