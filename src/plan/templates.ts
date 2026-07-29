import type { GoalDistance, SessionType } from '../types'

/**
 * Base templates, expressed as *relative* weekly shapes rather than fixed
 * mileage tables. The engine scales them to the runner's baseline, available
 * days and calculated pace zones, so the same template serves a 25 km/week
 * runner and a 70 km/week runner without either getting someone else's plan.
 */

export interface GoalSpec {
  key: GoalDistance
  label: string
  raceDistanceKm?: number
  /** Sensible plan length when the runner has not named a date. */
  defaultWeeks: number
  minWeeks: number
  /** Long run at peak, as a fraction of the race distance. */
  peakLongRunFraction: number
  /** Starting weekly volume as a multiple of the race distance. */
  startVolumeFactor: number
  peakVolumeFactor: number
}

export const GOALS: Record<GoalDistance, GoalSpec> = {
  '5k': {
    key: '5k',
    label: '5K',
    raceDistanceKm: 5,
    defaultWeeks: 8,
    minWeeks: 4,
    peakLongRunFraction: 1.6,
    startVolumeFactor: 2.4,
    peakVolumeFactor: 5,
  },
  '10k': {
    key: '10k',
    label: '10K',
    raceDistanceKm: 10,
    defaultWeeks: 10,
    minWeeks: 6,
    peakLongRunFraction: 1.3,
    startVolumeFactor: 2,
    peakVolumeFactor: 4,
  },
  half: {
    key: 'half',
    label: 'Half marathon',
    raceDistanceKm: 21.0975,
    defaultWeeks: 12,
    minWeeks: 8,
    peakLongRunFraction: 0.95,
    startVolumeFactor: 1.4,
    peakVolumeFactor: 2.6,
  },
  marathon: {
    key: 'marathon',
    label: 'Marathon',
    raceDistanceKm: 42.195,
    defaultWeeks: 16,
    minWeeks: 12,
    peakLongRunFraction: 0.78,
    startVolumeFactor: 0.9,
    peakVolumeFactor: 1.7,
  },
  ultra: {
    key: 'ultra',
    label: 'Ultra',
    raceDistanceKm: 50,
    defaultWeeks: 20,
    minWeeks: 14,
    peakLongRunFraction: 0.7,
    startVolumeFactor: 0.9,
    peakVolumeFactor: 1.8,
  },
  custom: {
    key: 'custom',
    label: 'Custom distance',
    defaultWeeks: 12,
    minWeeks: 6,
    peakLongRunFraction: 1.1,
    startVolumeFactor: 1.6,
    peakVolumeFactor: 3.2,
  },
  habit: {
    key: 'habit',
    label: 'Build a running habit',
    defaultWeeks: 8,
    minWeeks: 4,
    peakLongRunFraction: 1,
    startVolumeFactor: 1,
    peakVolumeFactor: 2,
  },
}

/**
 * Which session types fill a week at a given number of training days.
 *
 * Ordering matters: the long run and the rest days are placed first, quality
 * work only lands once there is room for it, and no week is ever built without
 * at least one full rest day.
 */
export interface WeekShape {
  longRun: boolean
  easyRuns: number
  quality: number
  crossTrain: number
  restDays: number
  strength: number
}

export function weekShapeFor(
  daysPerWeek: number,
  allowQuality: boolean,
  beginner: boolean,
): WeekShape {
  const days = Math.max(2, Math.min(7, daysPerWeek))

  if (beginner) {
    // Beginners get more rest, no quality work, and run-walk sessions only.
    const runs = Math.min(days, 4)
    return {
      longRun: runs >= 3,
      easyRuns: runs >= 3 ? runs - 1 : runs,
      quality: 0,
      crossTrain: 0,
      restDays: 7 - runs,
      strength: 2,
    }
  }

  const quality = allowQuality ? (days >= 5 ? 1 : days >= 4 ? 1 : 0) : 0
  const easyRuns = Math.max(1, days - 1 - quality)
  return {
    longRun: true,
    easyRuns,
    quality,
    crossTrain: 0,
    // At least one true rest day, always.
    restDays: Math.max(1, 7 - days),
    strength: 2,
  }
}

/** Weekly volume share per session type, used to divide the week's kilometres. */
export const VOLUME_SHARES: Partial<Record<SessionType, number>> = {
  long_run: 0.32,
  easy_run: 0.18,
  tempo: 0.14,
  intervals: 0.12,
}

export function goalDistanceKm(goal: GoalDistance, customKm?: number): number {
  if (goal === 'custom') return customKm ?? 10
  if (goal === 'habit') return 5
  return GOALS[goal].raceDistanceKm ?? 10
}
