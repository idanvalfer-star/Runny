import { describe, expect, it } from 'vitest'
import { generatePlan } from './engine'
import { SINGLE_SESSION_CAP } from './progression'
import { whyMap } from './whyMap'
import type {
  FitnessBaseline,
  GoalDistance,
  RuleId,
  SafetyScreen,
  TrainingPlan,
} from '../types'

const clearedScreen: SafetyScreen = {
  answers: {
    heartCondition: false,
    chestPainDizziness: false,
    boneOrJointProblem: false,
    pregnancyOrOtherMedical: false,
  },
  clearedForIntensePlan: true,
  completedAt: 0,
}

const flaggedScreen: SafetyScreen = {
  answers: {
    heartCondition: true,
    chestPainDizziness: false,
    boneOrJointProblem: false,
    pregnancyOrOtherMedical: false,
  },
  clearedForIntensePlan: false,
  completedAt: 0,
}

const experienced: FitnessBaseline = {
  currentAbility: 'run_10k_plus',
  recentRaceOrTimeTrial: { distanceKm: 10, timeSec: 45 * 60 },
  daysPerWeek: 5,
  preferredLongDay: 0,
  injuryHistory: ['none'],
  doesStrengthTraining: true,
}

const beginner: FitnessBaseline = {
  currentAbility: 'cannot_run_2k',
  daysPerWeek: 3,
  preferredLongDay: 6,
  injuryHistory: ['none'],
  doesStrengthTraining: false,
}

const START = Date.UTC(2026, 2, 2) // a Monday

function plan(
  distance: GoalDistance,
  baseline = experienced,
  screen = clearedScreen,
  extra: Partial<Parameters<typeof generatePlan>[0]['goal']> = {},
): TrainingPlan {
  return generatePlan({
    goal: { distance, weeks: 12, ...extra },
    baseline,
    safetyScreen: screen,
    age: 35,
    startDate: START,
  })
}

const allSessions = (p: TrainingPlan) => p.weeks.flatMap((w) => w.sessions)

describe('plan structure', () => {
  it('builds the requested number of weeks', () => {
    expect(plan('10k').weeks).toHaveLength(12)
  })

  it('gives every week exactly seven days', () => {
    for (const week of plan('half').weeks) {
      expect(week.sessions).toHaveLength(7)
      const days = week.sessions.map((s) => s.dayOfWeek).sort()
      expect(new Set(days).size).toBe(7)
    }
  })

  it('orders sessions by date within a week', () => {
    for (const week of plan('10k').weeks) {
      const dates = week.sessions.map((s) => s.date)
      expect([...dates].sort((a, b) => a - b)).toEqual(dates)
    }
  })

  it('gives every session a coach note', () => {
    for (const s of allSessions(plan('marathon'))) {
      expect(s.coachNote.length).toBeGreaterThan(10)
    }
  })

  it('only ever attaches rule ids that resolve to real copy', () => {
    for (const s of allSessions(plan('half'))) {
      for (const ruleId of s.whyRuleIds) {
        expect(whyMap[ruleId as RuleId]).toBeDefined()
      }
    }
  })

  it('places the long run on the preferred day', () => {
    const p = plan('half', { ...experienced, preferredLongDay: 6 })
    const longRuns = allSessions(p).filter((s) => s.activityType === 'long_run')
    expect(longRuns.length).toBeGreaterThan(0)
    for (const s of longRuns) expect(s.dayOfWeek).toBe(6)
  })
})

describe('safety guardrails', () => {
  it('gives every week at least one full rest day', () => {
    for (const distance of ['5k', '10k', 'half', 'marathon'] as const) {
      for (const week of plan(distance).weeks) {
        const rest = week.sessions.filter((s) => s.activityType === 'rest')
        expect(rest.length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('gives beginners more than one rest day a week', () => {
    for (const week of plan('5k', beginner).weeks) {
      const rest = week.sessions.filter((s) => s.activityType === 'rest')
      expect(rest.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('never lets a session exceed the single-session cap versus the past 30 days', () => {
    // The first four weeks are anchored partly to the runner's pre-plan
    // history, which lives outside the plan and so is invisible here. From
    // week 5 on, the whole 30-day window is made of plan sessions, and the
    // invariant is checkable purely from the generated plan.
    const CHECK_FROM_WEEK = 5

    for (const distance of ['5k', '10k', 'half', 'marathon'] as const) {
      const p = plan(distance, experienced, clearedScreen, { weeks: 16 })
      const dated = allSessions(p)
        .filter((s) => s.targetDistanceKm !== undefined && s.activityType !== 'race')
        .sort((a, b) => a.date - b.date)
      const checkFrom = p.weeks[CHECK_FROM_WEEK - 1].startDate

      for (let i = 0; i < dated.length; i++) {
        const session = dated[i]
        if (session.date < checkFrom) continue
        const cutoff = session.date - 30 * 86400000
        const priorLongest = dated
          .slice(0, i)
          .filter((s) => s.date >= cutoff)
          .reduce((max, s) => Math.max(max, s.targetDistanceKm ?? 0), 0)
        expect(priorLongest).toBeGreaterThan(0)
        expect(session.targetDistanceKm!).toBeLessThanOrEqual(
          priorLongest * SINGLE_SESSION_CAP + 0.15,
        )
      }
    }
  })

  it('keeps the opening week within reach of what the runner said they can do', () => {
    // A 10 km time trial should not produce a week-one long run far beyond it,
    // even when the goal is a marathon.
    const trialKm = experienced.recentRaceOrTimeTrial!.distanceKm
    for (const distance of ['10k', 'half', 'marathon'] as const) {
      const p = plan(distance)
      const week1Longest = Math.max(
        ...p.weeks[0].sessions.map((s) => s.targetDistanceKm ?? 0),
      )
      expect(week1Longest).toBeLessThanOrEqual(trialKm * 1.3)
    }
  })

  it('schedules step-back weeks that are genuinely lighter', () => {
    const p = plan('marathon', experienced, clearedScreen, { weeks: 16 })
    const stepBacks = p.weeks.filter((w) => w.isStepBackWeek)
    expect(stepBacks.length).toBeGreaterThanOrEqual(2)

    for (const week of stepBacks) {
      const prior = p.weeks.find((w) => w.weekNumber === week.weekNumber - 1)
      if (!prior || prior.totalDistanceKm === 0) continue
      expect(week.totalDistanceKm).toBeLessThan(prior.totalDistanceKm)
    }
  })

  it('prescribes strength work every week', () => {
    for (const week of plan('10k').weeks) {
      const strength = week.sessions.filter((s) => s.activityType === 'strength')
      expect(strength.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('withholds quality work from the opening weeks', () => {
    const p = plan('half')
    const earlyQuality = p.weeks
      .slice(0, 3)
      .flatMap((w) => w.sessions)
      .filter((s) => s.activityType === 'tempo' || s.activityType === 'intervals')
    expect(earlyQuality).toHaveLength(0)
  })
})

describe('PAR-Q gate', () => {
  const flagged = plan('10k', experienced, flaggedScreen)

  it('marks the plan as not cleared for intensity', () => {
    expect(flagged.intensePlanAllowed).toBe(false)
  })

  it('never generates an interval or tempo session', () => {
    const intense = allSessions(flagged).filter(
      (s) => s.activityType === 'intervals' || s.activityType === 'tempo',
    )
    expect(intense).toHaveLength(0)
  })

  it('records why the plan is conservative', () => {
    expect(flagged.adjustmentLog[0]?.ruleId).toBe('safety_screen_flagged')
  })

  it('keeps total volume below an equivalent cleared plan', () => {
    const cleared = plan('10k', experienced, clearedScreen)
    const sum = (p: TrainingPlan) =>
      p.weeks.reduce((acc, w) => acc + w.totalDistanceKm, 0)
    expect(sum(flagged)).toBeLessThan(sum(cleared))
  })

  it('routes a flagged runner into run-walk rather than continuous running', () => {
    const types = new Set(allSessions(flagged).map((s) => s.activityType))
    expect(types.has('walk_run_intervals')).toBe(true)
  })
})

describe('beginner plans', () => {
  const p = plan('5k', beginner)

  it('uses run-walk intervals, not continuous runs', () => {
    const runs = allSessions(p).filter((s) => s.activityType === 'easy_run')
    expect(runs).toHaveLength(0)
    const runWalks = allSessions(p).filter((s) => s.activityType === 'walk_run_intervals')
    expect(runWalks.length).toBeGreaterThan(0)
  })

  it('attaches the run-walk explanation to those sessions', () => {
    const runWalks = allSessions(p).filter((s) => s.activityType === 'walk_run_intervals')
    for (const s of runWalks) {
      expect(s.whyRuleIds).toContain('run_walk_ratio')
    }
  })

  it('describes the ratio in plain language', () => {
    const first = allSessions(p).find((s) => s.activityType === 'walk_run_intervals')!
    expect(first.runWalkRatio).toMatch(/run/)
    expect(first.runWalkSegments?.repeats).toBeGreaterThan(0)
  })

  it('never uses interval or VO2max vocabulary a beginner does not need', () => {
    const types = new Set(allSessions(p).map((s) => s.activityType))
    expect(types.has('intervals')).toBe(false)
    expect(types.has('tempo')).toBe(false)
  })

  it('progresses the run segment over the block', () => {
    const first = allSessions(p).find((s) => s.runWalkSegments)!
    const last = [...allSessions(p)].reverse().find((s) => s.runWalkSegments)!
    expect(last.runWalkSegments!.runSec).toBeGreaterThan(first.runWalkSegments!.runSec)
  })
})

describe('pace zones', () => {
  it('derives zones from a supplied time trial', () => {
    const p = plan('10k')
    expect(p.createdFrom.paceZones).toBeDefined()
    expect(p.createdFrom.paceZones!.easy.minSecPerKm).toBeGreaterThan(
      p.createdFrom.paceZones!.threshold.minSecPerKm,
    )
  })

  it('targets easy pace on easy and long runs', () => {
    const p = plan('half')
    const easy = allSessions(p).filter(
      (s) => s.activityType === 'easy_run' || s.activityType === 'long_run',
    )
    for (const s of easy) {
      expect(s.targetPaceRange).toEqual(p.createdFrom.paceZones!.easy)
    }
  })

  it('schedules a week-one time trial when no recent effort exists', () => {
    const noTrial: FitnessBaseline = {
      ...experienced,
      recentRaceOrTimeTrial: undefined,
    }
    const p = plan('10k', noTrial)
    const week1 = p.weeks[0].sessions
    const tt = week1.find((s) => s.activityType === 'time_trial')
    expect(tt).toBeDefined()
    expect(tt!.whyRuleIds).toContain('time_trial_week_one')
  })

  it('does not schedule a time trial when a recent effort was given', () => {
    const tt = allSessions(plan('10k')).filter((s) => s.activityType === 'time_trial')
    expect(tt).toHaveLength(0)
  })
})

describe('taper', () => {
  it('adds a taper when a race date is set', () => {
    const raceDate = START + 16 * 7 * 86400000
    const p = generatePlan({
      goal: { distance: 'marathon', targetDate: raceDate },
      baseline: experienced,
      safetyScreen: clearedScreen,
      age: 35,
      startDate: START,
    })
    const phases = p.weeks.map((w) => w.phase)
    expect(phases).toContain('taper')
    expect(phases[phases.length - 1]).toBe('race_week')
  })

  it('reduces volume through the taper into race week', () => {
    const raceDate = START + 16 * 7 * 86400000
    const p = generatePlan({
      goal: { distance: 'marathon', targetDate: raceDate },
      baseline: experienced,
      safetyScreen: clearedScreen,
      age: 35,
      startDate: START,
    })
    const peak = Math.max(...p.weeks.map((w) => w.totalDistanceKm))
    const raceWeek = p.weeks[p.weeks.length - 1]
    const taperWeek = p.weeks[p.weeks.length - 2]
    expect(taperWeek.totalDistanceKm).toBeLessThan(peak)
    expect(raceWeek.totalDistanceKm).toBeLessThan(peak)
  })

  it('does not taper a plan with no race date', () => {
    const phases = plan('habit').weeks.map((w) => w.phase)
    expect(phases).not.toContain('taper')
  })
})

describe('schedule fit', () => {
  it('respects the number of training days the runner offered', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const p = plan('10k', { ...experienced, daysPerWeek: days })
      for (const week of p.weeks) {
        const training = week.sessions.filter(
          (s) =>
            s.activityType !== 'rest' &&
            s.activityType !== 'strength' &&
            s.activityType !== 'cross_train',
        )
        expect(training.length).toBeLessThanOrEqual(days)
      }
    }
  })
})
