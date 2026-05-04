'use client';

import { useEffect, useRef } from 'react';
import { WeatherRenderer } from '@/lib/weatherRenderer';

interface CanvasProps {
  onRendererReady: (renderer: WeatherRenderer) => void;
  isPaused?: boolean;
}

export default function Canvas({ onRendererReady, isPaused = false }: CanvasProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const onReadyRef  = useRef(onRendererReady);
  onReadyRef.current = onRendererReady;

  // Shared state between the two effects — refs so no re-render needed
  const animIdRef  = useRef<number>(0);
  const loopRef    = useRef<(() => void) | null>(null);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused; // always synced to latest prop

  // Main setup effect — runs once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WeatherRenderer();

    const setSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    setSize();
    renderer.init(canvas);
    renderer.setDPR(window.devicePixelRatio || 1);
    onReadyRef.current(renderer);

    const handleResize = () => {
      setSize();
      renderer.resize(canvas.width, canvas.height);
      renderer.setDPR(window.devicePixelRatio || 1);
    };
    window.addEventListener('resize', handleResize);

    const loop = () => {
      renderer.render();
      animIdRef.current = requestAnimationFrame(loop);
    };
    loopRef.current = loop;
    animIdRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animIdRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause / resume effect — reacts to isPaused prop changes
  useEffect(() => {
    if (isPaused) {
      // Freeze: cancel the pending frame immediately
      cancelAnimationFrame(animIdRef.current);
    } else if (loopRef.current) {
      // Thaw: hard-reset canvas state before first new frame.
      // Without this, a leaked ctx.filter or ctx.globalAlpha from drawClouds
      // (which uses blur()) causes the residue layer to paint bright accumulated
      // cloud images onto a transparent canvas before the sky gradient covers it.
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
          ctx.filter = 'none';
          ctx.fillStyle = '#080808';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      cancelAnimationFrame(animIdRef.current);
      animIdRef.current = requestAnimationFrame(loopRef.current);
    }
  }, [isPaused]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0, display: 'block' }}
    />
  );
}
