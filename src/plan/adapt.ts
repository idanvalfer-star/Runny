import type {
  Activity,
  AdjustmentLogEntry,
  PlanWeek,
  PlannedSession,
  RuleId,
  TrainingPlan,
} from '../types'
import { getActivePlan, listActivities, savePlan } from '../db/repo'
import { addDays, startOfWeek } from '../lib/dates'
import { capSessionIncrease, SINGLE_SESSION_CAP } from './progression'

/**
 * Rule-based plan adaptation.
 *
 * Every branch below is deterministic. In particular the pain branch is a plain
 * `if` evaluated before anything else — a reported pain never gets weighed
 * against "but the week otherwise went well". Soreness and fatigue are normal
 * training responses; pain is not, and no path here produces push-through
 * advice.
 */

export interface WeekReview {
  weekNumber: number
  plannedSessions: number
  completedSessions: number
  missedSessions: number
  painReported: boolean
  /** RPE 8+ on sessions that were supposed to be easy. */
  highRpeOnEasyDays: number
  averageRpe?: number
}

const EASY_TYPES = new Set(['easy_run', 'long_run', 'walk', 'walk_run_intervals'])

export function reviewWeek(week: PlanWeek, activities: Activity[]): WeekReview {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const trainingSessions = week.sessions.filter(
    (s) => s.activityType !== 'rest' && s.activityType !== 'strength',
  )

  let completed = 0
  let painReported = false
  let highRpeOnEasyDays = 0
  const rpes: number[] = []

  for (const session of trainingSessions) {
    const activity = session.completedActivityId
      ? byId.get(session.completedActivityId)
      : undefined
    if (!activity) continue
    completed++
    if (activity.painReported) painReported = true
    if (activity.rpe !== undefined) {
      rpes.push(activity.rpe)
      if (activity.rpe >= 8 && EASY_TYPES.has(session.activityType)) {
        highRpeOnEasyDays++
      }
    }
  }

  return {
    weekNumber: week.weekNumber,
    plannedSessions: trainingSessions.length,
    completedSessions: completed,
    missedSessions: Math.max(0, trainingSessions.length - completed),
    painReported,
    highRpeOnEasyDays,
    averageRpe:
      rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : undefined,
  }
}

export type AdaptationAction = 'pain_hold' | 'hold' | 'progress'

export interface AdaptationDecision {
  action: AdaptationAction
  ruleId: RuleId
  reason: string
  summary: string
  /** Multiplier applied to the upcoming weeks' volume. */
  volumeMultiplier: number
}

/**
 * The decision itself, isolated from any storage so it can be tested directly.
 * Order of evaluation is the safety property: pain first, always.
 */
export function decideAdaptation(review: WeekReview): AdaptationDecision {
  if (review.painReported) {
    return {
      action: 'pain_hold',
      ruleId: 'pain_flag',
      reason: 'Pain reported',
      summary:
        'You reported pain, so progression is paused and the next few days swap to rest and cross-training. Pain that persists is worth getting checked by a physio or doctor rather than training through.',
      volumeMultiplier: 0.6,
    }
  }

  if (review.plannedSessions > 0 && review.missedSessions >= 2) {
    return {
      action: 'hold',
      ruleId: 'held_volume_missed_sessions',
      reason: `${review.missedSessions} sessions missed`,
      summary:
        'A few sessions were missed last week, so the plan repeats at the current volume instead of stepping up. Progressing as though they had happened would mean a bigger jump than your body has been prepared for.',
      volumeMultiplier: 1,
    }
  }

  if (review.highRpeOnEasyDays >= 2) {
    return {
      action: 'hold',
      ruleId: 'held_volume_high_rpe',
      reason: 'Easy runs felt too hard',
      summary:
        'Your easy sessions have been coming back at a high effort. The plan holds at this volume until they settle back into the easy range — that usually means going slower, not fitter.',
      volumeMultiplier: 0.95,
    }
  }

  return {
    action: 'progress',
    ruleId: 'progressed_on_track',
    reason: 'Last week went to plan',
    summary:
      'Last week went as prescribed and your effort levels were where they should be, so the plan steps forward — still capped so no single session jumps too far at once.',
    volumeMultiplier: 1,
  }
}

/** Apply a decision to the upcoming weeks, returning a new plan. */
export function applyDecision(
  plan: TrainingPlan,
  decision: AdaptationDecision,
  fromDate = Date.now(),
): TrainingPlan {
  const upcomingStart = startOfWeek(fromDate)
  // Only the next 1-2 weeks are touched; further out will be re-reviewed anyway.
  const horizon = addDays(upcomingStart, 21)

  // The single-session cap is measured against what was actually run recently,
  // so a held-back week cannot be undone by the next week's proposal.
  let longestRecentKm = 0
  for (const week of plan.weeks) {
    for (const s of week.sessions) {
      if (s.date < upcomingStart && s.date >= upcomingStart - 30 * 86400000) {
        longestRecentKm = Math.max(longestRecentKm, s.targetDistanceKm ?? 0)
      }
    }
  }

  const weeks = plan.weeks.map((week) => {
    if (week.startDate < upcomingStart || week.startDate > horizon) return week

    const sessions = week.sessions.map((session): PlannedSession => {
      if (session.completedActivityId) return session

      if (decision.action === 'pain_hold') {
        // Running turns into cross-training or rest; intensity is removed
        // entirely rather than merely reduced.
        if (session.activityType === 'rest' || session.activityType === 'strength') {
          return session
        }
        const swapTo =
          session.activityType === 'intervals' || session.activityType === 'tempo'
            ? 'rest'
            : 'cross_train'
        return {
          ...session,
          activityType: swapTo,
          targetDistanceKm: undefined,
          targetPaceRange: undefined,
          runWalkRatio: undefined,
          runWalkSegments: undefined,
          targetDurationMin: swapTo === 'cross_train' ? 25 : undefined,
          coachNote:
            swapTo === 'rest'
              ? 'Rest while that pain settles. Progression stays paused until it does.'
              : 'Easy cross-training only — bike, swim or row. Nothing that provokes the pain.',
          whyRuleIds: ['pain_flag'],
        }
      }

      if (session.targetDistanceKm === undefined) return session

      const proposed = session.targetDistanceKm * decision.volumeMultiplier
      const { allowedKm, capped } = capSessionIncrease(proposed, longestRecentKm || proposed)
      const rules: RuleId[] = capped
        ? ['long_run_cap', decision.ruleId]
        : [decision.ruleId, ...session.whyRuleIds]

      return {
        ...session,
        targetDistanceKm: Math.round(allowedKm * 10) / 10,
        whyRuleIds: Array.from(new Set(rules)),
      }
    })

    return {
      ...week,
      sessions,
      totalDistanceKm:
        Math.round(
          sessions.reduce((sum, s) => sum + (s.targetDistanceKm ?? 0), 0) * 10,
        ) / 10,
    }
  })

  const entry: AdjustmentLogEntry = {
    date: Date.now(),
    ruleId: decision.ruleId,
    reason: decision.reason,
    summary: decision.summary,
  }

  return {
    ...plan,
    weeks,
    // Newest first: this is a timeline the runner reads top-down.
    adjustmentLog: [entry, ...plan.adjustmentLog],
    updatedAt: Date.now(),
  }
}

/**
 * Link a finished activity to the session it satisfies. Matching is by day and
 * type rather than anything clever — a run logged on a run day is that run.
 */
export function matchSessionForActivity(
  plan: TrainingPlan,
  activity: Activity,
): PlannedSession | undefined {
  if (activity.planSessionId) {
    for (const week of plan.weeks) {
      const found = week.sessions.find((s) => s.id === activity.planSessionId)
      if (found) return found
    }
  }
  const dayStart = new Date(activity.startTime)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = dayStart.getTime() + 86400000

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (session.date < dayStart.getTime() || session.date >= dayEnd) continue
      if (session.activityType === 'rest' || session.activityType === 'strength') continue
      if (session.completedActivityId) continue
      return session
    }
  }
  return undefined
}

/**
 * Called after post-run feedback is saved. Marks the session complete, and when
 * pain is reported, adapts immediately rather than waiting for the weekly
 * review — the whole point is that it does not wait.
 */
export async function applyFeedbackToPlan(activity: Activity): Promise<void> {
  const plan = await getActivePlan()
  if (!plan) return

  const session = matchSessionForActivity(plan, activity)
  let next = plan
  if (session) {
    next = {
      ...plan,
      weeks: plan.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map((s) =>
          s.id === session.id ? { ...s, completedActivityId: activity.id } : s,
        ),
      })),
      updatedAt: Date.now(),
    }
  }

  if (activity.painReported) {
    const decision = decideAdaptation({
      weekNumber: 0,
      plannedSessions: 0,
      completedSessions: 0,
      missedSessions: 0,
      painReported: true,
      highRpeOnEasyDays: 0,
    })
    next = applyDecision(next, decision)
  }

  await savePlan(next)
}

/** The weekly review, run on demand from the plan screen. */
export async function runWeeklyReview(): Promise<AdaptationDecision | undefined> {
  const plan = await getActivePlan()
  if (!plan) return undefined

  const activities = await listActivities()
  const lastWeekStart = addDays(startOfWeek(Date.now()), -7)
  const week = plan.weeks.find((w) => w.startDate === lastWeekStart)
  if (!week) return undefined

  const review = reviewWeek(week, activities)
  const decision = decideAdaptation(review)
  await savePlan(applyDecision(plan, decision))
  return decision
}

export { SINGLE_SESSION_CAP }
