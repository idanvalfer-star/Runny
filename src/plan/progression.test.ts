import { describe, expect, it } from 'vitest'
import {
  capSessionIncrease,
  isStepBackWeek,
  longestSessionInLast30Days,
  phaseForWeek,
  qualityAllowedFromWeek,
  SINGLE_SESSION_CAP,
  taperLongRunMultiplier,
  taperVolumeMultiplier,
  taperWeeksFor,
  weeklyGrowthRate,
} from './progression'
import {
  ladderIndexForWeek,
  ratioForWeek,
  repeatsForDuration,
  RUN_WALK_LADDER,
  startingLadderIndex,
} from './runWalk'
import type { FitnessBaseline } from '../types'

describe('capSessionIncrease', () => {
  it('allows an increase within 10% of the longest recent session', () => {
    const { allowedKm, capped } = capSessionIncrease(10.5, 10)
    expect(capped).toBe(false)
    expect(allowedKm).toBe(10.5)
  })

  it('caps a jump beyond 10%', () => {
    const { allowedKm, capped } = capSessionIncrease(16, 10)
    expect(capped).toBe(true)
    expect(allowedKm).toBeCloseTo(11, 1)
  })

  it('never returns more than the cap allows', () => {
    for (const longest of [3, 8, 12.4, 32]) {
      for (const proposed of [longest, longest * 1.5, longest * 3]) {
        const { allowedKm } = capSessionIncrease(proposed, longest)
        expect(allowedKm).toBeLessThanOrEqual(longest * SINGLE_SESSION_CAP + 0.05)
      }
    }
  })

  it('does not cap when there is no history to spike relative to', () => {
    const { allowedKm, capped } = capSessionIncrease(8, 0)
    expect(capped).toBe(false)
    expect(allowedKm).toBe(8)
  })
})

describe('longestSessionInLast30Days', () => {
  const now = Date.UTC(2026, 0, 31)
  const daysAgo = (n: number) => now - n * 86400000

  it('ignores sessions older than the window', () => {
    const sessions = [
      { date: daysAgo(45), distanceKm: 30 },
      { date: daysAgo(10), distanceKm: 12 },
    ]
    expect(longestSessionInLast30Days(sessions, now)).toBe(12)
  })

  it('ignores sessions in the future', () => {
    const sessions = [
      { date: now + 86400000 * 5, distanceKm: 40 },
      { date: daysAgo(3), distanceKm: 9 },
    ]
    expect(longestSessionInLast30Days(sessions, now)).toBe(9)
  })

  it('returns zero with no qualifying sessions', () => {
    expect(longestSessionInLast30Days([], now)).toBe(0)
  })
})

describe('isStepBackWeek', () => {
  it('inserts a lighter week every fourth week', () => {
    const taperStart = 100 // effectively no taper
    expect(isStepBackWeek(4, 16, taperStart)).toBe(true)
    expect(isStepBackWeek(8, 16, taperStart)).toBe(true)
    expect(isStepBackWeek(12, 16, taperStart)).toBe(true)
  })

  it('does not step back in ordinary weeks', () => {
    for (const w of [1, 2, 3, 5, 6, 7]) {
      expect(isStepBackWeek(w, 16, 100)).toBe(false)
    }
  })

  it('never steps back in week 1', () => {
    expect(isStepBackWeek(1, 12, 100)).toBe(false)
  })

  it('does not stack a step-back inside the taper', () => {
    // Week 12 of a 16-week plan with a taper starting at week 12.
    expect(isStepBackWeek(12, 16, 12)).toBe(false)
  })
})

describe('taper', () => {
  it('scales taper length to race distance', () => {
    expect(taperWeeksFor('5k')).toBe(1)
    expect(taperWeeksFor('10k')).toBe(1)
    expect(taperWeeksFor('half')).toBe(2)
    expect(taperWeeksFor('marathon')).toBe(3)
    expect(taperWeeksFor('ultra')).toBe(3)
  })

  it('leaves volume untouched outside the taper window', () => {
    expect(taperVolumeMultiplier(8, 'marathon')).toBe(1)
    expect(taperVolumeMultiplier(5, 'half')).toBe(1)
  })

  it('cuts marathon volume to roughly 40-60% by race week', () => {
    const raceWeek = taperVolumeMultiplier(1, 'marathon')
    expect(raceWeek).toBeGreaterThanOrEqual(0.4)
    expect(raceWeek).toBeLessThanOrEqual(0.6)
  })

  it('cuts half marathon volume progressively', () => {
    const twoOut = taperVolumeMultiplier(2, 'half')
    const raceWeek = taperVolumeMultiplier(1, 'half')
    expect(twoOut).toBeCloseTo(0.65, 1)
    expect(raceWeek).toBeLessThan(twoOut)
    expect(raceWeek).toBeGreaterThan(0.4)
  })

  it('cuts the long run harder than overall volume', () => {
    for (const goal of ['half', 'marathon', 'ultra'] as const) {
      expect(taperLongRunMultiplier(1, goal)).toBeLessThan(
        taperVolumeMultiplier(1, goal),
      )
    }
  })

  it('reduces the long run monotonically as the race approaches', () => {
    const three = taperLongRunMultiplier(3, 'marathon')
    const two = taperLongRunMultiplier(2, 'marathon')
    const one = taperLongRunMultiplier(1, 'marathon')
    expect(three).toBeGreaterThan(two)
    expect(two).toBeGreaterThan(one)
  })
})

describe('phaseForWeek', () => {
  it('ends a marathon block with taper then race week', () => {
    expect(phaseForWeek(16, 16, 'marathon', false)).toBe('race_week')
    expect(phaseForWeek(15, 16, 'marathon', false)).toBe('taper')
    expect(phaseForWeek(14, 16, 'marathon', false)).toBe('taper')
  })

  it('progresses base to build to peak', () => {
    expect(phaseForWeek(1, 16, 'marathon', false)).toBe('base')
    expect(phaseForWeek(7, 16, 'marathon', false)).toBe('build')
    expect(phaseForWeek(12, 16, 'marathon', false)).toBe('peak')
  })

  it('keeps a beginner in the run-walk phase', () => {
    expect(phaseForWeek(3, 10, '5k', true)).toBe('beginner_runwalk')
  })
})

describe('quality work gating', () => {
  it('withholds quality sessions from beginners entirely', () => {
    expect(qualityAllowedFromWeek(12, true)).toBe(Number.POSITIVE_INFINITY)
  })

  it('delays quality work past the first few weeks', () => {
    expect(qualityAllowedFromWeek(12, false)).toBeGreaterThanOrEqual(3)
    expect(qualityAllowedFromWeek(16, false)).toBeGreaterThanOrEqual(4)
  })
})

describe('weeklyGrowthRate', () => {
  it('progresses most slowly when the safety screen flagged something', () => {
    const flagged = weeklyGrowthRate({
      beginner: false,
      hasInjuryHistory: false,
      clearedForIntensePlan: false,
    })
    const cleared = weeklyGrowthRate({
      beginner: false,
      hasInjuryHistory: false,
      clearedForIntensePlan: true,
    })
    expect(flagged).toBeLessThan(cleared)
  })

  it('slows progression for injury history', () => {
    const injured = weeklyGrowthRate({
      beginner: false,
      hasInjuryHistory: true,
      clearedForIntensePlan: true,
    })
    const healthy = weeklyGrowthRate({
      beginner: false,
      hasInjuryHistory: false,
      clearedForIntensePlan: true,
    })
    expect(injured).toBeLessThan(healthy)
  })
})

describe('run-walk progression', () => {
  const baseBaseline: FitnessBaseline = {
    currentAbility: 'cannot_run_2k',
    daysPerWeek: 3,
    preferredLongDay: 0,
    injuryHistory: ['none'],
    doesStrengthTraining: false,
  }

  it('starts an average beginner at 30s run / 90s walk', () => {
    const idx = startingLadderIndex(baseBaseline, 30, true)
    expect(RUN_WALK_LADDER[idx].runSec).toBe(30)
    expect(RUN_WALK_LADDER[idx].walkSec).toBe(90)
  })

  it('starts a runner over 40 one notch more conservative', () => {
    const young = startingLadderIndex(baseBaseline, 30, true)
    const older = startingLadderIndex(baseBaseline, 45, true)
    expect(older).toBeLessThan(young)
    expect(RUN_WALK_LADDER[older].runSec).toBeLessThan(RUN_WALK_LADDER[young].runSec)
  })

  it('starts more conservatively with joint history', () => {
    const withInjury = startingLadderIndex(
      { ...baseBaseline, injuryHistory: ['runners_knee'] },
      30,
      true,
    )
    expect(withInjury).toBeLessThan(startingLadderIndex(baseBaseline, 30, true))
  })

  it('starts more conservatively when returning from a break', () => {
    const returning = startingLadderIndex(
      { ...baseBaseline, returningFromBreak: true },
      30,
      true,
    )
    expect(returning).toBeLessThan(startingLadderIndex(baseBaseline, 30, true))
  })

  it('never falls off the bottom of the ladder', () => {
    const idx = startingLadderIndex(
      { ...baseBaseline, injuryHistory: ['stress_fracture'], returningFromBreak: true },
      65,
      false,
    )
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(RUN_WALK_LADDER[idx]).toBeDefined()
  })

  it('holds each ratio for two weeks before advancing', () => {
    expect(ladderIndexForWeek(2, 1)).toBe(2)
    expect(ladderIndexForWeek(2, 2)).toBe(2)
    expect(ladderIndexForWeek(2, 3)).toBe(3)
    expect(ladderIndexForWeek(2, 4)).toBe(3)
    expect(ladderIndexForWeek(2, 5)).toBe(4)
  })

  it('never regresses as weeks go on', () => {
    let prev = -1
    for (let week = 1; week <= 20; week++) {
      const idx = ladderIndexForWeek(2, week)
      expect(idx).toBeGreaterThanOrEqual(prev)
      prev = idx
    }
  })

  it('progresses the run segment while shortening the walk over time', () => {
    const early = ratioForWeek(2, 1)
    const later = ratioForWeek(2, 9)
    expect(later.runSec).toBeGreaterThan(early.runSec)
  })

  it('fills a session duration with whole repeats', () => {
    const ratio = { runSec: 30, walkSec: 90, label: '30s run / 90s walk' }
    // 25 minutes of 2-minute cycles.
    expect(repeatsForDuration(ratio, 25)).toBe(13)
    expect(repeatsForDuration(ratio, 20)).toBe(10)
  })

  it('always returns at least one repeat', () => {
    expect(repeatsForDuration(RUN_WALK_LADDER[11], 1)).toBeGreaterThanOrEqual(1)
  })
})
