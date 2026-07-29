import type { HrSample, RoutePoint, Split } from '../types'
import { cumulativeDistanceKm } from './geo'
import { averageHrBetween } from './hrZones'
import { KM_PER_MILE } from './units'
import type { Units } from './units'

/**
 * Timestamp at an exact cumulative distance, linearly interpolated inside the
 * segment that straddles it. Without this, a "1 km split" is really "the split
 * at whichever GPS fix happened to land past 1 km", which drifts by seconds.
 */
export function timeAtDistance(
  route: RoutePoint[],
  cumKm: number[],
  targetKm: number,
): number | undefined {
  if (route.length === 0) return undefined
  if (targetKm <= 0) return route[0].timestamp
  const last = cumKm[cumKm.length - 1]
  if (targetKm > last) return undefined

  for (let i = 1; i < cumKm.length; i++) {
    if (cumKm[i] >= targetKm) {
      const segKm = cumKm[i] - cumKm[i - 1]
      const t0 = route[i - 1].timestamp
      const t1 = route[i].timestamp
      if (segKm <= 0) return t1
      const fraction = (targetKm - cumKm[i - 1]) / segKm
      return t0 + (t1 - t0) * fraction
    }
  }
  return route[route.length - 1].timestamp
}

/** Elevation interpolated the same way, so split climb lines up with split time. */
function elevationAtIndexRange(
  route: RoutePoint[],
  fromKm: number,
  toKm: number,
  cumKm: number[],
): number | undefined {
  let gain = 0
  let seen = false
  let reference: number | undefined
  for (let i = 0; i < route.length; i++) {
    if (cumKm[i] < fromKm || cumKm[i] > toKm) continue
    const e = route[i].elevation
    if (e === undefined) continue
    seen = true
    if (reference === undefined) {
      reference = e
      continue
    }
    const delta = e - reference
    if (Math.abs(delta) >= 3) {
      if (delta > 0) gain += delta
      reference = e
    }
  }
  return seen ? gain : undefined
}

/**
 * Split every full unit of distance, plus a final partial split so the last
 * few hundred metres are not silently dropped.
 */
export function computeSplits(
  route: RoutePoint[],
  hrSamples: HrSample[],
  units: Units = 'km',
): Split[] {
  if (route.length < 2) return []
  const unitKm = units === 'mi' ? KM_PER_MILE : 1
  const cumKm = cumulativeDistanceKm(route)
  const totalKm = cumKm[cumKm.length - 1]
  const splits: Split[] = []

  let index = 1
  let prevKm = 0
  let prevTs = route[0].timestamp

  while (prevKm + unitKm <= totalKm + 1e-9) {
    const targetKm = prevKm + unitKm
    const ts = timeAtDistance(route, cumKm, targetKm)
    if (ts === undefined) break
    const durationSec = (ts - prevTs) / 1000
    splits.push({
      index,
      distanceKm: unitKm,
      durationSec,
      paceSecPerKm: durationSec / unitKm,
      avgHr: averageHrBetween(hrSamples, prevTs, ts),
      elevationGainM: elevationAtIndexRange(route, prevKm, targetKm, cumKm),
    })
    index++
    prevKm = targetKm
    prevTs = ts
  }

  const remainderKm = totalKm - prevKm
  // Ignore a sliver — a 5 m tail is noise, not a split worth showing.
  if (remainderKm > 0.05) {
    const endTs = route[route.length - 1].timestamp
    const durationSec = (endTs - prevTs) / 1000
    splits.push({
      index,
      distanceKm: remainderKm,
      durationSec,
      paceSecPerKm: durationSec / remainderKm,
      avgHr: averageHrBetween(hrSamples, prevTs, endTs),
      elevationGainM: elevationAtIndexRange(route, prevKm, totalKm, cumKm),
    })
  }

  return splits
}

/** Fastest full split, ignoring any partial tail (which is always "fastest"). */
export function bestFullSplitPace(splits: Split[]): number | undefined {
  const full = splits.filter((s) => s.distanceKm > 0.9 * splits[0]?.distanceKm)
  if (full.length === 0) return undefined
  return full.reduce(
    (best, s) => Math.min(best, s.paceSecPerKm),
    Number.POSITIVE_INFINITY,
  )
}
