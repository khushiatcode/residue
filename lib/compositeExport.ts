import type { TypingSignals } from './typingAnalyzer';

// ── Utilities ────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function formatTimestamp(d: Date): string {
  const M = ['JAN','FEB','MAR','APR','MAY','JUN',
              'JUL','AUG','SEP','OCT','NOV','DEC'];
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}  ·  ${h % 12 || 12}:${min} ${ampm}`;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function generateReading(signals: TypingSignals, wpmHistory: number[]): string {
  const { deletionRate, rhythmScore, corrections, hesitationCount,
          burstSpeed, calmScore, flowMoments, avgPause } = signals;

  if (deletionRate > 0.35)         return 'Fighting yourself more than the words.';
  if (rhythmScore > 0.75 && corrections < 10)
                                   return 'Unusually steady. You knew what you wanted.';
  if (hesitationCount > 6 && burstSpeed > 70)
                                   return 'Long silences, then sudden certainty.';
  if (calmScore > 0.7 && deletionRate < 0.1)
                                   return 'Rare clarity. You wrote like you meant it.';
  if (flowMoments > 3 && avgPause < 200)
                                   return 'Uninterrupted. Thought moved faster than doubt.';
  if (hesitationCount > 8 && flowMoments === 0)
                                   return 'Every sentence cost something.';
  if (avgPause > 2000 && corrections < 5)
                                   return 'Slow and deliberate. Considering every word.';
  if (burstSpeed > 100 && deletionRate > 0.2)
                                   return 'Intense. Fast then second-guessed.';
  if (wpmHistory.length < 5)       return "Brief. Some things don't need many words.";
  return 'A moment, recorded.';
}

// ── Drawing helpers ───────────────────────────────────

function sep(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.strokeStyle = 'rgba(232,232,240,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function mist(alpha: number): string {
  return `rgba(232,232,240,${alpha})`;
}

function mono(size: number, italic = false): string {
  return `${italic ? 'italic ' : ''}${size}px "Fragment Mono", monospace`;
}

// ── Main ─────────────────────────────────────────────

export async function buildCompositeImage(
  weatherCanvas: HTMLCanvasElement,
  signals: TypingSignals,
  wpmHistory: number[],
  prompt: string,
  sessionDuration: number,
): Promise<string> {
  // Ensure Fragment Mono is ready before any text calls
  try { await document.fonts.load('400 13px "Fragment Mono"'); } catch { /* continue */ }

  const W = 1800;
  const H = 900;
  const HALF = 900;
  const PAD = 60;
  const CX = HALF + PAD;          // content left edge
  const CW = HALF - PAD * 2;      // content width: 780

  const out = document.createElement('canvas');
  out.width  = W;
  out.height = H;
  const ctx  = out.getContext('2d')!;

  // ── Left half: weather ───────────────────────────────
  ctx.drawImage(weatherCanvas, 0, 0, HALF, H);

  // ── Right half: data panel ───────────────────────────
  ctx.fillStyle = '#080808';
  ctx.fillRect(HALF, 0, HALF, H);

  let y = PAD;

  // ── RESIDUE header ──
  ctx.font = mono(11);
  ctx.letterSpacing = '0.3em';
  ctx.fillStyle = mist(0.4);
  ctx.fillText('RESIDUE', CX, y + 11);
  ctx.letterSpacing = '0em';
  y += 22;

  // Timestamp
  ctx.font = mono(11);
  ctx.fillStyle = mist(0.4);
  ctx.fillText(formatTimestamp(new Date()), CX, y + 11);
  y += 28;

  sep(ctx, CX, y, CW);
  y += 28;

  // Prompt
  ctx.font = mono(13, true);
  ctx.fillStyle = mist(0.6);
  ctx.fillText(`"${prompt}"`, CX, y + 13);
  y += 52;

  // ── RHYTHM TRACE label ──
  ctx.font = mono(9);
  ctx.letterSpacing = '0.2em';
  ctx.fillStyle = mist(0.3);
  ctx.fillText('RHYTHM TRACE', CX, y + 9);
  ctx.letterSpacing = '0em';
  y += 20;

  // ── Waveform ──
  const waveTop = y;
  const waveH   = 80;

  if (wpmHistory.length >= 2) {
    const maxWpm  = Math.max(...wpmHistory, 1);
    const norm    = wpmHistory.map(v => v / maxWpm);
    const nLast   = norm.length - 1;
    const xOf     = (i: number) => CX + (i / nLast) * CW;
    const yOf     = (v: number) => waveTop + waveH - v * waveH;

    // Gradient fill below line
    const fillGrad = ctx.createLinearGradient(0, waveTop, 0, waveTop + waveH);
    fillGrad.addColorStop(0, 'rgba(126,184,247,0.15)');
    fillGrad.addColorStop(1, 'rgba(126,184,247,0)');

    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(norm[0]));
    norm.forEach((v, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(v)); });
    ctx.lineTo(xOf(nLast), waveTop + waveH);
    ctx.lineTo(xOf(0), waveTop + waveH);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Pause markers — vertical lines where WPM was 0
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(126,184,247,0.1)';
    norm.forEach((v, i) => {
      if (v === 0 && i > 0) {
        ctx.beginPath();
        ctx.moveTo(xOf(i), waveTop);
        ctx.lineTo(xOf(i), waveTop + waveH);
        ctx.stroke();
      }
    });

    // Stroke the waveform line on top
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(norm[0]));
    norm.forEach((v, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(v)); });
    ctx.strokeStyle = '#7EB8F7';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Not enough data — ambient baseline
    ctx.beginPath();
    ctx.moveTo(CX, waveTop + waveH);
    ctx.lineTo(CX + CW, waveTop + waveH);
    ctx.strokeStyle = 'rgba(126,184,247,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  y = waveTop + waveH + 32;

  sep(ctx, CX, y, CW);
  y += 38;

  // ── Stats grid: 2 columns × 3 rows ──
  const COL = CW / 2; // 390
  const ROW = 52;

  const stats: [string, string, string, string][] = [
    ['AVG PAUSE',    `${Math.round(signals.avgPause)}ms`,
     'CORRECTIONS',  String(signals.corrections)],
    ['PEAK SPEED',   `${Math.round(signals.burstSpeed)} wpm`,
     'FLOW MOMENTS', String(signals.flowMoments)],
    ['HESITATIONS',  String(signals.hesitationCount),
     'DURATION',     formatDuration(sessionDuration)],
  ];

  for (let r = 0; r < 3; r++) {
    const [lLab, lVal, rLab, rVal] = stats[r];
    const ry = y + r * ROW;

    for (const [col, label, val] of [
      [0, lLab, lVal],
      [1, rLab, rVal],
    ] as [number, string, string][]) {
      const cx = CX + col * COL;

      ctx.font = mono(9);
      ctx.letterSpacing = '0.05em';
      ctx.fillStyle = mist(0.3);
      ctx.fillText(label, cx, ry + 9);

      ctx.font = mono(18);
      ctx.letterSpacing = '0em';
      ctx.fillStyle = mist(0.9);
      ctx.fillText(val, cx, ry + 9 + 24);
    }
  }

  y += 3 * ROW + 22;

  sep(ctx, CX, y, CW);
  y += 34;

  // ── READING ──
  ctx.font = mono(9);
  ctx.letterSpacing = '0.2em';
  ctx.fillStyle = mist(0.3);
  ctx.fillText('READING', CX, y + 9);
  ctx.letterSpacing = '0em';
  y += 26;

  const reading = generateReading(signals, wpmHistory);
  ctx.font = mono(13);
  ctx.fillStyle = mist(0.8);
  const lines = wrapText(ctx, reading, CW);
  for (const line of lines) {
    ctx.fillText(line, CX, y + 13);
    y += Math.round(13 * 1.6);
  }

  // ── Footer — anchored to bottom ──
  ctx.font = mono(9);
  ctx.fillStyle = mist(0.2);
  ctx.fillText('residue.app', CX, H - PAD + 9);

  return out.toDataURL('image/png');
}
