/** Kopierar och blandar en array (Fisher–Yates). */
export function shuffle<T>(a: readonly T[]): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickRandom<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

/** **fet** → <b>fet</b>. Texterna innehåller redan <b> från datan. */
export function mdBold(s: string | null | undefined): string {
  return String(s ?? '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

export function trendStr(last5: readonly boolean[]): string {
  return last5.map((b) => (b ? '✓' : '✗')).join(' ');
}

export function relTime(ts: number | null): string {
  if (!ts) return 'aldrig';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'nyss';
  if (mins < 60) return mins + ' min sedan';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + ' tim sedan';
  return Math.round(hrs / 24) + ' dagar sedan';
}
