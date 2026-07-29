import { describe, expect, it } from 'vitest'
import {
  applyDecision,
  decideAdaptation,
  matchSessionForActivity,
  reviewWeek,
} from './adapt'
import { generatePlan } from './engine'
import { whyMap } from './whyMap'
import type {
  Activity,
  FitnessBaseline,
  RuleId,
  SafetyScreen,
  TrainingPlan,
} from '../types'
import type { WeekReview } from './adapt'

const screen: SafetyScreen = {
  answers: {
    heartCondition: false,
    chestPainDizziness: false,
    boneOrJointProblem: false,
    pregnancyOrOtherMedical: false,
  },
  clearedForIntensePlan: true,
  completedAt: 0,
}

const baseline: FitnessBaseline = {
  currentAbility: 'run_5k_to_10k',
  recentRaceOrTimeTrial: { distanceKm: 5, timeSec: 27 * 60 },
  daysPerWeek: 4,
  preferredLongDay: 0,
  injuryHistory: ['none'],
  doesStrengthTraining: false,
}

const START = Date.UTC(2026, 2, 2)

function makePlan(): TrainingPlan {
  return generatePlan({
    goal: { distance: '10k', weeks: 12 },
    baseline,
    safetyScreen: screen,
    age: 35,
    startDate: START,
  })
}

const review = (overrides: Partial<WeekReview> = {}): WeekReview => ({
  weekNumber: 3,
  plannedSessions: 4,
  completedSessions: 4,
  missedSessions: 0,
  painReported: false,
  highRpeOnEasyDays: 0,
  ...overrides,
})

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    type: 'run',
    startTime: START,
    endTime: START + 1800_000,
    movingTimeSec: 1800,
    elapsedTimeSec: 1800,
    distanceKm: 5,
    route: [],
    hrSamples: [],
    avgPaceSecPerKm: 360,
    caloriesBurned: 300,
    elevationGainM: 0,
    elevationLossM: 0,
    splits: [],
    ...overrides,
  }
}

describe('decideAdaptation', () => {
  it('halts progression whenever pain is reported', () => {
    const decision = decideAdaptation(review({ painReported: true }))
    expect(decision.action).toBe('pain_hold')
    expect(decision.ruleId).toBe('pain_flag')
    expect(decision.volumeMultiplier).toBeLessThan(1)
  })

  it('prioritises pain over an otherwise perfect week', () => {
    // Everything else says "progress"; pain must still win.
    const decision = decideAdaptation(
      review({
        painReported: true,
        completedSessions: 4,
        missedSessions: 0,
        highRpeOnEasyDays: 0,
        averageRpe: 4,
      }),
    )
    expect(decision.action).toBe('pain_hold')
  })

  it('prioritises pain over missed sessions and high RPE together', () => {
    const decision = decideAdaptation(
      review({ painReported: true, missedSessions: 3, highRpeOnEasyDays: 4 }),
    )
    expect(decision.ruleId).toBe('pain_flag')
  })

  it('never suggests pushing through pain', () => {
    const decision = decideAdaptation(review({ painReported: true }))
    expect(decision.summary.toLowerCase()).not.toMatch(/push through|tough it out/)
    expect(decision.summary.toLowerCase()).toMatch(/physio|doctor/)
  })

  it('holds volume when sessions were missed', () => {
    const decision = decideAdaptation(review({ missedSessions: 2, completedSessions: 2 }))
    expect(decision.action).toBe('hold')
    expect(decision.ruleId).toBe('held_volume_missed_sessions')
    expect(decision.volumeMultiplier).toBeLessThanOrEqual(1)
  })

  it('holds volume when easy days keep coming back hard', () => {
    const decision = decideAdaptation(review({ highRpeOnEasyDays: 3 }))
    expect(decision.action).toBe('hold')
    expect(decision.ruleId).toBe('held_volume_high_rpe')
    expect(decision.volumeMultiplier).toBeLessThanOrEqual(1)
  })

  it('tolerates a single hard-feeling easy day', () => {
    expect(decideAdaptation(review({ highRpeOnEasyDays: 1 })).action).toBe('progress')
  })

  it('tolerates one missed session', () => {
    expect(
      decideAdaptation(review({ missedSessions: 1, completedSessions: 3 })).action,
    ).toBe('progress')
  })

  it('progresses when the week went to plan', () => {
    const decision = decideAdaptation(review({ averageRpe: 4 }))
    expect(decision.action).toBe('progress')
    expect(decision.ruleId).toBe('progressed_on_track')
  })

  it('always produces copy the why layer can explain', () => {
    for (const r of [
      review({ painReported: true }),
      review({ missedSessions: 3 }),
      review({ highRpeOnEasyDays: 2 }),
      review(),
    ]) {
      const decision = decideAdaptation(r)
      expect(whyMap[decision.ruleId as RuleId]).toBeDefined()
      expect(decision.summary.length).toBeGreaterThan(20)
    }
  })
})

describe('reviewWeek', () => {
  it('counts missed sessions against what was prescribed', () => {
    const plan = makePlan()
    const week = plan.weeks[1]
    const r = reviewWeek(week, [])
    expect(r.completedSessions).toBe(0)
    expect(r.missedSessions).toBe(r.plannedSessions)
    expect(r.plannedSessions).toBeGreaterThan(0)
  })

  it('excludes rest and strength days from the prescribed count', () => {
    const plan = makePlan()
    const week = plan.weeks[1]
    const r = reviewWeek(week, [])
    const nonTraining = week.sessions.filter(
      (s) => s.activityType === 'rest' || s.activityType === 'strength',
    ).length
    expect(r.plannedSessions).toBe(week.sessions.length - nonTraining)
  })

  it('picks up pain from a completed session', () => {
    const plan = makePlan()
    const week = plan.weeks[1]
    const target = week.sessions.find((s) => s.activityType === 'easy_run')!
    const act = activity({ id: 'x', painReported: true, rpe: 5 })
    target.completedActivityId = 'x'
    expect(reviewWeek(week, [act]).painReported).toBe(true)
  })

  it('counts a high RPE only when the session was meant to be easy', () => {
    const plan = makePlan()
    const week = plan.weeks[1]
    const easy = week.sessions.find((s) => s.activityType === 'easy_run')!
    easy.completedActivityId = 'hard-easy'
    const r = reviewWeek(week, [activity({ id: 'hard-easy', rpe: 9 })])
    expect(r.highRpeOnEasyDays).toBe(1)
  })

  it('averages reported RPE', () => {
    const plan = makePlan()
    const week = plan.weeks[1]
    const easies = week.sessions.filter((s) => s.activityType === 'easy_run').slice(0, 2)
    easies[0].completedActivityId = 'a'
    easies[1].completedActivityId = 'b'
    const r = reviewWeek(week, [
      activity({ id: 'a', rpe: 4 }),
      activity({ id: 'b', rpe: 6 }),
    ])
    expect(r.averageRpe).toBeCloseTo(5)
  })
})

describe('applyDecision', () => {
  it('replaces upcoming running with rest or cross-training when pain is reported', () => {
    const plan = makePlan()
    const decision = decideAdaptation(review({ painReported: true }))
    const next = applyDecision(plan, decision, plan.weeks[2].startDate)

    const upcoming = next.weeks
      .filter((w) => w.startDate >= plan.weeks[2].startDate)
      .slice(0, 2)
      .flatMap((w) => w.sessions)

    for (const s of upcoming) {
      expect(['rest', 'cross_train', 'strength']).toContain(s.activityType)
    }
  })

  it('removes intensity entirely rather than just reducing it', () => {
    const plan = makePlan()
    const decision = decideAdaptation(review({ painReported: true }))
    const next = applyDecision(plan, decision, plan.weeks[4].startDate)

    const upcoming = next.weeks
      .filter(
        (w) =>
          w.startDate >= plan.weeks[4].startDate &&
          w.startDate <= plan.weeks[4].startDate + 21 * 86400000,
      )
      .flatMap((w) => w.sessions)

    expect(upcoming.some((s) => s.activityType === 'intervals')).toBe(false)
    expect(upcoming.some((s) => s.activityType === 'tempo')).toBe(false)
  })

  it('never increases any upcoming session when pain is reported', () => {
    const plan = makePlan()
    const from = plan.weeks[3].startDate
    const before = new Map(
      plan.weeks.flatMap((w) => w.sessions).map((s) => [s.id, s.targetDistanceKm ?? 0]),
    )
    const next = applyDecision(plan, decideAdaptation(review({ painReported: true })), from)

    for (const week of next.weeks) {
      for (const s of week.sessions) {
        expect(s.targetDistanceKm ?? 0).toBeLessThanOrEqual(before.get(s.id) ?? 0)
      }
    }
  })

  it('leaves already-completed sessions untouched', () => {
    const plan = makePlan()
    const week = plan.weeks[3]
    week.sessions[1].completedActivityId = 'done'
    const original = { ...week.sessions[1] }
    const next = applyDecision(
      plan,
      decideAdaptation(review({ painReported: true })),
      week.startDate,
    )
    const after = next.weeks[3].sessions.find((s) => s.id === original.id)!
    expect(after.activityType).toBe(original.activityType)
  })

  it('leaves weeks outside the horizon alone', () => {
    const plan = makePlan()
    const from = plan.weeks[1].startDate
    const next = applyDecision(plan, decideAdaptation(review({ painReported: true })), from)
    // Week 10 is well beyond the 3-week horizon.
    expect(next.weeks[9].sessions.map((s) => s.activityType)).toEqual(
      plan.weeks[9].sessions.map((s) => s.activityType),
    )
  })

  it('records a plain-language reason in the adjustment log', () => {
    const plan = makePlan()
    const next = applyDecision(plan, decideAdaptation(review({ missedSessions: 3 })))
    expect(next.adjustmentLog).toHaveLength(1)
    expect(next.adjustmentLog[0].reason).toContain('missed')
    expect(next.adjustmentLog[0].summary.length).toBeGreaterThan(20)
  })

  it('keeps the newest adjustment first', () => {
    const plan = makePlan()
    const once = applyDecision(plan, decideAdaptation(review({ missedSessions: 3 })))
    const twice = applyDecision(once, decideAdaptation(review({ painReported: true })))
    expect(twice.adjustmentLog).toHaveLength(2)
    expect(twice.adjustmentLog[0].ruleId).toBe('pain_flag')
  })

  it('respects the single-session cap when progressing', () => {
    const plan = makePlan()
    const from = plan.weeks[5].startDate
    const next = applyDecision(plan, decideAdaptation(review()), from)

    const changed = next.weeks
      .filter((w) => w.startDate >= from && w.startDate <= from + 21 * 86400000)
      .flatMap((w) => w.sessions)
      .filter((s) => s.targetDistanceKm !== undefined)

    const priorLongest = plan.weeks
      .flatMap((w) => w.sessions)
      .filter((s) => s.date < from && s.date >= from - 30 * 86400000)
      .reduce((max, s) => Math.max(max, s.targetDistanceKm ?? 0), 0)

    for (const s of changed) {
      expect(s.targetDistanceKm!).toBeLessThanOrEqual(priorLongest * 1.1 + 0.15)
    }
  })
})

describe('matchSessionForActivity', () => {
  it('matches by explicit session id when the run was started from the plan', () => {
    const plan = makePlan()
    const target = plan.weeks[0].sessions.find((s) => s.activityType === 'easy_run')!
    const act = activity({ planSessionId: target.id })
    expect(matchSessionForActivity(plan, act)?.id).toBe(target.id)
  })

  it('falls back to matching a training session on the same day', () => {
    const plan = makePlan()
    const target = plan.weeks[0].sessions.find(
      (s) => s.activityType !== 'rest' && s.activityType !== 'strength',
    )!
    const act = activity({ startTime: target.date + 9 * 3600_000 })
    expect(matchSessionForActivity(plan, act)?.id).toBe(target.id)
  })

  it('never matches a rest day', () => {
    const plan = makePlan()
    const rest = plan.weeks[0].sessions.find((s) => s.activityType === 'rest')!
    const sameDayTraining = plan.weeks[0].sessions.find(
      (s) => s.date === rest.date && s.activityType !== 'rest',
    )
    const act = activity({ startTime: rest.date + 3600_000 })
    const matched = matchSessionForActivity(plan, act)
    if (!sameDayTraining) expect(matched).toBeUndefined()
    else expect(matched?.activityType).not.toBe('rest')
  })
})
