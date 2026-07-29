import type { ActivityType, RoutePoint } from '../types'

const EARTH_RADIUS_M = 6371008.8

/** Great-circle distance between two coordinates, in metres. */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const lat1 = a.lat * toRad
  const lat2 = b.lat * toRad

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Upper bound on plausible speed, in m/s. Anything faster is GPS noise, not
 *  the runner: a world-class sprinter tops out near 12 m/s and only briefly. */
const MAX_SPEED_MPS: Record<ActivityType, number> = {
  run: 40 / 3.6, // ~11.1 m/s
  walk: 15 / 3.6, // ~4.2 m/s
}

/** Fixes worse than this are too vague to measure distance with. */
export const MAX_ACCURACY_M = 30

/** Minimum gap between accepted fixes. Sub-second deltas make speed estimates
 *  explode on tiny position jitter. */
const MIN_DT_SEC = 1

export type RejectReason =
  | 'accuracy'
  | 'too_soon'
  | 'impossible_speed'
  | 'duplicate'

export interface PointDecision {
  accept: boolean
  reason?: RejectReason
  /** Distance from the previous accepted point, in metres. Only when accepted. */
  distanceM?: number
  speedMps?: number
}

/**
 * Decide whether a new GPS fix should count toward the route.
 *
 * The first point of a run is always accepted if its accuracy is usable — there
 * is nothing yet to compare it against.
 */
export function acceptPoint(
  prev: RoutePoint | undefined,
  next: RoutePoint,
  type: ActivityType,
): PointDecision {
  if (next.accuracy !== undefined && next.accuracy > MAX_ACCURACY_M) {
    return { accept: false, reason: 'accuracy' }
  }
  if (!prev) return { accept: true, distanceM: 0, speedMps: 0 }

  const dtSec = (next.timestamp - prev.timestamp) / 1000
  if (dtSec <= 0) return { accept: false, reason: 'duplicate' }
  if (dtSec < MIN_DT_SEC) return { accept: false, reason: 'too_soon' }

  const distanceM = haversineM(prev, next)
  const speedMps = distanceM / dtSec
  if (speedMps > MAX_SPEED_MPS[type]) {
    return { accept: false, reason: 'impossible_speed', distanceM, speedMps }
  }
  return { accept: true, distanceM, speedMps }
}

/** Total route distance in kilometres, assuming points are already filtered. */
export function routeDistanceKm(route: RoutePoint[]): number {
  let m = 0
  for (let i = 1; i < route.length; i++) m += haversineM(route[i - 1], route[i])
  return m / 1000
}

/** Ignore elevation changes smaller than this. Consumer-grade altimetry drifts
 *  by a metre or two constantly; summing raw deltas invents hundreds of metres
 *  of climb on a flat run. */
const ELEVATION_THRESHOLD_M = 3

export interface ElevationTotals {
  gainM: number
  lossM: number
}

export function elevationTotals(route: RoutePoint[]): ElevationTotals {
  let gainM = 0
  let lossM = 0
  let reference: number | undefined

  for (const p of route) {
    if (p.elevation === undefined) continue
    if (reference === undefined) {
      reference = p.elevation
      continue
    }
    const delta = p.elevation - reference
    if (delta >= ELEVATION_THRESHOLD_M) {
      gainM += delta
      reference = p.elevation
    } else if (delta <= -ELEVATION_THRESHOLD_M) {
      lossM += -delta
      reference = p.elevation
    }
  }
  return { gainM, lossM }
}

/** Fractional grade (rise/run) between two points, clamped to a sane range so a
 *  bad altitude reading cannot dominate the calorie estimate. */
export function gradeBetween(a: RoutePoint, b: RoutePoint): number {
  if (a.elevation === undefined || b.elevation === undefined) return 0
  const runM = haversineM(a, b)
  if (runM < 1) return 0
  const grade = (b.elevation - a.elevation) / runM
  return Math.max(-0.3, Math.min(0.3, grade))
}

/** Cumulative distance in km at each route point; `out[0]` is always 0. */
export function cumulativeDistanceKm(route: RoutePoint[]): number[] {
  const out = new Array<number>(route.length)
  let m = 0
  for (let i = 0; i < route.length; i++) {
    if (i > 0) m += haversineM(route[i - 1], route[i])
    out[i] = m / 1000
  }
  return out
}

/** Bounding box for fitting a map to a route. */
export function routeBounds(
  route: RoutePoint[],
): [[number, number], [number, number]] | undefined {
  if (route.length === 0) return undefined
  let minLat = route[0].lat
  let maxLat = route[0].lat
  let minLng = route[0].lng
  let maxLng = route[0].lng
  for (const p of route) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}
