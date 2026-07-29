import type { ActivityType, RoutePoint } from '../types'
import { gradeBetween, haversineM } from './geo'

/**
 * ACSM metabolic equations. These give VO2 in ml/kg/min from speed and grade,
 * which is what makes the estimate respond to pace and hills instead of being a
 * flat kcal-per-km number.
 *
 *   running: VO2 = 0.2 * s + 0.9 * s * g + 3.5
 *   walking: VO2 = 0.1 * s + 1.8 * s * g + 3.5
 *
 * where s is speed in m/min and g is fractional grade.
 */
export function vo2MlKgMin(
  speedMPerMin: number,
  grade: number,
  type: ActivityType,
): number {
  const resting = 3.5
  if (type === 'walk') {
    return 0.1 * speedMPerMin + 1.8 * speedMPerMin * grade + resting
  }
  return 0.2 * speedMPerMin + 0.9 * speedMPerMin * grade + resting
}

export function metsFromVo2(vo2: number): number {
  return vo2 / 3.5
}

/** kcal burned over a span, from METs and body weight. */
export function kcalFromMets(
  mets: number,
  weightKg: number,
  durationMin: number,
): number {
  return (mets * 3.5 * weightKg) / 200 * durationMin
}

/**
 * Integrate calories segment by segment along the route, so a fast downhill
 * kilometre and a slow uphill one are not treated the same.
 */
export function caloriesForRoute(
  route: RoutePoint[],
  type: ActivityType,
  weightKg: number,
): number {
  let kcal = 0
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    const durationMin = (b.timestamp - a.timestamp) / 60000
    if (durationMin <= 0) continue
    const distanceM = haversineM(a, b)
    const speedMPerMin = distanceM / durationMin
    const vo2 = vo2MlKgMin(speedMPerMin, gradeBetween(a, b), type)
    kcal += kcalFromMets(metsFromVo2(vo2), weightKg, durationMin)
  }
  return kcal
}

/** Live estimate during a run, where only current speed is known. */
export function caloriesPerMinute(
  speedMps: number,
  type: ActivityType,
  weightKg: number,
): number {
  const vo2 = vo2MlKgMin(speedMps * 60, 0, type)
  return kcalFromMets(metsFromVo2(vo2), weightKg, 1)
}
