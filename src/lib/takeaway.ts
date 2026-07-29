import type { Activity } from '../types'
import { newBestsFor } from './personalBests'
import { formatPace } from './units'
import type { Units } from './units'

/**
 * One line about the run, picked from a priority list so the message is always
 * the most interesting true thing rather than a generic "nice work".
 */
export function takeawayFor(
  activity: Activity,
  priorActivities: Activity[],
  units: Units = 'km',
): string {
  const unitWord = units === 'mi' ? 'mile' : 'km'
  const fullSplits = activity.splits.filter(
    (s, i, arr) => i < arr.length - 1 || Math.abs(s.distanceKm - arr[0]?.distanceKm) < 0.05,
  )

  // 1. A personal best beats everything else worth saying.
  const bests = newBestsFor(activity, priorActivities)
  if (bests.length > 0) {
    const label = bests[bests.length - 1].label
    return `New personal best at ${label} — that's your fastest yet.`
  }

  // 2. Negative split: the pacing outcome most runners are actually chasing.
  if (fullSplits.length >= 4) {
    const mid = Math.floor(fullSplits.length / 2)
    const firstHalf = fullSplits.slice(0, mid)
    const secondHalf = fullSplits.slice(mid)
    const avg = (xs: typeof fullSplits) =>
      xs.reduce((a, s) => a + s.paceSecPerKm, 0) / xs.length
    const firstAvg = avg(firstHalf)
    const secondAvg = avg(secondHalf)
    if (secondAvg < firstAvg - 5) {
      const fastest = fullSplits.reduce((b, s) =>
        s.paceSecPerKm < b.paceSecPerKm ? s : b,
      )
      return `Negative split — you finished faster than you started, and ${unitWord} ${fastest.index} was your quickest. That's well-judged pacing.`
    }
  }

  // 3. Consistency is worth naming; it is harder than it looks.
  if (fullSplits.length >= 3) {
    const paces = fullSplits.map((s) => s.paceSecPerKm)
    const mean = paces.reduce((a, p) => a + p, 0) / paces.length
    const spread = Math.max(...paces) - Math.min(...paces)
    if (spread < 15) {
      return `Remarkably even pacing — every ${unitWord} within 15 seconds of ${formatPace(mean, units)}.`
    }
    const fastest = fullSplits.reduce((b, s) =>
      s.paceSecPerKm < b.paceSecPerKm ? s : b,
    )
    return `Your fastest ${unitWord} was number ${fastest.index} at ${formatPace(fastest.paceSecPerKm, units)}.`
  }

  // 4. Nothing structural to say — acknowledge the session honestly.
  if (activity.distanceKm >= 0.1) {
    const verb = activity.type === 'walk' ? 'walk' : 'run'
    return `${activity.distanceKm.toFixed(2)} km logged — every ${verb} counts toward the base you're building.`
  }
  return 'Session logged.'
}
