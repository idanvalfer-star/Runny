import type { HrSample } from '../types'
import { timeInZones } from '../lib/hrZones'
import { formatDuration } from '../lib/units'

const ZONE_COLORS = [
  'bg-sky-400',
  'bg-emerald-400',
  'bg-lime-400',
  'bg-amber-400',
  'bg-red-400',
]

export function HrZoneBars({
  samples,
  maxHr,
}: {
  samples: HrSample[]
  maxHr: number
}) {
  const zones = timeInZones(samples, maxHr)
  const anyTime = zones.some((z) => z.seconds > 0)

  if (!anyTime) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Not enough heart rate data to break into zones.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {[...zones].reverse().map(({ zone, seconds, fraction }) => (
        <div key={zone.index} className="flex items-center gap-3">
          <div className="w-16 shrink-0">
            <div className="text-xs font-semibold">Z{zone.index}</div>
            <div className="tnum text-[10px] text-slate-500 dark:text-slate-400">
              {zone.minBpm}–{zone.maxBpm}
            </div>
          </div>
          <div className="h-5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full ${ZONE_COLORS[zone.index - 1]}`}
              style={{ width: `${Math.max(fraction * 100, seconds > 0 ? 2 : 0)}%` }}
            />
          </div>
          <div className="tnum w-16 shrink-0 text-right text-xs text-slate-600 dark:text-slate-300">
            {formatDuration(seconds)}
          </div>
        </div>
      ))}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Zones calculated from a max heart rate of {maxHr} bpm. You can change that in
        Settings.
      </p>
    </div>
  )
}
