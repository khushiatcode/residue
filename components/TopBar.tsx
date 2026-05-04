'use client';

import { TypingSignals } from '@/lib/typingAnalyzer';

interface TopBarProps {
  signals: TypingSignals;
  onSave: () => void;
  saved: boolean;
  muted: boolean;
  onToggleMute: () => void;
  isAnalysisOpen: boolean;
  onToggleAnalysis: () => void;
}

export default function TopBar({
  signals, onSave, saved, muted, onToggleMute, isAnalysisOpen, onToggleAnalysis,
}: TopBarProps) {
  const wpm = Math.round(signals.currentSpeed);
  const avgPause = Math.round(signals.avgPause);
  const corrections = signals.corrections;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'linear-gradient(rgba(8,8,8,0.88), rgba(8,8,8,0))',
        pointerEvents: 'none',
      }}
    >
      {/* Left: wordmark */}
      <span style={{
        fontFamily: '"Fragment Mono", monospace',
        fontSize: 13,
        color: 'var(--mist)',
        letterSpacing: '0.25em',
        userSelect: 'none',
      }}>
        RESIDUE
      </span>

      {/* Center: live stats or captured message */}
      {saved ? (
        <span style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: '"Fragment Mono", monospace',
          fontSize: 11,
          color: 'var(--mist)',
          letterSpacing: '0.18em',
        }}>
          RESIDUE CAPTURED
        </span>
      ) : (
        <span style={{
          fontFamily: '"Fragment Mono", monospace',
          fontSize: 10,
          color: 'var(--ghost)',
          letterSpacing: '0.05em',
          opacity: signals.hasStarted ? 1 : 0,
          transition: 'opacity 0.4s',
        }}>
          {`↑ ${avgPause}ms avg pause  ·  ← ${corrections} corrections  ·  ◈ ${wpm} wpm`}
        </span>
      )}

      {/* Right: analysis toggle + mute + save */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        pointerEvents: 'all',
      }}>
        <button
          onClick={onToggleAnalysis}
          style={{
            fontFamily: '"Fragment Mono", monospace',
            fontSize: 11,
            color: isAnalysisOpen
              ? 'rgba(232,232,240,0.7)'
              : 'rgba(232,232,240,0.25)',
            background: 'none',
            border: 'none',
            padding: '4px 2px',
            cursor: 'pointer',
            letterSpacing: '0.08em',
            transition: 'color 0.2s',
            outline: 'none',
          }}
        >
          ◈ ANALYSIS
        </button>

        <button
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
          style={{
            fontFamily: '"Fragment Mono", monospace',
            fontSize: 11,
            color: muted ? 'rgba(232,232,240,0.25)' : 'rgba(232,232,240,0.5)',
            background: 'none',
            border: 'none',
            padding: '4px 2px',
            cursor: 'pointer',
            transition: 'color 0.2s',
            outline: 'none',
          }}
        >
          {muted ? '○' : '●'}
        </button>

        <button
          onClick={onSave}
          style={{
            fontFamily: '"Fragment Mono", monospace',
            fontSize: 11,
            color: 'var(--mist)',
            background: 'none',
            border: '1px solid rgba(232,232,240,0.3)',
            borderRadius: 0,
            padding: '6px 16px',
            cursor: 'pointer',
            letterSpacing: '0.08em',
            transition: 'border-color 0.2s',
            outline: 'none',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(232,232,240,0.7)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(232,232,240,0.3)';
          }}
        >
          SAVE RESIDUE
        </button>
      </div>
    </div>
  );
}
