import { lerp, clamp } from './lerp';
import type { TypingSignals } from './typingAnalyzer';

interface CloudEllipse {
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  opacity: number;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  opacity: number;
  turbulence: number;
  wobbleOffset: number;
  wobbleSpeed: number;
  ellipses: CloudEllipse[];
}

interface Raindrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  thickness: number;
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  opacity: number;
  size: number;
}

export class WeatherRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private residueCanvas!: HTMLCanvasElement;
  private residueCtx!: CanvasRenderingContext2D;

  private w = 800;
  private h = 600;
  private dpr = 1;
  private time = 0;
  private lastSnapshotTime = 0;

  // Intro
  private canvasOpacity = 0;

  // "begin." text
  private beginOpacity = 0;
  private beginPulsePhase = 0;
  private hasEverTyped = false;

  // Lightning — double flash
  private lightningFlash = 0;
  private lightning2Timer = 0;
  private lightning2Flash = 0;

  // Save effect
  private saveEffectTimer = 0;

  private signals: TypingSignals | null = null;

  // ── Lerped state ─────────────────────────────────────
  private skyTopR = 8;  private skyTopG = 8;  private skyTopB = 8;
  private skyBotR = 26; private skyBotG = 26; private skyBotB = 46;
  private skyTopRT = 8;  private skyTopGT = 8;  private skyTopBT = 8;
  private skyBotRT = 26; private skyBotGT = 26; private skyBotBT = 46;

  private rainAngle = 0;
  private rainAngleT = 0;

  private fogHeight = 0;        // fraction of canvas height
  private fogHeightT = 0.35;

  private atmGlow = 0;
  private atmGlowT = 0;

  private cloudDark = 0;
  private cloudDarkT = 0;

  // Overlay effects on sky
  private deletionCrimson = 0;
  private deletionCrimsonT = 0;
  private flowAmber = 0;
  private flowAmberT = 0;

  // Rain burst → near-white color
  private rainBurstWhite = 0;
  private rainBurstWhiteT = 0;

  private currentRainCount = 0;
  private targetRainCount = 0;

  private currentParticleCount = 150;
  private targetParticleCount = 150;

  // Entities
  private clouds: Cloud[] = [];
  private raindrops: Raindrop[] = [];
  private particles: Particle[] = [];

  // ─────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.residueCanvas = document.createElement('canvas');
    this.residueCtx = this.residueCanvas.getContext('2d')!;
    this.w = canvas.width;
    this.h = canvas.height;
    this.residueCanvas.width = this.w;
    this.residueCanvas.height = this.h;
    this.initEntities();
    this.lastSnapshotTime = Date.now();
  }

  resize(w: number, h: number): void {
    const sx = w / (this.w || w);
    const sy = h / (this.h || h);
    this.w = w;
    this.h = h;
    this.residueCanvas.width = w;
    this.residueCanvas.height = h;

    if (sx !== 1 || sy !== 1) {
      this.particles.forEach(p => { p.x *= sx; p.y *= sy; });
      this.clouds.forEach(c => { c.x *= sx; c.y *= sy; });
      this.raindrops.forEach(r => { r.x *= sx; r.y *= sy; });
    }
  }

  // DPR needed to scale all geometry — call once from Canvas after init
  setDPR(dpr: number): void {
    this.dpr = dpr;
    if (dpr !== 1) {
      // Re-scale entities spawned before DPR was known
      this.particles.forEach(p => { p.size *= dpr; p.speed *= dpr; });
      this.raindrops.forEach(r => { r.length *= dpr; r.thickness *= dpr; r.speed *= dpr; });
      this.clouds.forEach(c => {
        c.turbulence *= dpr;
        c.speed *= dpr;
        c.width *= dpr;
        c.height *= dpr;
        c.ellipses.forEach(e => { e.dx *= dpr; e.dy *= dpr; e.rx *= dpr; e.ry *= dpr; });
      });
    }
  }

  private initEntities(): void {
    this.clouds = [];
    // 8 clouds: 5 spread on screen for entrance, 3 arriving from right
    for (let i = 0; i < 8; i++) {
      const c = this.spawnCloud(i >= 5);
      if (i < 5) {
        c.x = Math.random() * this.w;
        c.y = Math.random() * this.h * 0.60;
      }
      this.clouds.push(c);
    }
    this.particles = Array.from({ length: 150 }, () => this.spawnParticle());
    this.raindrops = [];
  }

  private spawnCloud(fromRight = true): Cloud {
    // width/height in CSS px — multiply by dpr for canvas coords
    const bw = (200 + Math.random() * 500) * this.dpr;
    const bh = (60 + Math.random() * 100) * this.dpr;
    const n = 5 + Math.floor(Math.random() * 3); // 5–7 ellipses

    const ellipses: CloudEllipse[] = Array.from({ length: n }, () => ({
      dx: (Math.random() - 0.3) * bw * 0.65,
      dy: (Math.random() - 0.65) * bh * 0.85,
      rx: bw * (0.15 + Math.random() * 0.35),
      ry: bh * (0.30 + Math.random() * 0.45),
      opacity: 0.5 + Math.random() * 0.5,
    }));

    return {
      x: fromRight ? this.w + bw * 0.5 + Math.random() * 500 * this.dpr : Math.random() * this.w,
      y: Math.random() * this.h * 0.60,
      width: bw,
      height: bh,
      speed: (0.08 + Math.random() * 0.25) * this.dpr,
      opacity: 0.3 + Math.random() * 0.4,  // 0.3–0.7
      turbulence: (3 + Math.random() * 8) * this.dpr,
      wobbleOffset: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.00018 + Math.random() * 0.00025,
      ellipses,
    };
  }

  private spawnParticle(): Particle {
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      speed: (2 + Math.random() * 3) * this.dpr,      // 2–5 CSS px/frame
      opacity: 0.4 + Math.random() * 0.3,              // 0.4–0.7
      size: (1.5 + Math.random() * 1.5) * this.dpr,   // 1.5–3 CSS px
    };
  }

  private spawnRaindrop(): Raindrop {
    return {
      x: Math.random() * this.w * 1.3 - this.w * 0.15,
      y: Math.random() * -80 * this.dpr,
      length: (15 + Math.random() * 20) * this.dpr,   // 15–35 CSS px
      speed: (8 + Math.random() * 10) * this.dpr,      // 8–18 CSS px/frame
      angle: this.rainAngle,
      opacity: 0.6 + Math.random() * 0.3,              // 0.6–0.9
      thickness: (1.0 + Math.random() * 1.5) * this.dpr, // 1–2.5 CSS px
    };
  }

  // Called from React on every keydown
  update(signals: TypingSignals): void {
    this.signals = signals;
    if (signals.hasStarted && !this.hasEverTyped) {
      this.hasEverTyped = true;
    }
    this.computeTargets(signals);
  }

  // Called from page.tsx on recentDeletionBurst edge (synced with thunder)
  triggerLightning(): void {
    this.lightningFlash = 0.15;
    this.lightning2Timer = 5; // ~83ms at 60fps before secondary flash
  }

  triggerSave(): void {
    this.saveEffectTimer = 120;
  }

  captureDataURL(): string {
    return this.canvas.toDataURL('image/png');
  }

  private computeTargets(s: TypingSignals): void {
    // ── Sky base tones ──
    if (s.intensity > 0.7) {
      this.skyTopRT = 4;  this.skyTopGT = 4;  this.skyTopBT = 14;
      this.skyBotRT = 10; this.skyBotGT = 14; this.skyBotBT = 38;
    } else if (s.deletionRate > 0.25) {
      const dr = clamp(s.deletionRate * 3, 0, 1);
      this.skyTopRT = lerp(8, 18, dr); this.skyTopGT = lerp(8, 4, dr);  this.skyTopBT = lerp(8, 5, dr);
      this.skyBotRT = lerp(26, 34, dr); this.skyBotGT = lerp(26, 12, dr); this.skyBotBT = lerp(46, 18, dr);
    } else if (s.flowMoments > 3 && s.deletionRate < 0.05) {
      this.skyTopRT = 8;  this.skyTopGT = 8;  this.skyTopBT = 15;
      this.skyBotRT = 20; this.skyBotGT = 23; this.skyBotBT = 44;
    } else {
      this.skyTopRT = 8;  this.skyTopGT = 8;  this.skyTopBT = 8;
      this.skyBotRT = 26; this.skyBotGT = 26; this.skyBotBT = 46;
    }

    // ── Sky overlays (dramatic shifts) ──
    this.deletionCrimsonT = clamp(s.deletionRate * 3, 0, 1);
    this.flowAmberT = (s.flowMoments > 3 && s.deletionRate < 0.05) ? 0.8 : 0;

    // ── Cloud darkness & count ──
    this.cloudDarkT = clamp(s.deletionRate * 2.5, 0, 1);
    const targetCloudCount = s.avgPause > 2000 ? 10 : s.intensity > 0.6 ? 6 : 8;
    while (this.clouds.length < targetCloudCount) this.clouds.push(this.spawnCloud(true));

    // ── Rain: 80 minimum once typing starts, 200 on burst ──
    if (s.recentDeletionBurst) {
      this.targetRainCount = 200;
    } else if (s.deletionRate > 0.08) {
      this.targetRainCount = clamp(80 + Math.floor(s.deletionRate * 300), 80, 180);
    } else if (s.hasStarted) {
      this.targetRainCount = 80;
    } else {
      this.targetRainCount = 0;
    }

    // Rain near-white on burst
    this.rainBurstWhiteT = s.recentDeletionBurst ? 0.9 : 0;

    // ── Rain angle from pauseVariance ──
    this.rainAngleT = clamp(s.pauseVariance / 650, -0.45, 0.45);

    // ── Fog ──
    if (s.flowMoments > 3 && s.deletionRate < 0.05) {
      this.fogHeightT = 0.12;
    } else if (s.calmScore > 0.7) {
      this.fogHeightT = 0.40;
    } else {
      this.fogHeightT = 0.35;
    }

    // ── Atmosphere glow — more visible ──
    this.atmGlowT = (s.flowMoments > 3 && s.deletionRate < 0.05) ? 0.15 : 0;

    // ── Particles: 150 minimum — "even in stillness there is air" ──
    if (s.burstSpeed > 80) {
      this.targetParticleCount = clamp(150 + (s.burstSpeed - 80) * 2, 150, 300);
    } else {
      this.targetParticleCount = 150 + Math.floor(s.intensity * 80);
    }
  }

  // ── Main rAF render call ─────────────────────────────

  render(): void {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;

    this.time++;

    // Canvas fade in over ~90 frames (1.5s)
    if (this.canvasOpacity < 1) {
      this.canvasOpacity = Math.min(1, this.canvasOpacity + 1 / 90);
    }

    this.lerpState();
    this.handlePostPause();
    this.updateClouds();
    this.updateRain();
    this.updateParticles();

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = this.canvasOpacity;

    // Residue (memory) layer
    if (this.hasEverTyped) {
      ctx.save();
      ctx.globalAlpha = 0.03 * this.canvasOpacity;
      ctx.drawImage(this.residueCanvas, 0, 0);
      ctx.restore();
    }

    this.drawSky(ctx, w, h);
    this.drawClouds(ctx, w, h);
    this.drawRain(ctx, w, h);
    this.drawParticles(ctx, w, h);
    this.drawFog(ctx, w, h);

    if (this.atmGlow > 0.003) this.drawAtmGlow(ctx, w, h);

    // Double lightning flash
    if (this.lightningFlash > 0.001) {
      ctx.fillStyle = `rgba(255,255,255,${this.lightningFlash})`;
      ctx.fillRect(0, 0, w, h);
      this.lightningFlash *= 0.72;
    }
    if (this.lightning2Timer > 0) {
      this.lightning2Timer--;
      if (this.lightning2Timer === 0) this.lightning2Flash = 0.08;
    }
    if (this.lightning2Flash > 0.001) {
      ctx.fillStyle = `rgba(255,255,255,${this.lightning2Flash})`;
      ctx.fillRect(0, 0, w, h);
      this.lightning2Flash *= 0.72;
    }

    this.drawBeginText(ctx, w, h);

    // Save effect — subtle darkening
    if (this.saveEffectTimer > 0) {
      const t = Math.min(1, (120 - this.saveEffectTimer) / 25);
      ctx.fillStyle = `rgba(0,0,0,${t * 0.15})`;
      ctx.fillRect(0, 0, w, h);
      this.saveEffectTimer--;
    }

    ctx.restore();

    // Residue snapshot every 10 seconds
    const now = Date.now();
    if (this.hasEverTyped && now - this.lastSnapshotTime > 10000) {
      this.takeSnapshot();
      this.lastSnapshotTime = now;
    }
  }

  private lerpState(): void {
    const f = 0.03;
    this.skyTopR = lerp(this.skyTopR, this.skyTopRT, f);
    this.skyTopG = lerp(this.skyTopG, this.skyTopGT, f);
    this.skyTopB = lerp(this.skyTopB, this.skyTopBT, f);
    this.skyBotR = lerp(this.skyBotR, this.skyBotRT, f);
    this.skyBotG = lerp(this.skyBotG, this.skyBotGT, f);
    this.skyBotB = lerp(this.skyBotB, this.skyBotBT, f);

    this.rainAngle    = lerp(this.rainAngle,    this.rainAngleT,    0.02);
    this.fogHeight    = lerp(this.fogHeight,    this.fogHeightT,    0.007);
    this.atmGlow      = lerp(this.atmGlow,      this.atmGlowT,      0.018);
    this.cloudDark    = lerp(this.cloudDark,    this.cloudDarkT,    0.025);

    this.deletionCrimson = lerp(this.deletionCrimson, this.deletionCrimsonT, 0.025);
    this.flowAmber       = lerp(this.flowAmber,       this.flowAmberT,       0.015);
    this.rainBurstWhite  = lerp(this.rainBurstWhite,  this.rainBurstWhiteT,  0.06);

    this.currentRainCount     = lerp(this.currentRainCount,     this.targetRainCount,     0.05);
    this.currentParticleCount = lerp(this.currentParticleCount, this.targetParticleCount, 0.025);
  }

  private handlePostPause(): void {
    if (!this.signals?.hasStarted) return;
    const elapsed = Date.now() - this.signals.lastKeyTime;
    if (elapsed > 5000) {
      const calm = Math.min(1, (elapsed - 5000) / 15000);
      this.targetRainCount     = lerp(this.targetRainCount,     80,   calm * 0.008);
      this.targetParticleCount = lerp(this.targetParticleCount, 150,  calm * 0.008);
      this.fogHeightT          = lerp(this.fogHeightT,          0.35, calm * 0.008);
      this.atmGlowT            = lerp(this.atmGlowT,            0,    calm * 0.02);
      this.deletionCrimsonT    = lerp(this.deletionCrimsonT,    0,    calm * 0.015);
    }
  }

  private updateClouds(): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.x -= c.speed;
      if (c.x < -(c.width + 40)) {
        if (this.clouds.length > 6) {
          this.clouds.splice(i, 1);
        } else {
          c.x = this.w + c.width * 0.5 + Math.random() * 300 * this.dpr;
          c.y = Math.random() * this.h * 0.60;
        }
      }
    }
  }

  private updateRain(): void {
    const target = Math.round(this.currentRainCount);

    while (this.raindrops.length < target) this.raindrops.push(this.spawnRaindrop());
    while (this.raindrops.length > target) {
      this.raindrops.splice(Math.floor(Math.random() * this.raindrops.length), 1);
    }

    for (const d of this.raindrops) {
      d.angle = lerp(d.angle, this.rainAngle, 0.04);
      d.x += Math.sin(d.angle) * d.speed;
      d.y += Math.cos(d.angle) * d.speed;
      if (d.y > this.h + d.length) {
        d.y = Math.random() * -80 * this.dpr;
        d.x = Math.random() * this.w * 1.3 - this.w * 0.15;
      }
    }
  }

  private updateParticles(): void {
    const target = Math.round(this.currentParticleCount);

    while (this.particles.length < target) this.particles.push(this.spawnParticle());
    while (this.particles.length > target) this.particles.pop();

    const goLeft = (this.signals?.deletionRate ?? 0) > 0.5;
    for (const p of this.particles) {
      if (goLeft) {
        p.x -= p.speed;
        if (p.x < -3) { p.x = this.w + 3; p.y = Math.random() * this.h; }
      } else {
        p.x += p.speed;
        if (p.x > this.w + 3) { p.x = -3; p.y = Math.random() * this.h; }
      }
    }
  }

  // ── Draw layers ──────────────────────────────────────

  private drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Base gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const tr = Math.round(this.skyTopR), tg = Math.round(this.skyTopG), tb = Math.round(this.skyTopB);
    const br = Math.round(this.skyBotR), bg = Math.round(this.skyBotG), bb = Math.round(this.skyBotB);
    grad.addColorStop(0, `rgb(${tr},${tg},${tb})`);
    grad.addColorStop(1, `rgb(${br},${bg},${bb})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Crimson deletion overlay — bleeds in dramatically
    if (this.deletionCrimson > 0.02) {
      const cg = ctx.createLinearGradient(0, 0, 0, h);
      cg.addColorStop(0,   `rgba(80,20,20,0)`);
      cg.addColorStop(0.4, `rgba(80,20,20,${this.deletionCrimson * 0.3})`);
      cg.addColorStop(1,   `rgba(80,20,20,${this.deletionCrimson * 0.6})`);
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, w, h);
    }

    // Amber flow glow at bottom — real warmth when earned
    if (this.flowAmber > 0.02) {
      const ag = ctx.createLinearGradient(0, h * 0.5, 0, h);
      ag.addColorStop(0, 'rgba(0,0,0,0)');
      ag.addColorStop(1, `rgba(200,140,40,${this.flowAmber * 0.5})`);
      ctx.fillStyle = ag;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);
    }
  }

  private drawClouds(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.filter = `blur(${Math.round(20 * this.dpr)}px)`;

    // Cloud color: bright blue-white → storm gray based on deletionRate
    const dr = this.cloudDark;
    const cr = Math.round(lerp(195, 100, dr));
    const cg = Math.round(lerp(215, 130, dr));
    const cb = Math.round(lerp(255, 170, dr));

    for (const cloud of this.clouds) {
      const wobY =
        Math.sin(this.time * cloud.wobbleSpeed + cloud.wobbleOffset) * cloud.turbulence;

      for (const e of cloud.ellipses) {
        ctx.globalAlpha = cloud.opacity * e.opacity;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.beginPath();
        ctx.ellipse(
          cloud.x + e.dx,
          cloud.y + e.dy + wobY,
          e.rx,
          e.ry,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawRain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.raindrops.length === 0) return;
    ctx.save();

    // Interpolate from rain-blue to near-white during deletion burst
    const rbw = this.rainBurstWhite;
    const rr = Math.round(lerp(126, 225, rbw));
    const rg = Math.round(lerp(184, 225, rbw));
    const rb = Math.round(lerp(247, 240, rbw));
    ctx.strokeStyle = `rgb(${rr},${rg},${rb})`;

    for (const d of this.raindrops) {
      ctx.globalAlpha = d.opacity;
      ctx.lineWidth = d.thickness;
      const dx = Math.sin(d.angle) * d.length;
      const dy = Math.cos(d.angle) * d.length;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + dx, d.y + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.fillStyle = '#E8E8F0';
    for (const p of this.particles) {
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFog(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const fogH = this.fogHeight * h;
    if (fogH < 4) return;

    // Solid base gradient — clear visible horizon line
    const baseGrad = ctx.createLinearGradient(0, h - fogH, 0, h);
    baseGrad.addColorStop(0,    'rgba(26,26,46,0)');
    baseGrad.addColorStop(0.35, `rgba(26,26,46,${clamp(this.fogHeight * 1.5, 0, 0.5)})`);
    baseGrad.addColorStop(0.70, `rgba(30,30,55,${clamp(this.fogHeight * 2.2, 0, 0.75)})`);
    baseGrad.addColorStop(1.0,  'rgba(26,26,46,0.90)');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, h - fogH, w, fogH);

    // Animated wispy strips across the fog band
    const strips = 7;
    for (let i = 0; i < strips; i++) {
      const progress = i / (strips - 1);
      const yBase = h - fogH + fogH * progress * 0.6;
      const yOff = Math.sin(this.time * 0.003 + i * 1.2) * 14 * this.dpr;
      const alpha = (1 - progress) * 0.28;
      const sh = (fogH / strips) * 2.2;

      const sg = ctx.createLinearGradient(0, yBase + yOff - sh * 0.4, 0, yBase + yOff + sh * 0.6);
      sg.addColorStop(0,   'rgba(40,42,70,0)');
      sg.addColorStop(0.5, `rgba(40,42,70,${alpha})`);
      sg.addColorStop(1,   'rgba(40,42,70,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, yBase + yOff - sh * 0.4, w, sh);
    }
  }

  private drawAtmGlow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const r = Math.min(w, h) * 0.68;
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
    grad.addColorStop(0, `rgba(126,184,247,${this.atmGlow})`);
    grad.addColorStop(1, 'rgba(126,184,247,0)');
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  private drawBeginText(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.beginPulsePhase += 0.011;
    const targetOpacity = this.hasEverTyped
      ? 0
      : 0.15 + Math.sin(this.beginPulsePhase) * 0.1;

    this.beginOpacity = lerp(this.beginOpacity, targetOpacity, this.hasEverTyped ? 0.06 : 0.007);
    if (this.beginOpacity < 0.004) return;

    ctx.save();
    ctx.globalAlpha = this.beginOpacity;
    ctx.fillStyle = '#E8E8F0';
    ctx.font = `${Math.round(13 * this.dpr)}px "Fragment Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('begin.', w / 2, h / 2);
    ctx.restore();
  }

  private takeSnapshot(): void {
    this.residueCtx.save();
    this.residueCtx.globalAlpha = 0.18;
    this.residueCtx.drawImage(this.canvas, 0, 0);
    this.residueCtx.restore();
  }
}
