/**
 * Bygger regelbanken för PoC:en och skriver en rapport.
 *
 * Skriptet gissar aldrig fram italienskan — det _verifierar_ att regeln ger det
 * handkontrollerade facit, och klassar varje ord efter hur många regler som
 * behövdes. Ord där ingen regelkombination når fram faller ut som undantag och
 * blir därmed synliga i stället för tysta.
 *
 * Ordbanken delas i övning och prov. Provorden visas aldrig under övning — det
 * är dem hela försöket står och faller med: kan du skriva ett ord du aldrig sett?
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY, derive } from './rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const HOLDOUT = 0.25;

/** Liten deterministisk hash — samma uppdelning vid varje körning. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const words = readFileSync(resolve(here, 'words.tsv'), 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [en, it] = l.split('\t');
    return { en, it };
  });
const entries = [];
const orphans = [];

for (const { en, it } of words) {
  // Längsta matchande ändelse vinner: «nationality» är -ty, inte -al.
  const candidates = PRIMARY.filter((r) => r.from.test(en.toLowerCase()));
  if (!candidates.length) {
    orphans.push({ en, it, why: 'ingen primärregel matchar' });
    continue;
  }
  const scored = candidates
    .map((rule) => ({ rule, ...derive(en, it, rule) }))
    .sort((a, b) => {
      const rank = (k) => (k === 'ren' ? 0 : k === 'staplad' ? 1 : 2);
      return rank(a.klass) - rank(b.klass) || a.via.length - b.via.length;
    });
  const best = scored[0];
  if (best.klass === 'undantag') orphans.push({ en, it, why: `regeln ger «${best.predicted}»` });
  entries.push({
    en,
    it,
    rule: best.rule.id,
    ruleLabel: best.rule.label,
    deck: best.rule.deck,
    klass: best.klass,
    via: best.via.map((s) => s.label),
    set: hash(en) < HOLDOUT ? 'prov' : 'övning',
  });
}

const by = (fn) => entries.reduce((acc, e) => ((acc[fn(e)] = (acc[fn(e)] ?? 0) + 1), acc), {});
const klasser = by((e) => e.klass);
const perRule = {};
for (const e of entries) {
  const r = (perRule[e.rule] ??= {
    label: e.ruleLabel,
    deck: e.deck,
    n: 0,
    ren: 0,
    staplad: 0,
    undantag: 0,
    prov: 0,
  });
  r.n++;
  r[e.klass]++;
  if (e.set === 'prov') r.prov++;
}

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const lines = [
  '# Regelbanken — rapport',
  '',
  `Ordpar: ${entries.length}. Övning: ${entries.filter((e) => e.set === 'övning').length}. ` +
    `Prov (visas aldrig under övning): ${entries.filter((e) => e.set === 'prov').length}.`,
  '',
  '## Hur orden nås',
  '',
  `- **Ren regel** — primärregeln ensam räcker: ${klasser.ren ?? 0} (${pct(klasser.ren ?? 0, entries.length)} %)`,
  `- **Staplade regler** — plus en eller två ortografiska: ${klasser.staplad ?? 0} (${pct(klasser.staplad ?? 0, entries.length)} %)`,
  `- **Undantag** — ingen kombination når fram: ${klasser.undantag ?? 0} (${pct(klasser.undantag ?? 0, entries.length)} %)`,
  '',
  '## Per regel',
  '',
  '| Regel | Mazzo | Ord | Rena | Staplade | Undantag | Provord |',
  '| --- | --- | --: | --: | --: | --: | --: |',
  ...Object.entries(perRule)
    .sort((a, b) => b[1].n - a[1].n)
    .map(
      ([, r]) =>
        `| ${r.label} | ${r.deck} | ${r.n} | ${r.ren} | ${r.staplad} | ${r.undantag} | ${r.prov} |`,
    ),
  '',
  '## Undantagen',
  '',
  'De här orden lyder inte regeln. I banken är det just de som är värda en egen',
  'förklaring — ett undantag man sett en gång är billigare än ett man gissar fel på.',
  '',
  ...orphans.map((o) => `- **${o.en}** → ${o.it} (${o.why})`),
  '',
];

mkdirSync(resolve(here, 'out'), { recursive: true });
// Rapporten är granskningsytan och följer med i repot. Banken är ren maskin-
// utdata och byggs om vid behov — den hör inte hemma i en diff.
writeFileSync(resolve(here, 'report.md'), lines.join('\n'));
writeFileSync(resolve(here, 'out/bank.json'), JSON.stringify(entries) + '\n');
console.log(lines.slice(0, 22).join('\n'));
console.log(`\nUndantag: ${orphans.length}`);
console.log(`\nSkrev report.md och out/bank.json`);
