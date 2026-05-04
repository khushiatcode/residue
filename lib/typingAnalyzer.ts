export interface KeyEvent {
  timestamp: number;
  key: string;
  isDelete: boolean;
  isSpace: boolean;
  isPunctuation: boolean;
  timeSinceLast: number;
  wpm: number;
}

export interface TypingSignals {
  avgPause: number;
  pauseVariance: number;
  deletionRate: number;
  burstSpeed: number;
  currentSpeed: number;
  flowMoments: number;
  hesitationCount: number;
  rhythmScore: number;
  intensity: number;
  calmScore: number;
  totalKeys: number;
  corrections: number;
  hasStarted: boolean;
  lastKeyTime: number;
  recentDeletionBurst: boolean;
}

const DEFAULT_SIGNALS: TypingSignals = {
  avgPause: 0,
  pauseVariance: 0,
  deletionRate: 0,
  burstSpeed: 0,
  currentSpeed: 0,
  flowMoments: 0,
  hesitationCount: 0,
  rhythmScore: 0.5,
  intensity: 0,
  calmScore: 1,
  totalKeys: 0,
  corrections: 0,
  hasStarted: false,
  lastKeyTime: 0,
  recentDeletionBurst: false,
};

export class TypingAnalyzer {
  private events: KeyEvent[] = [];
  private signals: TypingSignals = { ...DEFAULT_SIGNALS };
  private recentDeletions: number[] = [];
  private flowMoments = 0;
  private prevWpm = 0;

  recordKey(key: string): void {
    const now = Date.now();
    const last = this.events[this.events.length - 1];
    const timeSinceLast = last ? now - last.timestamp : 0;

    const isDelete = key === 'Backspace' || key === 'Delete';
    const isSpace = key === ' ';
    const isPunctuation = /^[.,!?;:'"()\-]$/.test(key);

    // Rolling 5-second WPM: chars / 5 per char-per-word / (5s/60s per minute)
    const fiveAgo = now - 5000;
    const recent5 = this.events.filter(e => e.timestamp > fiveAgo && !e.isDelete);
    const wpm = Math.round(recent5.length * 2.4);

    // Flow moment: crossing above 80 wpm
    if (wpm > 80 && this.prevWpm <= 80) this.flowMoments++;
    this.prevWpm = wpm;

    if (isDelete) {
      this.recentDeletions.push(now);
      this.recentDeletions = this.recentDeletions.filter(t => now - t < 2000);
    }

    this.events.push({ timestamp: now, key, isDelete, isSpace, isPunctuation, timeSinceLast, wpm });

    this.recalc(now);
  }

  private recalc(now: number): void {
    const e = this.events;
    if (e.length === 0) return;

    // Pauses — ignore huge gaps (idle > 10s) and first-event gap
    const pauses = e
      .filter(ev => ev.timeSinceLast > 0 && ev.timeSinceLast < 10000)
      .map(ev => ev.timeSinceLast);

    const avgPause = pauses.length
      ? pauses.reduce((s, v) => s + v, 0) / pauses.length
      : 0;

    const variance = pauses.length > 1
      ? Math.sqrt(pauses.reduce((s, v) => s + (v - avgPause) ** 2, 0) / pauses.length)
      : 0;

    const deletions = e.filter(ev => ev.isDelete).length;
    const totalKeys = e.length;
    const deletionRate = totalKeys > 0 ? deletions / totalKeys : 0;

    const burstSpeed = e.reduce((max, ev) => Math.max(max, ev.wpm), 0);

    const threeAgo = now - 3000;
    const recent3 = e.filter(ev => ev.timestamp > threeAgo && !ev.isDelete);
    // chars in 3s / 5 chars-per-word / (3s/60s) = chars * 4
    const currentSpeed = Math.round(recent3.length * 4);

    const hesitationCount = pauses.filter(p => p > 1500).length;

    const rhythmScore = pauses.length > 3
      ? Math.max(0, 1 - variance / 1000)
      : 0.5;

    const intensity = Math.min(1, Math.max(0,
      (currentSpeed / 100) * 0.4 +
      (1 - deletionRate) * 0.3 +
      (1 - Math.min(1, variance / 1000)) * 0.3
    ));

    this.signals = {
      avgPause,
      pauseVariance: variance,
      deletionRate,
      burstSpeed,
      currentSpeed,
      flowMoments: this.flowMoments,
      hesitationCount,
      rhythmScore: Math.max(0, Math.min(1, rhythmScore)),
      intensity,
      calmScore: 1 - intensity,
      totalKeys,
      corrections: deletions,
      hasStarted: true,
      lastKeyTime: now,
      recentDeletionBurst: this.recentDeletions.length >= 3,
    };
  }

  getSignals(): TypingSignals {
    return { ...this.signals };
  }

  reset(): void {
    this.events = [];
    this.recentDeletions = [];
    this.flowMoments = 0;
    this.prevWpm = 0;
    this.signals = { ...DEFAULT_SIGNALS };
  }
}
