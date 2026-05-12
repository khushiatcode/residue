# Residue

Residue turns how you type into weather.

Not what you type. How. The pauses between words, the corrections you make, the moments when thought outpaces doubt, all of it becomes atmosphere. Rain. Clouds. Wind. A sky that shifts as you write.

Live: https://residue-iota.vercel.app

---

## What it captures

Every keypress is an event. From those events, Residue derives:

- **Rhythm** — how metronomic or erratic your intervals are
- **Deletion rate** — how often you backspace, how much you fight yourself
- **Intensity** — a composite of speed, rhythm, and corrections
- **Burst speed** — your fastest sustained output in the session
- **Hesitation count** — pauses longer than 1.5 seconds
- **Flow moments** — times you exceeded 80 wpm with fewer than 5% deletions

These signals update on every keystroke. The canvas responds in real time.

---

## What it generates

A generative weather system rendered on an HTML5 Canvas:

- **Sky gradient** — shifts from neutral dark to crimson (high deletions) or warm amber (flow state)
- **Cloud system** — 5–7 ellipses per cloud, opacity and speed driven by your pause patterns
- **Rain** — line density and angle mapped to deletion rate and rhythm variance
- **Wind particles** — 150+ dots moving with your intensity, reversing direction when deletions dominate
- **Ground fog** — always present, rising or clearing with your calm score
- **Atmosphere glow** — a faint radial light that only appears during genuine flow states

Every 10 seconds, the current canvas is blended into a memory layer at 18% opacity. The longer you write, the richer the accumulated residue beneath the live weather. This is what you download.

The analysis view shows the session as data: a timeline of four signals, a fingerprint radar across five axes, micro-moment cards for peak speed, longest pause, and flow state entry — and a one-sentence reading derived from the pattern, not from an API.

---

## Why it's interesting

No AI. No server calls. No external APIs of any kind.

The weather is a pure function of your keystrokes. The audio, filtered white noise rain, procedural thunder, a barely-audible flow tone at 220/330/440 Hz — is synthesized live in the Web Audio API. The composite export (1800×900 image with session data) is built on an offscreen canvas in the browser.

Same words typed differently produce different weather. The system has no memory of your intent, only your behavior.

---

## Tech

- Next.js 14, TypeScript
- HTML5 Canvas 2D API (all rendering)
- Web Audio API (all sound, zero audio files)
- No UI component libraries
- No AI APIs
- No external rendering dependencies

---

## Every session is unrepeatable

The canvas accumulates. Each 10-second snapshot layers into a residue beneath the current weather at 3% opacity — a geological record of the session. The longer you write, the more history is embedded in the image.

When you save, you're not screenshotting the canvas. You're downloading a composite: the weather you made, alongside the session data that explains it. The timestamp, the signals, the reading. A self-portrait of that particular hour.

Open it at 11pm with something you've been avoiding. See what the sky does.

---

## Setup

```
npm install
npm run dev
```

Runs on http://localhost:3000.
