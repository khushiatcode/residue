'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TypingAnalyzer, TypingSignals } from '@/lib/typingAnalyzer';
import { WeatherRenderer } from '@/lib/weatherRenderer';
import { SoundEngine } from '@/lib/soundEngine';
import { buildCompositeImage } from '@/lib/compositeExport';
import TopBar from '@/components/TopBar';
import PromptSelector from '@/components/PromptSelector';
import SessionHistory, { saveSession } from '@/components/SessionHistory';
import AnalysisPanel, {
  type SignalSnapshot,
  type CanvasSnapshot,
  type MicroMoments,
} from '@/components/AnalysisPanel';

const Canvas = dynamic(() => import('@/components/Canvas'), { ssr: false });

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

const PROMPTS = [
  'describe your day',
  "something you're avoiding",
  'right now, honestly',
];

export default function Home() {
  const analyzerRef = useRef<TypingAnalyzer>(new TypingAnalyzer());
  const rendererRef = useRef<WeatherRenderer | null>(null);
  const soundRef    = useRef<SoundEngine>(new SoundEngine());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edge-detect deletion burst and flow state across keydowns
  const prevBurstRef = useRef(false);
  const flowActiveRef = useRef(false);

  // Composite export data
  const wpmHistoryRef    = useRef<number[]>([]);
  const sessionStartRef  = useRef<number>(0);

  // Analysis panel data
  const peakWpmRef              = useRef<number>(0);
  const flowEnteredRef          = useRef<boolean>(false);
  const lastKeyDownRef          = useRef<number>(0);
  const longestPauseDurationRef = useRef<number>(0);

  const [signals, setSignals] = useState<TypingSignals>(DEFAULT_SIGNALS);
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [saved, setSaved] = useState(false);
  const [muted, setMuted] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Analysis panel state
  const [isAnalysisOpen, setIsAnalysisOpen]   = useState(false);
  const [signalHistory, setSignalHistory]      = useState<SignalSnapshot[]>([]);
  const [canvasSnapshots, setCanvasSnapshots]  = useState<CanvasSnapshot[]>([]);
  const [microMoments, setMicroMoments]        = useState<MicroMoments>({
    peak: null, longestPause: null, flowEntered: null,
  });

  const handleRendererReady = useCallback((renderer: WeatherRenderer) => {
    rendererRef.current = renderer;
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Sample WPM every 3 seconds once typing has started
  useEffect(() => {
    const id = setInterval(() => {
      if (analyzerRef.current.getSignals().hasStarted) {
        wpmHistoryRef.current.push(analyzerRef.current.getSignals().currentSpeed);
      }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Signal history for analysis panel timeline (3s)
  useEffect(() => {
    const id = setInterval(() => {
      const s = analyzerRef.current.getSignals();
      if (!s.hasStarted) return;
      setSignalHistory(prev => [...prev, {
        time: Date.now(),
        currentSpeed: s.currentSpeed,
        deletionRate: s.deletionRate,
        intensity: s.intensity,
        rhythmScore: s.rhythmScore,
      }]);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Canvas thumbnails for timeline hover (5s)
  useEffect(() => {
    const id = setInterval(() => {
      if (!analyzerRef.current.getSignals().hasStarted) return;
      const canvasEl = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvasEl) return;
      try {
        const thumb = document.createElement('canvas');
        thumb.width = 120;
        thumb.height = 80;
        thumb.getContext('2d')!.drawImage(canvasEl, 0, 0, 120, 80);
        setCanvasSnapshots(prev => [
          ...prev.slice(-20),
          { time: Date.now(), dataURL: thumb.toDataURL('image/jpeg', 0.5) },
        ]);
      } catch { /* canvas may be tainted cross-origin in some envs */ }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab → 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? 0;
      const end   = el.selectionEnd   ?? 0;
      el.value = el.value.slice(0, start) + '  ' + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + 2;
    }

    const isDelete = e.key === 'Backspace' || e.key === 'Delete';

    // Longest pause: measure gap from last keydown (only within an active session)
    const nowMs = Date.now();
    const pauseGap = lastKeyDownRef.current > 0 ? nowMs - lastKeyDownRef.current : 0;
    if (pauseGap > 1500 && pauseGap > longestPauseDurationRef.current && sessionStartRef.current > 0) {
      longestPauseDurationRef.current = pauseGap;
      setMicroMoments(prev => ({ ...prev, longestPause: { time: nowMs, duration: pauseGap } }));
    }
    lastKeyDownRef.current = nowMs;

    // Mark session start on very first key (before recordKey sets hasStarted)
    if (!analyzerRef.current.getSignals().hasStarted && sessionStartRef.current === 0) {
      sessionStartRef.current = Date.now();
    }

    // Typing analysis
    analyzerRef.current.recordKey(e.key);
    const next = analyzerRef.current.getSignals();
    rendererRef.current?.update(next);
    setSignals(next);

    // Peak speed
    if (next.currentSpeed > peakWpmRef.current) {
      peakWpmRef.current = next.currentSpeed;
      setMicroMoments(prev => ({ ...prev, peak: { time: Date.now(), wpm: next.currentSpeed } }));
    }

    // ── Sound engine ──
    const engine = soundRef.current;
    engine.resume();                          // no-op after first call
    engine.playKeystroke(isDelete);
    engine.setRainIntensity(next.deletionRate * 2);
    engine.setWindIntensity(next.intensity);

    // Lightning + thunder: only on the rising edge of recentDeletionBurst
    if (next.recentDeletionBurst && !prevBurstRef.current) {
      rendererRef.current?.triggerLightning();
      engine.playThunder();
    }
    prevBurstRef.current = next.recentDeletionBurst;

    // Flow tone: enter/exit + first-entry micro-moment
    const isFlow = next.flowMoments > 3 && next.deletionRate < 0.05;
    if (isFlow && !flowActiveRef.current) {
      engine.startFlowTone();
      if (!flowEnteredRef.current) {
        flowEnteredRef.current = true;
        setMicroMoments(prev => ({ ...prev, flowEntered: { time: Date.now() } }));
      }
    }
    if (!isFlow && flowActiveRef.current) engine.stopFlowTone();
    flowActiveRef.current = isFlow;
  }, []);

  const handleToggleAnalysis = useCallback(() => {
    setIsAnalysisOpen(prev => !prev);
  }, []);

  // Pause / resume canvas + sound when analysis opens or closes
  useEffect(() => {
    if (isAnalysisOpen) {
      soundRef.current.pauseAll();
    } else {
      soundRef.current.resumeAll();
    }
  }, [isAnalysisOpen]);

  const handleToggleMute = useCallback(() => {
    const nowMuted = soundRef.current.toggleMute();
    setMuted(nowMuted);
  }, []);

  const handleSave = useCallback(async () => {
    if (!rendererRef.current) return;

    rendererRef.current.triggerSave();

    // Show captured state immediately — don't wait for composite build
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 3000);

    const weatherCanvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    const currentSignals = analyzerRef.current.getSignals();
    const duration = sessionStartRef.current > 0
      ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
      : 0;

    // Build composite and download
    try {
      const dataURL = await buildCompositeImage(
        weatherCanvas ?? rendererRef.current['canvas' as never] as HTMLCanvasElement,
        currentSignals,
        [...wpmHistoryRef.current],
        prompt,
        duration,
      );
      const link = document.createElement('a');
      link.download = `residue-${Date.now()}.png`;
      link.href = dataURL;
      link.click();
    } catch {
      // Fallback: plain canvas capture
      const dataURL = rendererRef.current.captureDataURL();
      const link = document.createElement('a');
      link.download = `residue-${Date.now()}.png`;
      link.href = dataURL;
      link.click();
    }

    // Persist thumbnail to localStorage
    if (weatherCanvas) {
      saveSession(
        weatherCanvas,
        {
          intensity:    currentSignals.intensity,
          deletionRate: currentSignals.deletionRate,
          flowMoments:  currentSignals.flowMoments,
          avgPause:     currentSignals.avgPause,
        },
        prompt,
      );
    }
  }, [prompt]);

  // Writing UI fades out (canvas keeps rendering in background)
  const writingStyle: React.CSSProperties = {
    opacity: isAnalysisOpen ? 0 : 1,
    transition: 'opacity 0.6s ease',
    pointerEvents: isAnalysisOpen ? 'none' : undefined,
  };

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* Writing view — fades while analysis is open; canvas keeps running */}
      <div style={writingStyle}>
        <Canvas onRendererReady={handleRendererReady} isPaused={isAnalysisOpen} />

        <TopBar
          signals={signals}
          onSave={handleSave}
          saved={saved}
          muted={muted}
          onToggleMute={handleToggleMute}
          isAnalysisOpen={isAnalysisOpen}
          onToggleAnalysis={handleToggleAnalysis}
        />

        <SessionHistory />

        {/* Bottom typing section */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 220,
            zIndex: 10,
            background: 'linear-gradient(transparent, rgba(8,8,8,0.95))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          <PromptSelector selected={prompt} onSelect={setPrompt} />

          <textarea
            ref={textareaRef}
            onKeyDown={handleKeyDown}
            placeholder={prompt}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            style={{
              width: '100%',
              height: 120,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: '"Fragment Mono", monospace',
              fontSize: 14,
              color: 'var(--mist)',
              caretColor: 'var(--rain)',
              lineHeight: 1.8,
              padding: '8px 48px 24px',
              letterSpacing: '0.01em',
            }}
          />
        </div>
      </div>

      {/* Analysis — full-screen takeover, renders above writing view */}
      <AnalysisPanel
        isOpen={isAnalysisOpen}
        onClose={() => { setIsAnalysisOpen(false); }}
        signals={signals}
        signalHistory={signalHistory}
        canvasSnapshots={canvasSnapshots}
        microMoments={microMoments}
      />

      <style>{`
        textarea::placeholder { color: rgba(232,232,240,0.15); }
      `}</style>
    </main>
  );
}
