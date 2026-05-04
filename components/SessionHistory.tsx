'use client';

import { useEffect, useState } from 'react';

export interface SessionRecord {
  signals: {
    intensity: number;
    deletionRate: number;
    flowMoments: number;
    avgPause: number;
  };
  timestamp: number;
  promptUsed: string;
  thumbnail: string; // base64 jpeg
}

export default function SessionHistory() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('residue-sessions');
      if (raw) setSessions(JSON.parse(raw));
    } catch {}
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 230,
        left: 24,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      {sessions.map((session, i) => (
        <div
          key={session.timestamp}
          title={`${new Date(session.timestamp).toLocaleDateString()} — "${session.promptUsed}"`}
          style={{
            width: 60,
            height: 40,
            overflow: 'hidden',
            opacity: 0.4 - i * 0.1,
            border: '1px solid rgba(232,232,240,0.08)',
            transition: 'opacity 0.3s',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.thumbnail}
            alt={`session ${i + 1}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      ))}
    </div>
  );
}

export function saveSession(
  canvas: HTMLCanvasElement,
  signals: SessionRecord['signals'],
  promptUsed: string,
): void {
  try {
    const thumb = document.createElement('canvas');
    thumb.width = 120;
    thumb.height = 80;
    const tc = thumb.getContext('2d')!;
    tc.drawImage(canvas, 0, 0, 120, 80);
    const thumbnail = thumb.toDataURL('image/jpeg', 0.5);

    const existing: SessionRecord[] = JSON.parse(
      localStorage.getItem('residue-sessions') || '[]',
    );
    const record: SessionRecord = {
      signals: {
        intensity: signals.intensity,
        deletionRate: signals.deletionRate,
        flowMoments: signals.flowMoments,
        avgPause: signals.avgPause,
      },
      timestamp: Date.now(),
      promptUsed,
      thumbnail,
    };
    const next = [record, ...existing].slice(0, 3);
    localStorage.setItem('residue-sessions', JSON.stringify(next));
  } catch {}
}
