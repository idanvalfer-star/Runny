import { describe, expect, it } from 'vitest'
import {
  caloriesForRoute,
  kcalFromMets,
  metsFromVo2,
  vo2MlKgMin,
} from './calories'
import type { RoutePoint } from '../types'

describe('ACSM metabolic equations', () => {
  it('returns resting VO2 at zero speed', () => {
    expect(vo2MlKgMin(0, 0, 'run')).toBeCloseTo(3.5)
    expect(vo2MlKgMin(0, 0, 'walk')).toBeCloseTo(3.5)
  })

  it('matches the hand-computed running value at 10 km/h', () => {
    // 10 km/h = 166.67 m/min; VO2 = 0.2*166.67 + 3.5 = 36.83
    expect(vo2MlKgMin(10000 / 60, 0, 'run')).toBeCloseTo(36.83, 1)
  })

  it('matches the hand-computed walking value at 5 km/h', () => {
    // 5 km/h = 83.33 m/min; VO2 = 0.1*83.33 + 3.5 = 11.83
    expect(vo2MlKgMin(5000 / 60, 0, 'walk')).toBeCloseTo(11.83, 1)
  })

  it('costs more running uphill than on the flat', () => {
    const flat = vo2MlKgMin(200, 0, 'run')
    const uphill = vo2MlKgMin(200, 0.05, 'run')
    expect(uphill).toBeGreaterThan(flat)
  })

  it('penalises incline more steeply for walking than running', () => {
    // The walking coefficient (1.8) is double the running one (0.9).
    const runDelta = vo2MlKgMin(150, 0.1, 'run') - vo2MlKgMin(150, 0, 'run')
    const walkDelta = vo2MlKgMin(150, 0.1, 'walk') - vo2MlKgMin(150, 0, 'walk')
    expect(walkDelta).toBeCloseTo(runDelta * 2, 5)
  })

  it('converts VO2 to METs against the 3.5 baseline', () => {
    expect(metsFromVo2(35)).toBeCloseTo(10)
    expect(metsFromVo2(3.5)).toBeCloseTo(1)
  })

  it('computes kcal from METs, weight and duration', () => {
    // 10 METs, 70 kg, 60 min => 10 * 3.5 * 70 / 200 * 60 = 735 kcal
    expect(kcalFromMets(10, 70, 60)).toBeCloseTo(735)
  })

  it('scales calories linearly with body weight', () => {
    expect(kcalFromMets(8, 100, 30)).toBeCloseTo(kcalFromMets(8, 50, 30) * 2)
  })
})

describe('caloriesForRoute', () => {
  /** A straight north-south run at a steady pace. */
  function straightRoute(points: number, metresPerStep: number, stepMs: number) {
    const route: RoutePoint[] = []
    for (let i = 0; i < points; i++) {
      route.push({
        lat: 51.5 + (i * metresPerStep) / 111_320,
        lng: -0.12,
        timestamp: 1_700_000_000_000 + i * stepMs,
      })
    }
    return route
  }

  it('produces a plausible burn for a 30-minute 10 km/h run', () => {
    // 3 m/s for 1800 s = 5.4 km.
    const route = straightRoute(1801, 3, 1000)
    const kcal = caloriesForRoute(route, 'run', 70)
    // Roughly 60-70 kcal per km for a 70 kg runner.
    expect(kcal).toBeGreaterThan(280)
    expect(kcal).toBeLessThan(480)
  })

  it('burns more for a heavier runner over the same route', () => {
    const route = straightRoute(601, 3, 1000)
    expect(caloriesForRoute(route, 'run', 90)).toBeGreaterThan(
      caloriesForRoute(route, 'run', 60),
    )
  })

  it('burns less walking than running the same route', () => {
    const route = straightRoute(601, 1.4, 1000)
    expect(caloriesForRoute(route, 'walk', 70)).toBeLessThan(
      caloriesForRoute(route, 'run', 70),
    )
  })

  it('returns zero for a route with no movement in time', () => {
    expect(caloriesForRoute([], 'run', 70)).toBe(0)
  })
})
