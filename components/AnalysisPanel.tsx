'use client';

import { useEffect, useRef, useState } from 'react';
import type { TypingSignals } from '@/lib/typingAnalyzer';
import type { SessionRecord } from '@/components/SessionHistory';

// ── Exported types consumed by page.tsx ─────────────

export interface SignalSnapshot {
  time: number;
  currentSpeed: number;
  deletionRate: number;
  intensity: number;
  rhythmScore: number;
}

export interface CanvasSnapshot {
  time: number;
  dataURL: string;
}

export interface MicroMoments {
  peak: { time: number; wpm: number } | null;
  longestPause: { time: number; duration: number } | null;
  flowEntered: { time: number } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  signals: TypingSignals;
  signalHistory: SignalSnapshot[];
  canvasSnapshots: CanvasSnapshot[]; // kept in props for compatibility; no longer rendered
  microMoments: MicroMoments;
}

// ── Constants ─────────────────────────────────────────

const TRACK_COLORS = ['#7EB8F7', '#E8724A', '#A78BFA', '#7FBFA8'];
const TRACK_KEYS   = ['currentSpeed', 'deletionRate', 'intensity', 'rhythmScore'] as const;
const TRACK_LABELS = ['SPEED', 'DELETION', 'INTENSITY', 'RHYTHM'];
const TRACK_MAX    = [120, 1, 1, 1];
const TRACK_DEFS   = [
  'Keystrokes per minute. Peaks show moments of confident output.',
  'How often you backspaced. High deletion = fighting your own words.',
  'Composite energy score combining speed, rhythm, and corrections.',
  'How metronomic your typing was. High = steady, low = erratic.',
];

// FIX 1 — pentagon centered at (140, 140) with radius 100px, canvas 280×280
const RADAR_SIZE    = 280;
const RADAR_CX      = 140;
const RADAR_CY      = 140;
const RADAR_R       = 100;
const RADAR_LABEL_R = 128;
const RADAR_N       = 5;
const RADAR_AXES = [
  { label: 'Conviction', def: 'How committed you were to each word before writing it' },
  { label: 'Momentum',   def: 'Rate of sustained forward motion' },
  { label: 'Depth',      def: 'The weight of each pause — thinking before speaking' },
  { label: 'Flow',       def: 'Moments when thought outpaced doubt' },
  { label: 'Volatility', def: 'The rhythm of your hesitations' },
];
const RADAR_ANGLES = Array.from(
  { length: RADAR_N },
  (_, i) => (2 * Math.PI * i / RADAR_N) - Math.PI / 2,
);

// Left margin for y-axis labels — shared by drawTimeline and handleTimelineMove
const CHART_LEFT = 40;

// ── Pure helpers ──────────────────────────────────────

function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} ${h >= 12 ? 'pm' : 'am'}`;
}

// Formats a Unix-ms timestamp as "h:mm:ss am/pm".
// Falls back to manual construction if toLocaleTimeString returns empty.
function fmtSnapTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  try {
    const s = d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    }).toLowerCase();
    if (s) return s; // guard against empty-string return on some platforms
  } catch { /* fall through */ }
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} ${h >= 12 ? 'pm' : 'am'}`;
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function hexToRgb(hex: string): string {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

function getSurface(s: TypingSignals): string {
  if (!s.hasStarted) return 'Begin typing to generate a reading.';
  if (s.corrections === 0) return `Clean output. ${Math.round(s.currentSpeed)} wpm, nothing deleted.`;
  return `${Math.round(s.deletionRate * 100)}% deletion rate — ${s.corrections} corrections across ${s.totalKeys} keystrokes.`;
}

function getPattern(s: TypingSignals): string {
  if (s.deletionRate > 0.3) return 'Recursive editing — rewriting as you go.';
  if (s.rhythmScore > 0.7 && s.deletionRate < 0.1) return 'Write-through — no second-guessing.';
  if (s.hesitationCount > 5 && s.burstSpeed > 60) return 'Think-then-burst — internal editing first.';
  if (s.avgPause > 1500) return 'Pause-heavy — searching for the right words.';
  if (s.burstSpeed > 80 && s.deletionRate > 0.2) return 'Sprint-and-retreat — fast then uncertain.';
  return 'Measured — steady progression.';
}

function getQuestion(s: TypingSignals): string {
  if (s.deletionRate > 0.35) return 'What were you trying not to say?';
  if (s.flowMoments > 3) return 'Where did that come from?';
  if (s.hesitationCount > 6) return 'What were you waiting for?';
  if (s.rhythmScore > 0.75) return 'Did you already know?';
  if (s.avgPause > 2000) return 'Was it worth the weight?';
  return 'What did this cost you?';
}

// ── Canvas draw functions ─────────────────────────────

function drawTimeline(canvas: HTMLCanvasElement, history: SignalSnapshot[]): void {
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth;
  const H   = 160;

  if (W === 0) return;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Explicit chart boundaries in CSS-pixel coordinate space (after ctx.scale)
  const CL = CHART_LEFT;   // 40 — left edge of data area
  const CR = W - 8;        // right edge
  const CT = 8;            // top edge
  const CB = H - 8;        // bottom edge
  const CW = CR - CL;      // chart width
  const CH = CB - CT;      // chart height

  // Y-axis reference lines at exact 100 / 50 / 0 positions
  const y100 = CT;
  const y50  = CT + CH * 0.5;
  const y0   = CB;

  ctx.font = '8px "Fragment Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(232,232,240,0.25)';
  ctx.fillText('100', CL - 6, y100 + 3);
  ctx.fillText('50',  CL - 6, y50  + 3);
  ctx.fillText('0',   CL - 6, y0   + 3);

  ctx.lineWidth = 1;

  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = 'rgba(232,232,240,0.08)';
  ctx.beginPath(); ctx.moveTo(CL, y100); ctx.lineTo(CR, y100); ctx.stroke();

  ctx.strokeStyle = 'rgba(232,232,240,0.06)';
  ctx.beginPath(); ctx.moveTo(CL, y50);  ctx.lineTo(CR, y50);  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(232,232,240,0.10)';
  ctx.beginPath(); ctx.moveTo(CL, y0);   ctx.lineTo(CR, y0);   ctx.stroke();

  if (history.length < 2) {
    TRACK_COLORS.forEach((c, i) => {
      const y = CB - (i * CH / 5);
      ctx.beginPath();
      ctx.moveTo(CL, y);
      ctx.lineTo(CR, y);
      ctx.strokeStyle = `rgba(${hexToRgb(c)},0.1)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    return;
  }

  const total = history.length;
  // xOf: maps index 0..total-1 into [CL, CR)
  const xOf = (i: number) => CL + (i / total) * CW;
  // yOf: normalised value 0..1 maps top=1 → CT, bottom=0 → CB
  const yOf = (v: number) => CT + (1 - Math.min(1, Math.max(0, v))) * CH;

  TRACK_KEYS.forEach((key, ti) => {
    const max   = TRACK_MAX[ti];
    const color = TRACK_COLORS[ti];
    const rgb   = hexToRgb(color);

    const grad = ctx.createLinearGradient(0, CT, 0, CB);
    grad.addColorStop(0, `rgba(${rgb},0.16)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);

    // Fill
    ctx.beginPath();
    history.forEach((snap, i) => {
      const x = xOf(i);
      const y = yOf((snap[key] as number) / max);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(total - 1), CB);
    ctx.lineTo(CL, CB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke
    ctx.beginPath();
    history.forEach((snap, i) => {
      const x = xOf(i);
      const y = yOf((snap[key] as number) / max);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = `rgba(${rgb},0.75)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Tick marks
  const tickInterval = Math.max(1, Math.floor(total / 8));
  history.forEach((_, i) => {
    if (i % tickInterval !== 0) return;
    const x = xOf(i);
    ctx.beginPath();
    ctx.moveTo(x, CB);
    ctx.lineTo(x, CB + 2);
    ctx.strokeStyle = 'rgba(232,232,240,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

// FIX 1 — radar at exactly 280×280, center (140,140), radius 100
function drawRadar(canvas: HTMLCanvasElement, signals: TypingSignals): void {
  canvas.width  = RADAR_SIZE;
  canvas.height = RADAR_SIZE;
  canvas.style.width  = `${RADAR_SIZE}px`;
  canvas.style.height = `${RADAR_SIZE}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE);

  const vals = [
    Math.max(0, 1 - signals.deletionRate),
    Math.min(1, signals.currentSpeed / 100),
    Math.min(1, signals.hesitationCount / 8),
    Math.min(1, signals.flowMoments / 6),
    Math.min(1, signals.pauseVariance / 800),
  ];

  // Grid rings
  [0.25, 0.5, 0.75, 1].forEach(scale => {
    ctx.beginPath();
    RADAR_ANGLES.forEach((a, i) => {
      const x = RADAR_CX + RADAR_R * scale * Math.cos(a);
      const y = RADAR_CY + RADAR_R * scale * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = scale === 1 ? 'rgba(232,232,240,0.1)' : 'rgba(232,232,240,0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Axes
  RADAR_ANGLES.forEach(a => {
    ctx.beginPath();
    ctx.moveTo(RADAR_CX, RADAR_CY);
    ctx.lineTo(RADAR_CX + RADAR_R * Math.cos(a), RADAR_CY + RADAR_R * Math.sin(a));
    ctx.strokeStyle = 'rgba(232,232,240,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Data shape
  ctx.beginPath();
  RADAR_ANGLES.forEach((a, i) => {
    const x = RADAR_CX + RADAR_R * vals[i] * Math.cos(a);
    const y = RADAR_CY + RADAR_R * vals[i] * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(126,184,247,0.15)';
  ctx.fill();
  ctx.strokeStyle = '#7EB8F7';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Data point dots
  ctx.fillStyle = '#7EB8F7';
  RADAR_ANGLES.forEach((a, i) => {
    ctx.beginPath();
    ctx.arc(
      RADAR_CX + RADAR_R * vals[i] * Math.cos(a),
      RADAR_CY + RADAR_R * vals[i] * Math.sin(a),
      3, 0, Math.PI * 2,
    );
    ctx.fill();
  });
}

// ── Sub-components ────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: 'rgba(232,232,240,0.07)', margin: '28px 0' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: '"Fragment Mono", monospace',
      fontSize: 9,
      letterSpacing: '0.22em',
      color: 'rgba(232,232,240,0.28)',
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

// FIX 3 — `below` prop controls tooltip direction for track-label tooltips
function InfoTooltip({ text, below = false, width = 'max-content' }: {
  text: string;
  below?: boolean;
  width?: number | string;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', cursor: 'help', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{ color: 'rgba(232,232,240,0.18)', fontSize: 9, marginLeft: 3 }}>ⓘ</span>
      {show && (
        <span style={{
          position: 'absolute',
          ...(below
            ? { top: '130%', bottom: 'auto' }
            : { bottom: '130%', top: 'auto' }),
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#111118',
          border: '1px solid rgba(232,232,240,0.15)',
          padding: '6px 10px',
          fontSize: 10,
          fontFamily: '"Fragment Mono", monospace',
          color: 'rgba(232,232,240,0.55)',
          whiteSpace: 'normal',
          width,
          zIndex: 200,
          pointerEvents: 'none',
          letterSpacing: '0.02em',
          lineHeight: 1.5,
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ── Cross-session (reads localStorage) ───────────────

function CrossSession() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('residue-sessions');
      if (raw) setSessions(JSON.parse(raw));
    } catch {}
  }, []);

  if (sessions.length === 0) {
    return (
      <>
        <SectionLabel>CROSS-SESSION</SectionLabel>
        <div style={{
          fontFamily: '"Fragment Mono", monospace',
          fontSize: 11,
          color: 'rgba(232,232,240,0.2)',
        }}>
          No saved sessions yet.
        </div>
      </>
    );
  }

  return (
    <>
      <SectionLabel>CROSS-SESSION</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions.map(s => (
          <div key={s.timestamp} style={{
            display: 'flex',
            gap: 14,
            alignItems: 'flex-start',
            borderBottom: '1px solid rgba(232,232,240,0.06)',
            paddingBottom: 12,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.thumbnail}
              alt=""
              style={{ width: 80, height: 53, objectFit: 'cover', flexShrink: 0, opacity: 0.7 }}
            />
            <div>
              <div style={{
                fontFamily: '"Fragment Mono", monospace',
                fontSize: 10,
                color: 'rgba(232,232,240,0.55)',
                marginBottom: 4,
              }}>
                {fmtDate(s.timestamp)}
              </div>
              <div style={{
                fontFamily: '"Fragment Mono", monospace',
                fontSize: 11,
                color: 'rgba(232,232,240,0.35)',
                fontStyle: 'italic',
              }}>
                "{s.promptUsed}"
              </div>
              <div style={{
                fontFamily: '"Fragment Mono", monospace',
                fontSize: 9,
                color: 'rgba(232,232,240,0.2)',
                marginTop: 4,
                letterSpacing: '0.05em',
              }}>
                {Math.round(s.signals.intensity * 100)}% intensity  ·
                {' '}{Math.round(s.signals.deletionRate * 100)}% deletion
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────

export default function AnalysisPanel({
  isOpen, onClose, signals, signalHistory, microMoments,
}: Props) {
  const [everOpened, setEverOpened] = useState(false);
  const [frozenHistory, setFrozenHistory] = useState<SignalSnapshot[]>([]);
  // Ref mirrors frozenHistory so the stale setTimeout closure always has real data
  const frozenHistoryRef = useRef<SignalSnapshot[]>([]);
  const radarRef         = useRef<HTMLCanvasElement>(null);
  const timelineRef      = useRef<HTMLCanvasElement>(null);
  const timelineWrapRef  = useRef<HTMLDivElement>(null);

  // FIX 2 — hover state now carries the SignalSnapshot directly (no thumbnail)
  const [thumbState, setThumbState] = useState<{
    x: number;
    snap: SignalSnapshot;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEverOpened(true);
      const snapshot = [...signalHistory];
      setFrozenHistory(snapshot);
      // Sync ref immediately (synchronous) so the 50ms timeout closure
      // picks up real data, not the stale [] from before the state update lands
      frozenHistoryRef.current = snapshot;
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  // Draw radar on signals change
  useEffect(() => {
    if (!isOpen || !radarRef.current) return;
    drawRadar(radarRef.current, signals);
  }, [signals, isOpen]);

  // Draw timeline on frozen history change
  useEffect(() => {
    if (!isOpen || !timelineRef.current) return;
    drawTimeline(timelineRef.current, frozenHistory);
  }, [frozenHistory, isOpen]);

  // FIX 1 — use setTimeout(50) so the panel is visible in the DOM before drawing;
  // rAF is not sufficient when the panel transitions from opacity:0
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => {
      if (radarRef.current)    drawRadar(radarRef.current, signals);
      // Use ref (not the stale frozenHistory closure) — fixes lines being wiped
      if (timelineRef.current) drawTimeline(timelineRef.current, frozenHistoryRef.current);
    }, 50);
    return () => clearTimeout(id);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!everOpened) return null;

  const handleTimelineMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!frozenHistory.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const CL = CHART_LEFT;
    const CW = rect.width - 8 - CL;

    const total  = frozenHistory.length;
    const rawIdx = (mouseX - CL) / CW * (total - 1);
    const idx    = Math.max(0, Math.min(total - 1, Math.round(rawIdx)));

    const snap = frozenHistory[idx];
    if (!snap) return;

    // Diagnostic — confirms what's in the data at hover time
    console.log('TOOLTIP DEBUG:', {
      dataIndex:      idx,
      entryExists:    !!snap,
      entry:          snap,
      hasTimestamp:   !!snap.time,
      timestampValue: snap.time,
    });

    const crossX = CL + (idx / total) * CW;
    setThumbState({ x: crossX, snap });
  };

  const mono = (sz: number): React.CSSProperties => ({
    fontFamily: '"Fragment Mono", monospace',
    fontSize: sz,
  });

  // Clamp tooltip so it never overflows the right edge
  const containerW  = timelineWrapRef.current?.offsetWidth ?? 600;
  const tooltipLeft = thumbState
    ? Math.max(0, Math.min(containerW - 160, thumbState.x - 80))
    : 0;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      background: '#080808',
      opacity: isOpen ? 1 : 0,
      pointerEvents: isOpen ? 'all' : 'none',
      transition: 'opacity 0.6s ease',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ── Analysis top bar ── */}
      <div style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 48px',
        borderBottom: '1px solid rgba(232,232,240,0.07)',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            ...mono(11),
            color: 'rgba(232,232,240,0.35)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.08em',
            padding: '4px 0',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(232,232,240,0.7)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(232,232,240,0.35)'; }}
        >
          ← BACK
        </button>

        <span style={{
          ...mono(13),
          color: 'rgba(232,232,240,0.6)',
          letterSpacing: '0.25em',
          userSelect: 'none',
        }}>
          SESSION ANALYSIS
        </span>

        <div style={{ width: 80 }} />
      </div>

      {/* ── Two-column content ── */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: 48,
        padding: 48,
        alignItems: 'start',
      }}>

        {/* ════════ LEFT COLUMN (60%) ════════ */}
        <div>

          {/* TIMELINE */}
          <SectionLabel>SESSION TIMELINE</SectionLabel>

          {/* FIX 3 — track labels each have a ⓘ tooltip opening downward */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {TRACK_LABELS.map((lbl, i) => (
              <span key={lbl} style={{
                ...mono(9),
                color: TRACK_COLORS[i],
                opacity: 0.8,
                letterSpacing: '0.08em',
                display: 'inline-flex',
                alignItems: 'center',
              }}>
                {lbl}
                <InfoTooltip text={TRACK_DEFS[i]} below width={200} />
              </span>
            ))}
          </div>

          {/* Timeline canvas + hover overlay */}
          <div
            ref={timelineWrapRef}
            style={{ position: 'relative', cursor: 'crosshair', overflow: 'visible' }}
            onMouseMove={handleTimelineMove}
            onMouseLeave={() => setThumbState(null)}
          >
            <canvas
              ref={timelineRef}
              style={{ display: 'block', width: '100%', height: 160 }}
            />

            {/* Crosshair — stays at cursor position */}
            {thumbState && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: thumbState.x,
                width: 1,
                height: 160,
                background: 'rgba(232,232,240,0.2)',
                pointerEvents: 'none',
              }} />
            )}

            {/* Tooltip: timestamp + separator + signal rows */}
            {thumbState && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: tooltipLeft,
                width: 160,
                minHeight: 120,
                background: '#111118',
                border: '1px solid rgba(232,232,240,0.15)',
                zIndex: 100,
                pointerEvents: 'none',
              }}>
                {/* 1 — Timestamp */}
                <div style={{
                  ...mono(10),
                  color: 'rgba(232,232,240,0.55)',
                  padding: '12px 12px 0',
                  minHeight: 14,
                }}>
                  {fmtSnapTime(thumbState.snap.time)}
                </div>

                {/* 2 — Separator */}
                <div style={{
                  height: 1,
                  background: 'rgba(232,232,240,0.1)',
                  margin: '6px 8px',
                }} />

                {/* 3 — Signal rows */}
                <div style={{ padding: '0 12px 12px' }}>
                  {([
                    ['SPEED',     `${Math.round(thumbState.snap.currentSpeed)} wpm`],
                    ['DELETION',  `${Math.round(thumbState.snap.deletionRate * 100)}%`],
                    ['INTENSITY', thumbState.snap.intensity.toFixed(2)],
                    ['RHYTHM',    thumbState.snap.rhythmScore.toFixed(2)],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <span style={{ ...mono(10), color: 'rgba(232,232,240,0.35)' }}>{label}</span>
                      <span style={{ ...mono(10), color: 'rgba(232,232,240,0.9)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Divider />

          {/* EXPANDED READING */}
          <SectionLabel>EXPANDED READING</SectionLabel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ ...mono(9), color: 'rgba(232,232,240,0.25)', letterSpacing: '0.12em', marginBottom: 6 }}>
                SURFACE
                <InfoTooltip text="What the numbers say, plainly" />
              </div>
              <div style={{ ...mono(13), color: 'rgba(232,232,240,0.65)', lineHeight: 1.6 }}>
                {getSurface(signals)}
              </div>
            </div>

            <div>
              <div style={{ ...mono(9), color: 'rgba(232,232,240,0.25)', letterSpacing: '0.12em', marginBottom: 6 }}>
                PATTERN
                <InfoTooltip text="The behavioral shape of this session" />
              </div>
              <div style={{ ...mono(13), color: 'rgba(232,232,240,0.65)', lineHeight: 1.6 }}>
                {getPattern(signals)}
              </div>
            </div>

            <div style={{ marginTop: 4 }}>
              <div style={{ ...mono(9), color: 'rgba(232,232,240,0.25)', letterSpacing: '0.12em', marginBottom: 6 }}>
                QUESTION
                <InfoTooltip text="Something worth sitting with" />
              </div>
              <div style={{ ...mono(15), color: 'rgba(232,232,240,0.85)', fontStyle: 'italic', lineHeight: 1.5 }}>
                {getQuestion(signals)}
              </div>
            </div>
          </div>

        </div>

        {/* ════════ RIGHT COLUMN (40%) ════════ */}
        <div>

          {/* FINGERPRINT RADAR */}
          <SectionLabel>FINGERPRINT</SectionLabel>

          <div style={{
            position: 'relative',
            width: RADAR_SIZE,
            height: RADAR_SIZE,
            overflow: 'visible',
            marginBottom: 8,
          }}>
            <canvas
              ref={radarRef}
              style={{ position: 'absolute', top: 0, left: 0, display: 'block' }}
            />
            {RADAR_ANGLES.map((a, i) => {
              const lx  = RADAR_CX + RADAR_LABEL_R * Math.cos(a);
              const ly  = RADAR_CY + RADAR_LABEL_R * Math.sin(a);
              const cos = Math.cos(a);
              const sin = Math.sin(a);
              const tx  = cos > 0.2 ? '0%' : cos < -0.2 ? '-100%' : '-50%';
              const ty  = sin > 0.2 ? '0%' : sin < -0.2 ? '-100%' : '-50%';
              return (
                <div key={i} style={{
                  position: 'absolute',
                  left: lx,
                  top: ly,
                  transform: `translate(${tx}, ${ty})`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ ...mono(9), color: 'rgba(232,232,240,0.38)', letterSpacing: '0.06em' }}>
                    {RADAR_AXES[i].label}
                  </span>
                  <InfoTooltip text={RADAR_AXES[i].def} />
                </div>
              );
            })}
          </div>

          <Divider />

          {/* MICRO-MOMENTS */}
          <SectionLabel>MICRO-MOMENTS</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ borderLeft: '2px solid rgba(126,184,247,0.3)', paddingLeft: 14 }}>
              <div style={{ ...mono(9), color: 'rgba(232,232,240,0.28)', letterSpacing: '0.1em', marginBottom: 4 }}>
                PEAK SPEED
                <InfoTooltip text="Fastest burst of sustained typing in this session" />
              </div>
              <div style={{ ...mono(13), color: 'rgba(232,232,240,0.8)' }}>
                {microMoments.peak ? `${microMoments.peak.wpm} wpm` : '—'}
              </div>
              {microMoments.peak && (
                <div style={{ ...mono(10), color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>
                  {fmtTime(microMoments.peak.time)}
                </div>
              )}
            </div>

            <div style={{ borderLeft: '2px solid rgba(245,200,66,0.3)', paddingLeft: 14 }}>
              <div style={{ ...mono(9), color: 'rgba(232,232,240,0.28)', letterSpacing: '0.1em', marginBottom: 4 }}>
                LONGEST PAUSE
                <InfoTooltip text="The longest silence between keystrokes" />
              </div>
              <div style={{ ...mono(13), color: 'rgba(232,232,240,0.8)' }}>
                {microMoments.longestPause ? fmtMs(microMoments.longestPause.duration) : '—'}
              </div>
              {microMoments.longestPause && (
                <div style={{ ...mono(10), color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>
                  {fmtTime(microMoments.longestPause.time)}
                </div>
              )}
            </div>

            <div style={{ borderLeft: '2px solid rgba(127,191,168,0.3)', paddingLeft: 14 }}>
              <div style={{ ...mono(9), color: 'rgba(232,232,240,0.28)', letterSpacing: '0.1em', marginBottom: 4 }}>
                FLOW STATE
                <InfoTooltip text="When typing exceeded 80 wpm with fewer than 5% deletions" />
              </div>
              <div style={{ ...mono(13), color: 'rgba(232,232,240,0.8)' }}>
                {microMoments.flowEntered ? 'Reached' : 'Not yet'}
              </div>
              {microMoments.flowEntered && (
                <div style={{ ...mono(10), color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>
                  {fmtTime(microMoments.flowEntered.time)}
                </div>
              )}
            </div>
          </div>

          <Divider />

          <CrossSession />

        </div>
      </div>
    </div>
  );
}
