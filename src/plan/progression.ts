import type { GoalDistance, PlanPhase } from '../types'

/**
 * Progression and periodization rules.
 *
 * The headline rule here is deliberately *not* the classic "10% weekly mileage"
 * guidance. That rule has held up poorly: large cohort work found weekly
 * increases were a weak injury predictor, while sudden spikes in a single
 * session — above all the long run, measured against the longest run of the
 * past month — were the stronger signal. So the single-session cap is primary
 * and the weekly total is a softer secondary guardrail.
 */

export const SINGLE_SESSION_CAP = 1.1
/** Weekly volume is watched, but with more slack than any one session. */
export const WEEKLY_TOTAL_SOFT_CAP = 1.15

/**
 * Cap a proposed session against the longest session of the past 30 days.
 * Returns the allowed value and whether the cap actually bit.
 */
export function capSessionIncrease(
  proposedKm: number,
  longestRecentKm: number,
): { allowedKm: number; capped: boolean } {
  // With no history there is nothing to spike relative to.
  if (longestRecentKm <= 0) return { allowedKm: proposedKm, capped: false }
  const ceiling = longestRecentKm * SINGLE_SESSION_CAP
  if (proposedKm <= ceiling) return { allowedKm: proposedKm, capped: false }
  return { allowedKm: Math.round(ceiling * 10) / 10, capped: true }
}

/** Longest single session in the trailing 30 days. */
export function longestSessionInLast30Days(
  sessions: Array<{ date: number; distanceKm: number }>,
  now = Date.now(),
): number {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000
  return sessions
    .filter((s) => s.date >= cutoff && s.date <= now)
    .reduce((max, s) => Math.max(max, s.distanceKm), 0)
}

/**
 * Every 4th week steps back. This is not conditional on how the runner feels —
 * accumulated fatigue is invisible until it isn't, which is exactly why the
 * lighter week has to be scheduled rather than earned.
 */
export function isStepBackWeek(
  weekNumber: number,
  totalWeeks: number,
  taperStartWeek: number,
): boolean {
  // A taper is already a reduction; stacking a step-back inside it is noise.
  if (weekNumber >= taperStartWeek) return false
  // Never step back in week 1, and never right before the taper begins.
  if (weekNumber <= 1 || weekNumber >= totalWeeks) return false
  return weekNumber % 4 === 0
}

export const STEP_BACK_MULTIPLIER = 0.75

/**
 * Taper length by goal distance, in weeks.
 *
 * Taper meta-analyses converge on cutting volume while *keeping* some
 * intensity — dropping both blunts the benefit, which is why the multipliers
 * below only touch volume.
 */
export function taperWeeksFor(goal: GoalDistance): number {
  switch (goal) {
    case '5k':
    case '10k':
      return 1 // 5-7 days is enough at these distances
    case 'half':
      return 2
    case 'marathon':
    case 'ultra':
      return 3
    default:
      return 0
  }
}

/**
 * Fraction of peak volume for a given week of the taper (1 = final week).
 * The long run comes down first and hardest; see `taperLongRunMultiplier`.
 */
export function taperVolumeMultiplier(
  weeksToRace: number,
  goal: GoalDistance,
): number {
  const taper = taperWeeksFor(goal)
  if (weeksToRace > taper) return 1

  if (goal === '5k' || goal === '10k') {
    return weeksToRace <= 1 ? 0.6 : 1
  }
  if (goal === 'half') {
    return weeksToRace <= 1 ? 0.475 : 0.65
  }
  // Marathon and ultra: down to roughly 40-50% by race week.
  if (weeksToRace <= 1) return 0.42
  if (weeksToRace === 2) return 0.6
  return 0.75
}

/** The long run is cut more aggressively than everything else. */
export function taperLongRunMultiplier(
  weeksToRace: number,
  goal: GoalDistance,
): number {
  const taper = taperWeeksFor(goal)
  if (weeksToRace > taper) return 1
  if (goal === '5k' || goal === '10k') return weeksToRace <= 1 ? 0.5 : 1
  if (goal === 'half') return weeksToRace <= 1 ? 0.4 : 0.6
  // e.g. a 34 km peak long run becomes ~20 km, then ~11 km on race week.
  if (weeksToRace <= 1) return 0.32
  if (weeksToRace === 2) return 0.6
  return 0.8
}

export function phaseForWeek(
  weekNumber: number,
  totalWeeks: number,
  goal: GoalDistance,
  beginner: boolean,
): PlanPhase {
  const taper = taperWeeksFor(goal)
  const weeksToRace = totalWeeks - weekNumber + 1

  if (weeksToRace <= 1 && taper > 0) return 'race_week'
  if (weeksToRace <= taper) return 'taper'
  if (beginner) return 'beginner_runwalk'

  const buildStart = Math.ceil(totalWeeks * 0.3)
  const peakStart = Math.ceil(totalWeeks * 0.7)
  if (weekNumber >= peakStart) return 'peak'
  if (weekNumber >= buildStart) return 'build'
  return 'base'
}

/**
 * Quality work (tempo, intervals) is withheld until a few weeks of consistent
 * easy running exist to build on. Introducing it in week 1 is how people get
 * hurt in week 3.
 */
export function qualityAllowedFromWeek(totalWeeks: number, beginner: boolean): number {
  if (beginner) return Number.POSITIVE_INFINITY // never, within a beginner block
  return Math.max(4, Math.ceil(totalWeeks * 0.25))
}

/**
 * How much the plan grows each week before caps and step-backs apply.
 * Injury history and beginner status both slow this down.
 */
export function weeklyGrowthRate(opts: {
  beginner: boolean
  hasInjuryHistory: boolean
  clearedForIntensePlan: boolean
}): number {
  if (!opts.clearedForIntensePlan) return 1.03
  if (opts.beginner || opts.hasInjuryHistory) return 1.05
  return 1.08
}
