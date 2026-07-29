import type {
  FitnessBaseline,
  GoalDistance,
  PaceZones,
  PlanGoal,
  PlanWeek,
  PlannedSession,
  RuleId,
  SafetyScreen,
  SessionType,
  TrainingPlan,
} from '../types'
import { newId } from '../db/repo'
import { addDays, startOfWeek, weeksBetween } from '../lib/dates'
import { GOALS, goalDistanceKm, weekShapeFor } from './templates'
import {
  capSessionIncrease,
  isStepBackWeek,
  phaseForWeek,
  qualityAllowedFromWeek,
  STEP_BACK_MULTIPLIER,
  taperLongRunMultiplier,
  taperVolumeMultiplier,
  taperWeeksFor,
  weeklyGrowthRate,
} from './progression'
import {
  describeRunWalk,
  ladderIndexForWeek,
  ratioForWeek,
  readyForContinuous,
  repeatsForDuration,
  startingLadderIndex,
  RUN_WALK_LADDER,
} from './runWalk'
import { paceZonesFromVdot, provisionalZones, vdotFromPerformance } from './vdot'
import { coachNoteFor } from './coachNotes'

export interface GeneratePlanInput {
  goal: {
    distance: GoalDistance
    customDistanceKm?: number
    targetTimeSec?: number
    targetDate?: number
    weeks?: number
  }
  baseline: FitnessBaseline
  safetyScreen: SafetyScreen
  age: number
  startDate?: number
}

/** A runner who cannot yet run continuously gets a run-walk block, full stop. */
export function isBeginner(baseline: FitnessBaseline): boolean {
  return baseline.currentAbility === 'cannot_run_2k'
}

/** Longest single run the stated ability implies, used to seed the cap. */
function abilityFloorKm(ability: FitnessBaseline['currentAbility']): number {
  switch (ability) {
    case 'run_10k_plus':
      return 10
    case 'run_5k_to_10k':
      return 6
    case 'run_2k_to_5k':
      return 3
    default:
      return 1
  }
}

function resolveWeeks(input: GeneratePlanInput, spec: { defaultWeeks: number; minWeeks: number }): number {
  if (input.goal.weeks) return Math.max(spec.minWeeks, Math.min(52, input.goal.weeks))
  if (input.goal.targetDate) {
    const weeks = weeksBetween(input.startDate ?? Date.now(), input.goal.targetDate)
    return Math.max(spec.minWeeks, Math.min(52, weeks))
  }
  return spec.defaultWeeks
}

/**
 * Establish pace zones. A recent hard effort gives real numbers; without one the
 * plan schedules a time trial in week 1 rather than leaving paces undefined.
 */
export function resolveZones(baseline: FitnessBaseline): {
  zones: PaceZones
  vdot?: number
  needsTimeTrial: boolean
} {
  const trial = baseline.recentRaceOrTimeTrial
  if (trial) {
    const vdot = vdotFromPerformance(trial)
    if (vdot) {
      return { zones: paceZonesFromVdot(vdot), vdot, needsTimeTrial: false }
    }
  }
  return {
    zones: provisionalZones(baseline.currentAbility),
    needsTimeTrial: true,
  }
}

/** Weekly volume before step-backs and taper, in km. */
function baseWeeklyVolume(
  weekNumber: number,
  totalWeeks: number,
  startKm: number,
  peakKm: number,
  growth: number,
): number {
  const peakWeek = Math.max(1, totalWeeks - 1)
  const grown = startKm * Math.pow(growth, weekNumber - 1)
  // Growth is geometric but must still land on the intended peak.
  const linear = startKm + ((peakKm - startKm) * (weekNumber - 1)) / peakWeek
  return Math.min(peakKm, Math.max(linear, Math.min(grown, peakKm)))
}

/** Place sessions across the week, honouring the preferred long-run day. */
function dayOrderFor(preferredLongDay: number, daysPerWeek: number): number[] {
  // Monday-first ordering, so index 0 is Monday.
  const all = [1, 2, 3, 4, 5, 6, 0]
  const longIdx = all.indexOf(preferredLongDay)
  const rest = all.filter((_, i) => i !== longIdx)
  // Spread training days out rather than clumping them together.
  const chosen: number[] = []
  const stride = Math.max(1, Math.floor(rest.length / Math.max(1, daysPerWeek - 1)))
  for (let i = 0; i < rest.length && chosen.length < daysPerWeek - 1; i += stride) {
    chosen.push(rest[i])
  }
  let i = 0
  while (chosen.length < daysPerWeek - 1 && i < rest.length) {
    if (!chosen.includes(rest[i])) chosen.push(rest[i])
    i++
  }
  return [preferredLongDay, ...chosen]
}

export function generatePlan(input: GeneratePlanInput): TrainingPlan {
  const { baseline, safetyScreen, age } = input
  const cleared = safetyScreen.clearedForIntensePlan
  const beginner = isBeginner(baseline) || !cleared
  const spec = GOALS[input.goal.distance]
  const totalWeeks = resolveWeeks(input, spec)
  const raceKm = goalDistanceKm(input.goal.distance, input.goal.customDistanceKm)
  const hasRaceDate = Boolean(input.goal.targetDate) && input.goal.distance !== 'habit'

  const { zones, needsTimeTrial } = resolveZones(baseline)
  const hasInjuryHistory = baseline.injuryHistory.some((i) => i !== 'none')
  const growth = weeklyGrowthRate({
    beginner,
    hasInjuryHistory,
    clearedForIntensePlan: cleared,
  })

  const startDate = startOfWeek(input.startDate ?? Date.now())
  const taperWeeks = hasRaceDate ? taperWeeksFor(input.goal.distance) : 0
  const taperStartWeek = totalWeeks - taperWeeks + 1
  const qualityFromWeek = qualityAllowedFromWeek(totalWeeks, beginner)

  // Volume envelope, scaled down when the safety screen flagged anything.
  const safetyScale = cleared ? 1 : 0.6
  const startKm = raceKm * spec.startVolumeFactor * safetyScale
  const peakKm = raceKm * spec.peakVolumeFactor * safetyScale
  const peakLongRunKm = raceKm * spec.peakLongRunFraction * safetyScale

  const ladderStart = startingLadderIndex(baseline, age, cleared)
  const daysPerWeek = Math.max(2, Math.min(7, baseline.daysPerWeek))

  const weeks: PlanWeek[] = []

  // The cap measures against the longest session of the past 30 days. At plan
  // start that history lives outside the plan, so it is seeded from what the
  // runner told us they can already do — otherwise an experienced runner gets
  // throttled to a beginner's first week.
  const scheduled: Array<{ date: number; distanceKm: number }> = []
  const seedKm = beginner
    ? 0
    : Math.max(
        startKm * 0.3,
        baseline.recentRaceOrTimeTrial?.distanceKm ?? 0,
        abilityFloorKm(baseline.currentAbility),
      )
  if (seedKm > 0) {
    scheduled.push({ date: addDays(startDate, -1), distanceKm: seedKm })
  }

  /** Cap a proposed session against everything scheduled in the prior 30 days. */
  const capAgainstHistory = (proposedKm: number, date: number) => {
    const cutoff = date - 30 * 86400000
    const longestRecentKm = scheduled
      .filter((s) => s.date >= cutoff && s.date < date)
      .reduce((max, s) => Math.max(max, s.distanceKm), 0)
    return capSessionIncrease(proposedKm, longestRecentKm)
  }

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber++) {
    const weeksToRace = totalWeeks - weekNumber + 1
    const stepBack = isStepBackWeek(weekNumber, totalWeeks, taperStartWeek)
    const phase = phaseForWeek(weekNumber, totalWeeks, input.goal.distance, beginner)
    const inTaper = hasRaceDate && weeksToRace <= taperWeeks

    let volumeKm = baseWeeklyVolume(weekNumber, totalWeeks, startKm, peakKm, growth)
    if (stepBack) volumeKm *= STEP_BACK_MULTIPLIER
    if (inTaper) {
      volumeKm *= taperVolumeMultiplier(weeksToRace, input.goal.distance)
    }

    const allowQuality = weekNumber >= qualityFromWeek && cleared && !beginner
    const shape = weekShapeFor(daysPerWeek, allowQuality, beginner)
    const days = dayOrderFor(baseline.preferredLongDay, daysPerWeek)
    const weekStart = addDays(startDate, (weekNumber - 1) * 7)

    const sessions: PlannedSession[] = []
    const weekRules: RuleId[] = []
    if (stepBack) weekRules.push('step_back_week')
    if (inTaper) weekRules.push('taper')
    if (!cleared) weekRules.push('safety_screen_flagged')

    // --- long run / main session ---------------------------------------
    let longRunKm = 0
    if (beginner) {
      const ratio = ratioForWeek(ladderStart, weekNumber)
      const targetMinutes = Math.min(
        45,
        20 + Math.floor((weekNumber - 1) / 2) * 3 * (stepBack ? 0 : 1),
      )
      const repeats = repeatsForDuration(ratio, targetMinutes)
      sessions.push(
        makeSession({
          date: dayDate(weekStart, days[0]),
          dayOfWeek: days[0],
          activityType: 'walk_run_intervals',
          targetDurationMin: targetMinutes,
          runWalkRatio: describeRunWalk(ratio, repeats),
          runWalkSegments: { runSec: ratio.runSec, walkSec: ratio.walkSec, repeats },
          zones,
          rules: ['run_walk_ratio', ...weekRules],
          beginner,
          weekNumber,
        }),
      )
    } else {
      const targetLongKm =
        peakLongRunKm * Math.min(1, (weekNumber / Math.max(1, taperStartWeek - 1)) ** 0.8)
      let proposed = Math.max(volumeKm * 0.3, targetLongKm * (stepBack ? 0.75 : 1))
      if (inTaper) {
        proposed = peakLongRunKm * taperLongRunMultiplier(weeksToRace, input.goal.distance)
      }
      const longRunDate = dayDate(weekStart, days[0])
      const { allowedKm, capped } = capAgainstHistory(proposed, longRunDate)
      longRunKm = Math.round(allowedKm * 10) / 10
      scheduled.push({ date: longRunDate, distanceKm: longRunKm })

      const isRaceWeek = phase === 'race_week' && hasRaceDate
      sessions.push(
        makeSession({
          date: dayDate(weekStart, days[0]),
          dayOfWeek: days[0],
          activityType: isRaceWeek ? 'race' : 'long_run',
          targetDistanceKm: isRaceWeek ? raceKm : longRunKm,
          zones,
          rules: [
            ...(capped ? (['long_run_cap'] as RuleId[]) : []),
            'easy_pace_discipline',
            ...weekRules,
          ],
          beginner,
          weekNumber,
        }),
      )
    }

    // --- remaining running days ----------------------------------------
    const remainingKm = Math.max(0, volumeKm - longRunKm)
    const runDays = days.slice(1)
    let qualityPlaced = 0

    runDays.forEach((day, i) => {
      const isQualityDay =
        !beginner && allowQuality && qualityPlaced < shape.quality && i === 1
      const date = dayDate(weekStart, day)

      if (beginner) {
        const ratio = ratioForWeek(ladderStart, weekNumber)
        const minutes = Math.min(35, 20 + Math.floor((weekNumber - 1) / 3) * 3)
        const repeats = repeatsForDuration(ratio, minutes)
        sessions.push(
          makeSession({
            date,
            dayOfWeek: day,
            activityType: 'walk_run_intervals',
            targetDurationMin: minutes,
            runWalkRatio: describeRunWalk(ratio, repeats),
            runWalkSegments: { runSec: ratio.runSec, walkSec: ratio.walkSec, repeats },
            zones,
            rules: ['run_walk_ratio'],
            beginner,
            weekNumber,
          }),
        )
        return
      }

      if (isQualityDay) {
        qualityPlaced++
        // Alternate the flavour of quality work week to week.
        const type: SessionType = weekNumber % 2 === 0 ? 'intervals' : 'tempo'
        const proposed = Math.max(3, remainingKm * (type === 'tempo' ? 0.35 : 0.3))
        const { allowedKm, capped } = capAgainstHistory(proposed, date)
        const km = Math.round(allowedKm * 10) / 10
        scheduled.push({ date, distanceKm: km })
        sessions.push(
          makeSession({
            date,
            dayOfWeek: day,
            activityType: type,
            targetDistanceKm: km,
            zones,
            rules: capped ? ['quality_session', 'long_run_cap'] : ['quality_session'],
            beginner,
            weekNumber,
          }),
        )
        return
      }

      const easyCount = Math.max(1, runDays.length - qualityPlaced)
      const proposed = Math.max(2, (remainingKm * 0.65) / easyCount)
      const { allowedKm, capped } = capAgainstHistory(proposed, date)
      const km = Math.round(allowedKm * 10) / 10
      scheduled.push({ date, distanceKm: km })
      sessions.push(
        makeSession({
          date,
          dayOfWeek: day,
          activityType: 'easy_run',
          targetDistanceKm: km,
          zones,
          rules: capped
            ? ['easy_pace_discipline', 'long_run_cap']
            : ['easy_pace_discipline'],
          beginner,
          weekNumber,
        }),
      )
    })

    // --- time trial in week 1 when there are no real paces yet ----------
    if (weekNumber === 1 && needsTimeTrial) {
      const ttDay = days[Math.min(1, days.length - 1)]
      const idx = sessions.findIndex((s) => s.dayOfWeek === ttDay)
      const ttSession = makeSession({
        date: dayDate(weekStart, ttDay),
        dayOfWeek: ttDay,
        activityType: 'time_trial',
        targetDistanceKm: beginner ? undefined : Math.min(5, raceKm),
        targetDurationMin: beginner ? 12 : undefined,
        zones,
        rules: ['time_trial_week_one'],
        beginner,
        weekNumber,
      })
      if (idx >= 0) sessions[idx] = ttSession
      else sessions.push(ttSession)
    }

    // --- strength and rest ----------------------------------------------
    const usedDays = new Set(sessions.map((s) => s.dayOfWeek))
    const freeDays = [1, 2, 3, 4, 5, 6, 0].filter((d) => !usedDays.has(d))

    // Strength is prescribed, not offered: it is one of the few interventions
    // with strong evidence for cutting running injury risk.
    freeDays.slice(0, Math.min(shape.strength, Math.max(0, freeDays.length - 1))).forEach((day) => {
      sessions.push(
        makeSession({
          date: dayDate(weekStart, day),
          dayOfWeek: day,
          activityType: 'strength',
          targetDurationMin: 20,
          zones,
          rules: ['strength_sessions'],
          beginner,
          weekNumber,
        }),
      )
    })

    const stillFree = [1, 2, 3, 4, 5, 6, 0].filter(
      (d) => !sessions.some((s) => s.dayOfWeek === d),
    )
    stillFree.forEach((day) => {
      sessions.push(
        makeSession({
          date: dayDate(weekStart, day),
          dayOfWeek: day,
          activityType: 'rest',
          zones,
          rules: ['rest_day'],
          beginner,
          weekNumber,
        }),
      )
    })

    sessions.sort((a, b) => a.date - b.date)

    weeks.push({
      weekNumber,
      startDate: weekStart,
      phase,
      isStepBackWeek: stepBack,
      totalDistanceKm:
        Math.round(
          sessions.reduce((sum, s) => sum + (s.targetDistanceKm ?? 0), 0) * 10,
        ) / 10,
      sessions,
      summaryNote: weekSummaryNote(phase, stepBack, inTaper),
    })
  }

  const goal: PlanGoal = {
    distance: input.goal.distance,
    distanceKm: raceKm,
    targetTimeSec: input.goal.targetTimeSec,
    targetDate: input.goal.targetDate,
    weeks: totalWeeks,
  }

  const now = Date.now()
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    goal,
    createdFrom: { baseline, safetyScreen, paceZones: zones },
    weeks,
    adjustmentLog: cleared
      ? []
      : [
          {
            date: now,
            ruleId: 'safety_screen_flagged',
            reason: 'Safety screen flagged',
            summary:
              'Your answers to the health questions mean this plan starts with low-intensity walking and builds slowly. Please check in with a doctor before adding intensity.',
          },
        ],
    intensePlanAllowed: cleared,
    active: true,
  }
}

interface MakeSessionInput {
  date: number
  dayOfWeek: number
  activityType: SessionType
  targetDistanceKm?: number
  targetDurationMin?: number
  runWalkRatio?: string
  runWalkSegments?: { runSec: number; walkSec: number; repeats: number }
  zones: PaceZones
  rules: RuleId[]
  beginner: boolean
  weekNumber: number
}

function makeSession(input: MakeSessionInput): PlannedSession {
  return {
    id: newId(),
    date: input.date,
    dayOfWeek: input.dayOfWeek,
    activityType: input.activityType,
    targetDistanceKm: input.targetDistanceKm,
    targetDurationMin: input.targetDurationMin,
    targetPaceRange: paceRangeFor(input.activityType, input.zones),
    runWalkRatio: input.runWalkRatio,
    runWalkSegments: input.runWalkSegments,
    coachNote: coachNoteFor(input.activityType, {
      beginner: input.beginner,
      weekNumber: input.weekNumber,
      runWalkRatio: input.runWalkRatio,
    }),
    whyRuleIds: dedupe(input.rules),
  }
}

function paceRangeFor(type: SessionType, zones: PaceZones) {
  switch (type) {
    case 'easy_run':
    case 'long_run':
      return zones.easy
    case 'tempo':
      return zones.threshold
    case 'intervals':
      return zones.interval
    case 'race':
      return zones.marathon
    default:
      return undefined
  }
}

function dayDate(weekStart: number, dayOfWeek: number): number {
  // weekStart is Monday; map JS day numbers onto a Monday-first offset.
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return addDays(weekStart, offset)
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function weekSummaryNote(
  phase: PlanWeek['phase'],
  stepBack: boolean,
  inTaper: boolean,
): string {
  if (inTaper) {
    return 'Taper week — volume comes down so the fitness you built shows up fresh on race day.'
  }
  if (stepBack) {
    return 'Planned lighter week. This is where the work you have already done gets absorbed.'
  }
  switch (phase) {
    case 'beginner_runwalk':
      return 'Run-walk week. The walk breaks are part of the plan, not a fallback.'
    case 'base':
      return 'Base week — steady, easy volume. Nothing here should feel hard.'
    case 'build':
      return 'Build week. Volume is climbing gradually and one session has some bite to it.'
    case 'peak':
      return 'Peak week — the biggest load of the block. Sleep and food matter more than usual now.'
    default:
      return ''
  }
}

/** Re-export so screens can look up a specific ladder rung for display. */
export { RUN_WALK_LADDER, ladderIndexForWeek, readyForContinuous }
