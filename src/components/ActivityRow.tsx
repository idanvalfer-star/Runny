import { Link } from 'react-router-dom'
import type { Activity } from '../types'
import type { Units } from '../lib/units'
import { distanceLabel, formatDistance, formatDuration, formatPace, paceLabel } from '../lib/units'
import { formatDateTime } from '../lib/dates'
import { Pill } from './ui'

export function ActivityRow({
  activity,
  units,
}: {
  activity: Activity
  units: Units
}) {
  return (
    <Link
      to={`/activity/${activity.id}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/70 transition active:scale-[0.99] dark:bg-slate-900 dark:ring-slate-800"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg dark:bg-brand-900/50"
        aria-hidden
      >
        {activity.type === 'run' ? '🏃' : '🚶'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="tnum font-semibold">
            {formatDistance(activity.distanceKm, units)} {distanceLabel(units)}
          </span>
          <span className="tnum text-sm text-slate-500 dark:text-slate-400">
            {formatDuration(activity.movingTimeSec)}
          </span>
          <span className="tnum text-sm text-slate-500 dark:text-slate-400">
            {formatPace(activity.avgPaceSecPerKm, units)}
            {paceLabel(units)}
          </span>
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
          {formatDateTime(activity.startTime)}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {activity.avgHr && <Pill>♥ {activity.avgHr}</Pill>}
        {activity.painReported && <Pill tone="danger">Pain</Pill>}
      </div>
    </Link>
  )
}
