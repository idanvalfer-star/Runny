import type { PaceRange, PaceZones, TimeTrial } from '../types'

/**
 * Jack Daniels' VDOT system, via the Daniels/Gilbert equations.
 *
 * The point of this is to stop guessing. A single recent hard effort pins the
 * runner's current fitness, and every training pace falls out of it — which is
 * what keeps easy days genuinely easy instead of drifting into "moderate", the
 * mistake that quietly wrecks most training blocks.
 */

/** Oxygen cost of running at velocity `v` (metres per minute), in ml/kg/min. */
export function vo2AtVelocity(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v
}

/**
 * Fraction of VO2max sustainable for `minutes`. Effort you can hold for four
 * minutes is close to 100%; for three hours it is far lower.
 */
export function pctMaxForDuration(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  )
}

/** Invert `vo2AtVelocity` — the positive root of the quadratic. */
export function velocityForVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  const disc = b * b - 4 * a * c
  if (disc <= 0) return 0
  return (-b + Math.sqrt(disc)) / (2 * a)
}

/** VDOT from a race or all-out time trial. */
export function vdotFromPerformance(trial: TimeTrial): number | undefined {
  if (trial.distanceKm <= 0 || trial.timeSec <= 0) return undefined
  const minutes = trial.timeSec / 60
  const velocity = (trial.distanceKm * 1000) / minutes
  const vo2 = vo2AtVelocity(velocity)
  const pct = pctMaxForDuration(minutes)
  if (pct <= 0) return undefined
  const vdot = vo2 / pct
  if (!Number.isFinite(vdot) || vdot <= 0) return undefined
  // Outside this band the equations stop being meaningful for real runners.
  return Math.round(Math.min(85, Math.max(20, vdot)) * 10) / 10
}

/** Seconds per km at a given fraction of VDOT. */
function paceAtIntensity(vdot: number, fraction: number): number {
  const velocity = velocityForVo2(vdot * fraction)
  if (velocity <= 0) return 0
  // (1000 m / v m/min) minutes, expressed in seconds.
  return 60000 / velocity
}

function rangeFor(vdot: number, fastPct: number, slowPct: number): PaceRange {
  return {
    minSecPerKm: Math.round(paceAtIntensity(vdot, fastPct)),
    maxSecPerKm: Math.round(paceAtIntensity(vdot, slowPct)),
  }
}

/**
 * The five Daniels training zones.
 *
 * Easy is deliberately wide and deliberately slow — that band is where the
 * large majority of weekly volume belongs.
 */
export function paceZonesFromVdot(vdot: number): PaceZones {
  return {
    easy: rangeFor(vdot, 0.74, 0.59),
    marathon: rangeFor(vdot, 0.84, 0.75),
    threshold: rangeFor(vdot, 0.88, 0.83),
    interval: rangeFor(vdot, 1.0, 0.95),
    repetition: rangeFor(vdot, 1.1, 1.05),
  }
}

/** Predicted race time at a distance for a given VDOT, in seconds. */
export function predictRaceTimeSec(vdot: number, distanceKm: number): number {
  // %VO2max depends on duration, and duration depends on pace, so solve by
  // iterating from a rough guess — it converges in a handful of passes.
  let minutes = distanceKm * 5
  for (let i = 0; i < 30; i++) {
    const pct = pctMaxForDuration(minutes)
    const velocity = velocityForVo2(vdot * pct)
    if (velocity <= 0) break
    const next = (distanceKm * 1000) / velocity
    if (Math.abs(next - minutes) < 0.001) {
      minutes = next
      break
    }
    minutes = next
  }
  return minutes * 60
}

/**
 * The VDOT a goal implies. Used to tell a runner honestly whether their target
 * time is a stretch from where they are now.
 */
export function vdotForGoal(distanceKm: number, targetTimeSec: number): number | undefined {
  return vdotFromPerformance({ distanceKm, timeSec: targetTimeSec })
}

/**
 * Fallback zones for a runner with no time trial yet, derived from a rough
 * self-reported ability. Deliberately conservative: week 1 of the plan includes
 * a real time trial that replaces these.
 */
export function provisionalZones(ability: string): PaceZones {
  const assumedVdot =
    ability === 'run_10k_plus' ? 42 : ability === 'run_5k_to_10k' ? 36 : 30
  return paceZonesFromVdot(assumedVdot)
}
