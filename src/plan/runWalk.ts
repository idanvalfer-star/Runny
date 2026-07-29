import type { FitnessBaseline } from '../types'

/**
 * Galloway-style run-walk-run progression.
 *
 * Walk breaks are the method, not a concession. Taken deliberately and *before*
 * the runner is gassed, they measurably reduce impact load and dropout compared
 * with continuous-running-only plans — particularly for new, older or heavier
 * runners.
 */

export interface RunWalkRatio {
  runSec: number
  walkSec: number
  label: string
}

/** Ordered easiest to hardest. Progression walks this ladder one rung at a time. */
export const RUN_WALK_LADDER: RunWalkRatio[] = [
  { runSec: 15, walkSec: 90, label: '15s run / 90s walk' },
  { runSec: 20, walkSec: 90, label: '20s run / 90s walk' },
  { runSec: 30, walkSec: 90, label: '30s run / 90s walk' },
  { runSec: 30, walkSec: 60, label: '30s run / 60s walk' },
  { runSec: 60, walkSec: 60, label: '1min run / 1min walk' },
  { runSec: 90, walkSec: 60, label: '90s run / 1min walk' },
  { runSec: 120, walkSec: 60, label: '2min run / 1min walk' },
  { runSec: 180, walkSec: 60, label: '3min run / 1min walk' },
  { runSec: 180, walkSec: 30, label: '3min run / 30s walk' },
  { runSec: 300, walkSec: 60, label: '5min run / 1min walk' },
  { runSec: 480, walkSec: 60, label: '8min run / 1min walk' },
  { runSec: 600, walkSec: 30, label: '10min run / 30s walk' },
]

/**
 * Where on the ladder to begin. Anyone over 40, carrying joint history, or
 * coming back from a long break starts one notch more conservative.
 */
export function startingLadderIndex(
  baseline: FitnessBaseline,
  age: number,
  clearedForIntensePlan: boolean,
): number {
  let index = 2 // the standard 30s/90s starting point

  const jointHistory = baseline.injuryHistory.some(
    (i) => i !== 'none' && i !== 'other',
  )
  if (age > 40) index -= 1
  if (jointHistory) index -= 1
  if (baseline.returningFromBreak) index -= 1
  if (!clearedForIntensePlan) index -= 1

  if (baseline.currentAbility === 'run_2k_to_5k') index += 3
  if (baseline.currentAbility === 'run_5k_to_10k') index += 5

  return Math.max(0, Math.min(RUN_WALK_LADDER.length - 1, index))
}

/** Hold each ratio for this many weeks before advancing a rung. */
export const WEEKS_PER_RATIO = 2

/**
 * Ladder index for a given week.
 *
 * Two rules matter here. Each ratio is held 2-3 weeks rather than advanced on a
 * weekly calendar, and the session count is *not* increased in the same week
 * the run segment grows — doing both at once is the classic way beginners end
 * up injured in week 4.
 */
export function ladderIndexForWeek(
  startIndex: number,
  weekNumber: number,
  holdWeeks = WEEKS_PER_RATIO,
): number {
  const advanced = Math.floor((weekNumber - 1) / holdWeeks)
  return Math.min(RUN_WALK_LADDER.length - 1, startIndex + advanced)
}

export function ratioForWeek(startIndex: number, weekNumber: number): RunWalkRatio {
  return RUN_WALK_LADDER[ladderIndexForWeek(startIndex, weekNumber)]
}

/**
 * Repeats needed to fill a target session duration. Beginner sessions run
 * 20-30 minutes; that is the dose, and the ratio is what changes over time.
 */
export function repeatsForDuration(
  ratio: RunWalkRatio,
  targetMinutes: number,
): number {
  const cycleSec = ratio.runSec + ratio.walkSec
  return Math.max(1, Math.round((targetMinutes * 60) / cycleSec))
}

export function describeRunWalk(ratio: RunWalkRatio, repeats: number): string {
  return `${ratio.label} × ${repeats}`
}

/**
 * True once the ratio has grown long enough that continuous running is the
 * natural next step. For a 5K goal this typically lands around weeks 5-6 — but
 * it is driven by where the runner actually is, not by the calendar.
 */
export function readyForContinuous(ratio: RunWalkRatio): boolean {
  return ratio.runSec >= 480
}
