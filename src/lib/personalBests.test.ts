import { describe, expect, it } from 'vitest'
import { fastestWindowSec, newBestsFor, personalBests } from './personalBests'
import { computeSplits, timeAtDistance } from './splits'
import { cumulativeDistanceKm } from './geo'
import type { Activity, RoutePoint } from '../types'

/** Must match the earth radius `haversineM` uses, or generated routes come out
 *  fractionally short and a "5000 m" route fails to reach a 5 km window. */
const METRES_PER_DEG_LAT = (Math.PI * 6_371_008.8) / 180

/**
 * Build a straight route from a list of segments, each with a length in metres
 * and a speed in m/s. Lets a test place a deliberately fast stretch inside an
 * otherwise slow run.
 */
function routeFromSegments(
  segments: Array<{ metres: number; speedMps: number }>,
  startTs = 1_700_000_000_000,
): RoutePoint[] {
  const route: RoutePoint[] = [{ lat: 51.5, lng: -0.12, timestamp: startTs }]
  let lat = 51.5
  let ts = startTs
  for (const seg of segments) {
    const steps = Math.max(1, Math.round(seg.metres / 10))
    const stepM = seg.metres / steps
    const stepMs = (stepM / seg.speedMps) * 1000
    for (let i = 0; i < steps; i++) {
      lat += stepM / METRES_PER_DEG_LAT
      ts += stepMs
      route.push({ lat, lng: -0.12, timestamp: ts })
    }
  }
  return route
}

function activityFrom(route: RoutePoint[], overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'a1',
    type: 'run',
    startTime: route[0].timestamp,
    endTime: route[route.length - 1].timestamp,
    movingTimeSec: (route[route.length - 1].timestamp - route[0].timestamp) / 1000,
    elapsedTimeSec: (route[route.length - 1].timestamp - route[0].timestamp) / 1000,
    distanceKm: 0,
    route,
    hrSamples: [],
    avgPaceSecPerKm: 0,
    caloriesBurned: 0,
    elevationGainM: 0,
    elevationLossM: 0,
    splits: [],
    ...overrides,
  }
}

describe('timeAtDistance', () => {
  it('interpolates inside the segment that straddles the target', () => {
    // 100 m at exactly 1 m/s, sampled every 10 m.
    const route = routeFromSegments([{ metres: 100, speedMps: 1 }])
    const cum = cumulativeDistanceKm(route)
    const t = timeAtDistance(route, cum, 0.055)!
    // 55 m at 1 m/s is 55 s in.
    expect((t - route[0].timestamp) / 1000).toBeCloseTo(55, 0)
  })

  it('returns undefined past the end of the route', () => {
    const route = routeFromSegments([{ metres: 100, speedMps: 3 }])
    expect(timeAtDistance(route, cumulativeDistanceKm(route), 5)).toBeUndefined()
  })
})

describe('fastestWindowSec', () => {
  it('finds a fast stretch buried inside a slower run', () => {
    // 2 km slow (2 m/s), then 1 km fast (5 m/s), then 2 km slow again.
    const route = routeFromSegments([
      { metres: 2000, speedMps: 2 },
      { metres: 1000, speedMps: 5 },
      { metres: 2000, speedMps: 2 },
    ])
    const best1k = fastestWindowSec(route, 1)!
    // The fast kilometre takes 200 s; a slow one takes 500 s.
    expect(best1k).toBeGreaterThan(190)
    expect(best1k).toBeLessThan(215)
  })

  it('returns undefined when the route is shorter than the target', () => {
    const route = routeFromSegments([{ metres: 500, speedMps: 3 }])
    expect(fastestWindowSec(route, 1)).toBeUndefined()
  })

  it('finds a slower time over a longer window', () => {
    const route = routeFromSegments([
      { metres: 1000, speedMps: 5 },
      { metres: 4000, speedMps: 2.5 },
    ])
    const k1 = fastestWindowSec(route, 1)!
    const k5 = fastestWindowSec(route, 5)!
    expect(k5 / 5).toBeGreaterThan(k1)
  })
})

describe('personalBests', () => {
  it('reports the best across multiple activities', () => {
    const slow = activityFrom(routeFromSegments([{ metres: 5000, speedMps: 2.5 }]), {
      id: 'slow',
    })
    const fast = activityFrom(routeFromSegments([{ metres: 5000, speedMps: 3.5 }]), {
      id: 'fast',
    })
    const bests = personalBests([slow, fast])
    const best5k = bests.find((b) => b.distance.key === '5k')!
    expect(best5k.activityId).toBe('fast')
  })

  it('excludes walks so a walking best cannot masquerade as a run PB', () => {
    const walk = activityFrom(routeFromSegments([{ metres: 5000, speedMps: 1.4 }]), {
      id: 'walk',
      type: 'walk',
    })
    expect(personalBests([walk])).toHaveLength(0)
  })

  it('returns nothing when no activity reaches the shortest distance', () => {
    const short = activityFrom(routeFromSegments([{ metres: 400, speedMps: 3 }]))
    expect(personalBests([short])).toHaveLength(0)
  })
})

describe('newBestsFor', () => {
  it('flags a distance where this activity beat everything prior', () => {
    const prior = activityFrom(routeFromSegments([{ metres: 3000, speedMps: 2.5 }]), {
      id: 'prior',
    })
    const faster = activityFrom(routeFromSegments([{ metres: 3000, speedMps: 4 }]), {
      id: 'faster',
    })
    const bests = newBestsFor(faster, [prior])
    expect(bests.map((b) => b.key)).toContain('1k')
  })

  it('flags nothing when the activity was slower than a prior one', () => {
    const prior = activityFrom(routeFromSegments([{ metres: 3000, speedMps: 4 }]), {
      id: 'prior',
    })
    const slower = activityFrom(routeFromSegments([{ metres: 3000, speedMps: 2.5 }]), {
      id: 'slower',
    })
    expect(newBestsFor(slower, [prior])).toHaveLength(0)
  })
})

describe('computeSplits', () => {
  it('produces one split per kilometre plus a partial tail', () => {
    const route = routeFromSegments([{ metres: 2500, speedMps: 2.5 }])
    const splits = computeSplits(route, [])
    expect(splits).toHaveLength(3)
    expect(splits[0].distanceKm).toBeCloseTo(1, 3)
    expect(splits[2].distanceKm).toBeCloseTo(0.5, 1)
  })

  it('reflects a pace change between splits', () => {
    const route = routeFromSegments([
      { metres: 1000, speedMps: 2 },
      { metres: 1000, speedMps: 4 },
    ])
    const splits = computeSplits(route, [])
    expect(splits[0].paceSecPerKm).toBeGreaterThan(splits[1].paceSecPerKm)
  })

  it('drops a negligible tail rather than showing a 5 m split', () => {
    const route = routeFromSegments([{ metres: 1010, speedMps: 3 }])
    expect(computeSplits(route, [])).toHaveLength(1)
  })

  it('averages heart rate within each split window', () => {
    const route = routeFromSegments([{ metres: 2000, speedMps: 2.5 }])
    const start = route[0].timestamp
    const end = route[route.length - 1].timestamp
    const hrSamples = []
    for (let t = start; t <= end; t += 1000) {
      // Low in the first half, high in the second.
      hrSamples.push({ timestamp: t, bpm: t < (start + end) / 2 ? 130 : 170 })
    }
    const splits = computeSplits(route, hrSamples)
    expect(splits[0].avgHr!).toBeLessThan(splits[1].avgHr!)
  })
})
