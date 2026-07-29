# Runny

A mobile-first PWA for tracking runs and walks, and for generating training
plans from published coaching science that then adapt to how your weeks
actually go.

Everything is local-first: IndexedDB is the source of truth, nothing is
uploaded, and the app is fully usable offline — including mid-run with no
signal.

## Running it

```bash
npm install
npm run dev            # dev server
npm run dev -- --sim   # see "Simulated GPS" below
npm run build          # typecheck + production build
npm test               # unit tests (Vitest)
npm run e2e            # browser tests (Playwright)
```

### Simulated GPS

There is no GPS receiver in a desktop browser, so `/track?sim=1` replays a
synthetic track through the same code path as `watchPosition`, including
periodic outliers to exercise the noise filter. It is dev-only and compiled out
of production builds.

## How it works

### Tracking

- `watchPosition` at high accuracy, with distance by haversine.
- Fixes are rejected when accuracy is worse than 30 m, when they arrive under a
  second apart, or when the implied speed is impossible (>40 km/h running,
  >15 km/h walking). Rejections are counted and surfaced, not hidden.
- Elevation ignores changes under 3 m, since consumer altimetry drifts
  constantly and summing raw deltas invents hundreds of metres of climb.
- Auto-pause after 10 s stationary; a screen wake lock is held while tracking
  and re-acquired when the tab returns to the foreground.
- In-progress sessions are written to IndexedDB every 5 s, so a crash or reload
  offers to resume rather than losing the run.

### Analysis

- Calories use the ACSM metabolic equations rather than a flat rate per km, so
  pace, gradient and body weight all move the number.
- Heart rate comes from a standard BLE monitor over Web Bluetooth
  (service `0x180D`), with bounded-backoff reconnect. Where Web Bluetooth is
  missing — iOS Safari — manual entry and GPX/TCX/CSV import stand in.
- Personal bests are detected as the fastest *rolling* window at each distance,
  so a quick 5K buried inside a 10K still counts. Both window edges are
  interpolated.

### Training plans

The plan engine is deterministic — no LLM, no API key, no ongoing cost. It is
built on:

- **Daniels' VDOT** (`src/plan/vdot.ts`) for real training paces from a recent
  race or time trial. Without one, week 1 schedules a low-pressure time trial
  rather than leaving paces undefined.
- **Galloway run-walk** (`src/plan/runWalk.ts`) for anyone not yet running
  continuously — a ratio ladder held 2-3 weeks per rung, starting a notch
  easier for runners over 40, with joint history, or returning from a break.
- **Single-session progression cap** (`src/plan/progression.ts`). The classic
  "10% weekly mileage" rule has held up poorly; spikes in a single session
  relative to the longest of the past 30 days are the stronger injury signal,
  so that is the primary guardrail and weekly volume is secondary.
- **Step-back weeks** every fourth week, and **tapers** scaled by race distance
  that cut volume while keeping some intensity.

### Safety guardrails

These are hard rules in the engine, not suggestions:

- A PAR-Q screen runs before anything else. Any yes answer sets
  `clearedForIntensePlan: false`, which routes to a conservative walking-based
  plan with no quality sessions regardless of the stated goal.
- Every week has at least one full rest day, more for beginners.
- No session may exceed 110% of the longest session in the previous 30 days —
  including sessions the user edits by hand.
- Step-back weeks cannot be skipped.
- **Any reported pain halts progression outright**, swapping upcoming running
  for rest and cross-training and recommending a physio or doctor. It is
  evaluated before every other branch, so it can never be outweighed by an
  otherwise good week.

Runny gives fitness guidance based on published training research. It is not
medical advice and does not replace a coach or physician.

### The "why?" layer

Every coaching decision carries a `RuleId`, and `src/plan/whyMap.ts` maps those
to plain-language explanations. The UI looks copy up by rule rather than
embedding it in the plan renderer, so the reasoning always matches the decision
that produced it and the tone can be edited in one file.

## Layout

```
src/
  types/       the data model
  db/          Dexie schema and repository helpers (all IndexedDB access)
  lib/         geo, pace, calories, HR zones, splits, personal bests, units
  tracking/    GPS tracker, heart rate, wake lock, simulated feed
  plan/        VDOT, templates, progression, run-walk, adaptation, whyMap
  components/  shared UI
  screens/     routed screens
e2e/           Playwright browser tests
```

`lib/` and `plan/` are pure functions with no React and no IndexedDB imports,
which is what makes the guardrails directly testable — and where nearly all the
correctness risk lives.
