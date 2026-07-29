import type { HrSample } from '../types'

export interface HrZone {
  index: 1 | 2 | 3 | 4 | 5
  name: string
  description: string
  minBpm: number
  maxBpm: number
  /** Fraction of max HR the zone starts at, for display. */
  minPct: number
  maxPct: number
}

const ZONE_DEFS: Array<{
  index: 1 | 2 | 3 | 4 | 5
  name: string
  description: string
  minPct: number
  maxPct: number
}> = [
  { index: 1, name: 'Zone 1', description: 'Very easy — recovery', minPct: 0.5, maxPct: 0.6 },
  { index: 2, name: 'Zone 2', description: 'Easy — aerobic base', minPct: 0.6, maxPct: 0.7 },
  { index: 3, name: 'Zone 3', description: 'Steady — moderate', minPct: 0.7, maxPct: 0.8 },
  { index: 4, name: 'Zone 4', description: 'Hard — threshold', minPct: 0.8, maxPct: 0.9 },
  { index: 5, name: 'Zone 5', description: 'Very hard — max effort', minPct: 0.9, maxPct: 1.0 },
]

/** 220 - age. A rough estimate with real scatter between people, which is why
 *  the profile keeps it editable and flags when it was estimated. */
export function estimateMaxHr(age: number): number {
  return Math.round(220 - age)
}

export function hrZones(maxHr: number): HrZone[] {
  return ZONE_DEFS.map((z) => ({
    ...z,
    minBpm: Math.round(maxHr * z.minPct),
    maxBpm: Math.round(maxHr * z.maxPct),
  }))
}

export function zoneForBpm(bpm: number, maxHr: number): 1 | 2 | 3 | 4 | 5 | 0 {
  const pct = bpm / maxHr
  if (pct < 0.5) return 0
  if (pct < 0.6) return 1
  if (pct < 0.7) return 2
  if (pct < 0.8) return 3
  if (pct < 0.9) return 4
  return 5
}

export interface ZoneTime {
  zone: HrZone
  seconds: number
  fraction: number
}

/**
 * Time in each zone, integrating the gap between samples rather than counting
 * sample hits — HR monitors do not sample at a fixed rate, and a dropout would
 * otherwise silently reweight the result.
 */
export function timeInZones(samples: HrSample[], maxHr: number): ZoneTime[] {
  const zones = hrZones(maxHr)
  const seconds = new Map<number, number>()
  let total = 0

  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timestamp - samples[i - 1].timestamp) / 1000
    // A long gap means the strap dropped out, not that HR held steady.
    if (dt <= 0 || dt > 30) continue
    const zone = zoneForBpm(samples[i - 1].bpm, maxHr)
    if (zone === 0) continue
    seconds.set(zone, (seconds.get(zone) ?? 0) + dt)
    total += dt
  }

  return zones.map((zone) => {
    const s = seconds.get(zone.index) ?? 0
    return { zone, seconds: s, fraction: total > 0 ? s / total : 0 }
  })
}

export function averageHr(samples: HrSample[]): number | undefined {
  if (samples.length === 0) return undefined
  const sum = samples.reduce((acc, s) => acc + s.bpm, 0)
  return Math.round(sum / samples.length)
}

export function maxHrOf(samples: HrSample[]): number | undefined {
  if (samples.length === 0) return undefined
  return samples.reduce((acc, s) => Math.max(acc, s.bpm), 0)
}

/** Mean HR over a time window, used for per-split heart rate. */
export function averageHrBetween(
  samples: HrSample[],
  fromTs: number,
  toTs: number,
): number | undefined {
  const inWindow = samples.filter(
    (s) => s.timestamp >= fromTs && s.timestamp <= toTs,
  )
  return averageHr(inWindow)
}
