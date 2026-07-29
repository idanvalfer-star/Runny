import type { Activity, RoutePoint } from '../types'
import { cumulativeDistanceKm } from './geo'
import { timeAtDistance } from './splits'

export interface PbDistance {
  key: string
  label: string
  km: number
}

export const PB_DISTANCES: PbDistance[] = [
  { key: '1k', label: '1K', km: 1 },
  { key: '5k', label: '5K', km: 5 },
  { key: '10k', label: '10K', km: 10 },
  { key: 'half', label: 'Half marathon', km: 21.0975 },
  { key: 'full', label: 'Marathon', km: 42.195 },
]

/**
 * Fastest continuous stretch of `targetKm` anywhere inside a route, in seconds.
 *
 * This is a rolling window rather than "did the run total this distance", so a
 * quick 5K buried in the middle of a 10K still counts as a 5K best. Both ends
 * of the window are interpolated, so the answer does not depend on where GPS
 * fixes happened to land.
 */
export function fastestWindowSec(
  route: RoutePoint[],
  targetKm: number,
): number | undefined {
  if (route.length < 2) return undefined
  const cumKm = cumulativeDistanceKm(route)
  const totalKm = cumKm[cumKm.length - 1]
  if (totalKm < targetKm) return undefined

  let best: number | undefined
  for (let i = 0; i < route.length; i++) {
    const endKm = cumKm[i] + targetKm
    if (endKm > totalKm) break
    const endTs = timeAtDistance(route, cumKm, endKm)
    if (endTs === undefined) continue
    const sec = (endTs - route[i].timestamp) / 1000
    if (sec > 0 && (best === undefined || sec < best)) best = sec
  }
  return best
}

export interface PersonalBest {
  distance: PbDistance
  timeSec: number
  activityId: string
  date: number
  paceSecPerKm: number
}

/**
 * Best effort at each distance across all logged activities. Walks are excluded
 * — a walking "5K PB" next to running bests would be misleading.
 */
export function personalBests(activities: Activity[]): PersonalBest[] {
  const out: PersonalBest[] = []
  for (const distance of PB_DISTANCES) {
    let best: PersonalBest | undefined
    for (const activity of activities) {
      if (activity.type !== 'run') continue
      const sec = fastestWindowSec(activity.route, distance.km)
      if (sec === undefined) continue
      if (!best || sec < best.timeSec) {
        best = {
          distance,
          timeSec: sec,
          activityId: activity.id,
          date: activity.startTime,
          paceSecPerKm: sec / distance.km,
        }
      }
    }
    if (best) out.push(best)
  }
  return out
}

/**
 * Which distances this activity set a new best at, given everything logged
 * before it. Used for the post-run takeaway line.
 */
export function newBestsFor(
  activity: Activity,
  priorActivities: Activity[],
): PbDistance[] {
  if (activity.type !== 'run') return []
  const priorBests = personalBests(
    priorActivities.filter((a) => a.id !== activity.id),
  )
  const priorByKey = new Map(priorBests.map((b) => [b.distance.key, b.timeSec]))

  const out: PbDistance[] = []
  for (const distance of PB_DISTANCES) {
    const sec = fastestWindowSec(activity.route, distance.km)
    if (sec === undefined) continue
    const prior = priorByKey.get(distance.key)
    if (prior === undefined || sec < prior) out.push(distance)
  }
  return out
}
