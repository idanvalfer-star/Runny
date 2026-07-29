import { describe, expect, it } from 'vitest'
import {
  paceZonesFromVdot,
  pctMaxForDuration,
  predictRaceTimeSec,
  vdotFromPerformance,
  velocityForVo2,
  vo2AtVelocity,
} from './vdot'

describe('Daniels equations', () => {
  it('inverts vo2AtVelocity', () => {
    for (const v of [150, 200, 250, 300, 350]) {
      expect(velocityForVo2(vo2AtVelocity(v))).toBeCloseTo(v, 3)
    }
  })

  it('gives a lower sustainable fraction of VO2max for longer efforts', () => {
    expect(pctMaxForDuration(10)).toBeGreaterThan(pctMaxForDuration(60))
    expect(pctMaxForDuration(60)).toBeGreaterThan(pctMaxForDuration(180))
  })

  it('crosses 100% of VO2max around a 12-minute effort', () => {
    // The curve exceeds 1.0 at very short durations — that is the anaerobic
    // contribution, not a bug — and drops below it as efforts lengthen.
    expect(pctMaxForDuration(4)).toBeGreaterThan(1)
    expect(pctMaxForDuration(12)).toBeGreaterThan(0.97)
    expect(pctMaxForDuration(12)).toBeLessThan(1.02)
    expect(pctMaxForDuration(20)).toBeLessThan(1)
  })
})

describe('vdotFromPerformance', () => {
  // Anchored against Daniels' published tables.
  it('scores a 20:00 5K at about VDOT 50', () => {
    const vdot = vdotFromPerformance({ distanceKm: 5, timeSec: 20 * 60 })
    expect(vdot).toBeGreaterThan(48)
    expect(vdot).toBeLessThan(52)
  })

  it('scores a 30:00 5K around VDOT 30', () => {
    const vdot = vdotFromPerformance({ distanceKm: 5, timeSec: 30 * 60 })
    expect(vdot).toBeGreaterThan(28)
    expect(vdot).toBeLessThan(34)
  })

  it('scores a 3:00 marathon in the high 50s', () => {
    const vdot = vdotFromPerformance({ distanceKm: 42.195, timeSec: 3 * 3600 })
    expect(vdot).toBeGreaterThan(52)
    expect(vdot).toBeLessThan(60)
  })

  it('rates a faster time at the same distance higher', () => {
    const fast = vdotFromPerformance({ distanceKm: 10, timeSec: 40 * 60 })!
    const slow = vdotFromPerformance({ distanceKm: 10, timeSec: 55 * 60 })!
    expect(fast).toBeGreaterThan(slow)
  })

  it('rejects nonsense input', () => {
    expect(vdotFromPerformance({ distanceKm: 0, timeSec: 100 })).toBeUndefined()
    expect(vdotFromPerformance({ distanceKm: 5, timeSec: 0 })).toBeUndefined()
  })
})

describe('paceZonesFromVdot', () => {
  const zones = paceZonesFromVdot(50)

  it('orders zones from slowest to fastest', () => {
    // Higher sec/km means slower, so easy should be the largest number.
    expect(zones.easy.minSecPerKm).toBeGreaterThan(zones.marathon.minSecPerKm)
    expect(zones.marathon.minSecPerKm).toBeGreaterThan(zones.threshold.minSecPerKm)
    expect(zones.threshold.minSecPerKm).toBeGreaterThan(zones.interval.minSecPerKm)
    expect(zones.interval.minSecPerKm).toBeGreaterThan(zones.repetition.minSecPerKm)
  })

  it('keeps min faster than max within each zone', () => {
    for (const range of Object.values(zones)) {
      expect(range.minSecPerKm).toBeLessThan(range.maxSecPerKm)
    }
  })

  it('puts threshold pace for VDOT 50 near 4:15/km', () => {
    // Daniels' T pace for VDOT 50 is about 4:15/km (255 s).
    expect(zones.threshold.minSecPerKm).toBeGreaterThan(245)
    expect(zones.threshold.minSecPerKm).toBeLessThan(265)
  })

  it('keeps easy pace comfortably slower than threshold', () => {
    // The whole point of the easy zone: it must not drift into tempo.
    expect(zones.easy.minSecPerKm).toBeGreaterThan(zones.threshold.maxSecPerKm)
  })

  it('gives a fitter runner faster paces across the board', () => {
    const fitter = paceZonesFromVdot(60)
    expect(fitter.easy.minSecPerKm).toBeLessThan(zones.easy.minSecPerKm)
    expect(fitter.interval.minSecPerKm).toBeLessThan(zones.interval.minSecPerKm)
  })
})

describe('predictRaceTimeSec', () => {
  it('round-trips a performance back to a similar VDOT', () => {
    const predicted = predictRaceTimeSec(50, 5)
    const vdot = vdotFromPerformance({ distanceKm: 5, timeSec: predicted })!
    expect(vdot).toBeGreaterThan(48.5)
    expect(vdot).toBeLessThan(51.5)
  })

  it('predicts longer times for longer distances', () => {
    expect(predictRaceTimeSec(50, 10)).toBeGreaterThan(predictRaceTimeSec(50, 5))
    expect(predictRaceTimeSec(50, 42.195)).toBeGreaterThan(predictRaceTimeSec(50, 21.0975))
  })
})
