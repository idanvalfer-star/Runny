import { describe, expect, it } from 'vitest'
import {
  acceptPoint,
  cumulativeDistanceKm,
  elevationTotals,
  gradeBetween,
  haversineM,
  routeDistanceKm,
} from './geo'
import type { RoutePoint } from '../types'

const p = (
  lat: number,
  lng: number,
  timestamp: number,
  extra: Partial<RoutePoint> = {},
): RoutePoint => ({ lat, lng, timestamp, ...extra })

describe('haversineM', () => {
  it('returns zero for identical points', () => {
    expect(haversineM({ lat: 51.5, lng: -0.12 }, { lat: 51.5, lng: -0.12 })).toBe(0)
  })

  it('matches a known distance', () => {
    // London to Paris is about 344 km.
    const d = haversineM({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 })
    expect(d / 1000).toBeGreaterThan(340)
    expect(d / 1000).toBeLessThan(346)
  })

  it('measures one degree of latitude as roughly 111 km', () => {
    const d = haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })
})

describe('acceptPoint', () => {
  it('accepts the first point when accuracy is usable', () => {
    expect(acceptPoint(undefined, p(51.5, -0.12, 1000, { accuracy: 8 }), 'run').accept).toBe(
      true,
    )
  })

  it('rejects a fix with poor accuracy', () => {
    const decision = acceptPoint(undefined, p(51.5, -0.12, 1000, { accuracy: 90 }), 'run')
    expect(decision.accept).toBe(false)
    expect(decision.reason).toBe('accuracy')
  })

  it('rejects a jump implying a speed no runner reaches', () => {
    const prev = p(51.5, -0.12, 1000)
    // ~1.1 km in one second.
    const next = p(51.51, -0.12, 2000)
    const decision = acceptPoint(prev, next, 'run')
    expect(decision.accept).toBe(false)
    expect(decision.reason).toBe('impossible_speed')
  })

  it('accepts a realistic running step', () => {
    const prev = p(51.5, -0.12, 1000)
    // ~3.3 m in one second, about 5:00/km.
    const next = p(51.50003, -0.12, 2000)
    expect(acceptPoint(prev, next, 'run').accept).toBe(true)
  })

  it('applies a stricter speed ceiling to walks than runs', () => {
    const prev = p(51.5, -0.12, 1000)
    // ~8.9 m/s: plausible as a running outlier, impossible as a walk.
    const next = p(51.50008, -0.12, 2000)
    expect(acceptPoint(prev, next, 'run').accept).toBe(true)
    expect(acceptPoint(prev, next, 'walk').accept).toBe(false)
  })

  it('rejects fixes arriving less than a second apart', () => {
    const prev = p(51.5, -0.12, 1000)
    const decision = acceptPoint(prev, p(51.50001, -0.12, 1200), 'run')
    expect(decision.accept).toBe(false)
    expect(decision.reason).toBe('too_soon')
  })

  it('rejects a point that goes backwards in time', () => {
    const prev = p(51.5, -0.12, 5000)
    expect(acceptPoint(prev, p(51.50001, -0.12, 4000), 'run').reason).toBe('duplicate')
  })
})

describe('elevationTotals', () => {
  it('ignores jitter below the noise threshold', () => {
    const route = [
      p(0, 0, 0, { elevation: 100 }),
      p(0, 0, 1000, { elevation: 101 }),
      p(0, 0, 2000, { elevation: 100 }),
      p(0, 0, 3000, { elevation: 101.5 }),
    ]
    // Every change is under 3 m, so none of it is real climb.
    expect(elevationTotals(route)).toEqual({ gainM: 0, lossM: 0 })
  })

  it('accumulates gain and loss past the threshold', () => {
    const route = [
      p(0, 0, 0, { elevation: 100 }),
      p(0, 0, 1000, { elevation: 110 }),
      p(0, 0, 2000, { elevation: 95 }),
    ]
    const { gainM, lossM } = elevationTotals(route)
    expect(gainM).toBeCloseTo(10)
    expect(lossM).toBeCloseTo(15)
  })

  it('returns zeros when no elevation is present', () => {
    expect(elevationTotals([p(0, 0, 0), p(0, 0, 1000)])).toEqual({ gainM: 0, lossM: 0 })
  })
})

describe('gradeBetween', () => {
  it('is zero without elevation data', () => {
    expect(gradeBetween(p(0, 0, 0), p(0.0001, 0, 1000))).toBe(0)
  })

  it('clamps implausible grades so a bad altitude reading cannot dominate', () => {
    const a = p(0, 0, 0, { elevation: 0 })
    const b = p(0.00005, 0, 1000, { elevation: 500 })
    expect(gradeBetween(a, b)).toBe(0.3)
  })
})

describe('routeDistanceKm / cumulativeDistanceKm', () => {
  it('starts cumulative distance at zero and increases monotonically', () => {
    const route = [p(51.5, -0.12, 0), p(51.501, -0.12, 1000), p(51.502, -0.12, 2000)]
    const cum = cumulativeDistanceKm(route)
    expect(cum[0]).toBe(0)
    expect(cum[1]).toBeGreaterThan(0)
    expect(cum[2]).toBeGreaterThan(cum[1])
    expect(cum[2]).toBeCloseTo(routeDistanceKm(route), 6)
  })
})
