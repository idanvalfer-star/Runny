import type { Activity, ActivityType, HrSample, RoutePoint } from '../types'
import { caloriesForRoute } from './calories'
import { elevationTotals, routeDistanceKm } from './geo'
import { averageHr, maxHrOf } from './hrZones'
import { bestFullSplitPace, computeSplits } from './splits'
import { newId } from '../db/repo'

export interface BuildActivityInput {
  id?: string
  type: ActivityType
  startTime: number
  endTime: number
  route: RoutePoint[]
  hrSamples: HrSample[]
  movingTimeSec: number
  elapsedTimeSec: number
  weightKg: number
  discardedPoints?: number
  planSessionId?: string
  source?: Activity['source']
}

/**
 * Turn a finished session into a stored Activity. All derived numbers are
 * computed once here so every screen reads the same values.
 */
export function buildActivity(input: BuildActivityInput): Activity {
  const distanceKm = routeDistanceKm(input.route)
  const splits = computeSplits(input.route, input.hrSamples)
  const { gainM, lossM } = elevationTotals(input.route)

  // Pace uses moving time: standing at a crossing should not make you slower.
  const paceBasisSec =
    input.movingTimeSec > 0 ? input.movingTimeSec : input.elapsedTimeSec
  const avgPaceSecPerKm = distanceKm > 0 ? paceBasisSec / distanceKm : 0

  return {
    id: input.id ?? newId(),
    type: input.type,
    startTime: input.startTime,
    endTime: input.endTime,
    movingTimeSec: input.movingTimeSec,
    elapsedTimeSec: input.elapsedTimeSec,
    distanceKm,
    route: input.route,
    hrSamples: input.hrSamples,
    avgPaceSecPerKm,
    bestPaceSecPerKm: bestFullSplitPace(splits),
    avgHr: averageHr(input.hrSamples),
    maxHr: maxHrOf(input.hrSamples),
    caloriesBurned: caloriesForRoute(input.route, input.type, input.weightKg),
    elevationGainM: gainM,
    elevationLossM: lossM,
    splits,
    discardedPoints: input.discardedPoints,
    planSessionId: input.planSessionId,
    source: input.source ?? 'gps',
  }
}
