import { StatRow } from '../models/quiz.models';
import { relTime, trendStr } from './utils';

/** Bygger den text man klistrar in i en AI för att få en studieplan. */
export function buildAIReport(rows: readonly StatRow[]): string {
  const lines = [
    'Här är min övningsdata från en app för att lära mig italienska. Varje rad är en',
    'specifik grammatikpunkt eller ordgrupp, med min träffsäkerhet, hur många gånger',
    'jag testats på den, och mina senaste 5 resultat (✓/✗, äldst först). Ge mig en kort,',
    'prioriterad studieplan: vad jag bör repetera först, vad jag ska fortsätta öva, och',
    'vad som uppenbart sitter. Förklara gärna en grammatikpunkt kort om det hjälper.',
    '',
    '=== ÖVNINGSDATA ===',
  ];
  if (!rows.length) {
    lines.push('(ingen data än)');
    return lines.join('\n');
  }

  const sorted = rows.slice().sort((a, b) => {
    if (a.pillarId !== b.pillarId) return a.pillarId.localeCompare(b.pillarId);
    if (a.deckId !== b.deckId)
      return a.deckId.localeCompare(b.deckId, undefined, { numeric: true });
    return a.acc - b.acc;
  });

  let pillarId: string | null = null;
  let deckId: string | null = null;
  for (const r of sorted) {
    if (r.pillarId !== pillarId) {
      lines.push('', `## ${r.pillarTitle}`);
      pillarId = r.pillarId;
      deckId = null;
    }
    if (r.deckId !== deckId) {
      lines.push(`  ${r.deckId} — ${r.deckTitle}`);
      deckId = r.deckId;
    }
    const pct = Math.round(r.acc * 100);
    lines.push(
      `    - ${r.tagLabel}: ${pct}% (${r.correct}/${r.attempts}), senaste 5: ${trendStr(r.last5)}, ` +
        `senast övat ${relTime(r.lastSeen)}`,
    );
  }
  return lines.join('\n');
}
