import { LexEntry } from '../models/leggi.models';
import { McQuestion, TfQuestion } from '../models/quiz.models';
import { PILLAR_NAMES } from './profile';

/**
 * «Perché?» — förklaringen läsaren kan be Claude om när appens egen rad inte räcker.
 * Här ligger bara det som sägs till Claude; anropet ligger i AiService.
 */

export const EXPLAIN_SYSTEM = `Du förklarar italienska för en svensktalande som lär sig läsa språket i en app. Läsaren har just slagit upp ett ord i en text, eller svarat på en övningsfråga, och vill veta varför det är som det är.

Appen sorterar allt i fyra pelare, och förklaringen går genom den pelare formen hör till:

- D1 «limmet»: funktionsord. Säg vad ordet gör i meningen, och vad det är hopdraget av om det är det.
- D2 «reglerna»: ord som går att härleda ur engelskan med en ändelseregel, och falska vänner. Visa härledningen.
- D3 «motorn»: former där ändelsen bär betydelsen. Visa delningen med mittpunkt («parl·ano») och vad ändelsen säger om person, tempus, genus eller antal.
- D4 «orden»: innehållsord som måste läras. Ge en minneskrok om det finns en ärlig sådan — ett släktord i svenskan eller engelskan, ett lånord.

Läsaren har redan sett det som står under «Appen har redan sagt». Upprepa inte det. Säg det som fattas: varför just den här formen står just här, eller vad som skiljer den från det läsaren kan ha blandat ihop den med.

Svara på svenska med två till fyra meningar löpande text. Ingen rubrik, ingen lista, ingen markdown, ingen inledning och ingen fråga tillbaka. Italienska ord och exempel skrivs inom «». Håll dig till det som behövs för att läsa — inga termer som inte förklarar något.

Hitta inte på släktskap eller regler som inte finns. Är det enda sanna att ordet måste läras, säg det kort.`;

/** Frågetexterna är HTML i datan: fetstil blir **…**, resten av taggarna försvinner. */
export function plain(html: string): string {
  return html
    .replace(/<\/?b>/gi, '**')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

export interface WordRequest {
  /** Formen som den står i texten. */
  form: string;
  /** Meningen den står i. */
  sentence: string;
  entry: LexEntry;
}

/** Ett uppslaget ord i sin mening. */
export function wordPrompt(req: WordRequest): string {
  const lines = [
    `Läsaren slog upp «${req.form}» i den här meningen:`,
    '',
    req.sentence.trim(),
    '',
    'Appen har redan sagt:',
    `- pelare: ${req.entry.p} «${PILLAR_NAMES[req.entry.p]}»`,
    `- betydelse här: ${req.entry.sv}`,
  ];
  if (req.entry.note) lines.push(`- förklaring: ${req.entry.note}`);
  lines.push('', 'Varför ser formen ut så, och varför står den just här?');
  return lines.join('\n');
}

export interface AnswerRequest {
  question: McQuestion | TfQuestion;
  /** Alternativet läsaren valde på en flervalsfråga — null om det inte är känt. */
  picked: string | null;
  correct: boolean;
  /** Mazzot frågan kommer ur, om den kommer ur gymmet. */
  deck?: { title: string; hint: string } | null;
}

/** En besvarad fråga ur gymmet eller repetitionen. */
export function answerPrompt(req: AnswerRequest): string {
  const q = req.question;
  const from = req.deck
    ? ` ur mazzot «${req.deck.title}»${req.deck.hint ? ` (${req.deck.hint})` : ''}`
    : '';
  const lines = [`Läsaren fick den här frågan${from}:`, ''];

  if (q.type === 'tf') {
    lines.push(
      `Sant eller falskt: ${plain(q.q)}`,
      '',
      `Rätt svar: ${q.answer ? 'sant' : 'falskt'}`,
      `Läsaren svarade: ${q.answer === req.correct ? 'sant' : 'falskt'}`,
    );
  } else {
    // Rubriken bär ibland själva frågan: «Från engelska», «Vad betyder det markerade?».
    if (q.kind && q.kind !== 'Flerval') lines.push(`${q.kind}:`);
    lines.push(
      plain(q.q),
      '',
      `Alternativ: ${q.options.join(' · ')}`,
      `Rätt svar: ${q.answer}`,
      `Läsaren svarade: ${req.correct ? q.answer : (req.picked ?? 'fel')}`,
    );
  }

  const said = plain(q.explain);
  if (said) lines.push('', `Appen har redan sagt: ${said}`);
  lines.push(
    '',
    req.correct
      ? 'Läsaren svarade rätt men vill förstå varför. Förklara vad som gör svaret rätt.'
      : 'Förklara varför det rätta svaret är rätt, och vad som gör läsarens svar fel.',
  );
  return lines.join('\n');
}
