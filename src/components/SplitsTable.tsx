import type { Split } from '../types'
import type { Units } from '../lib/units'
import { formatPace, paceLabel } from '../lib/units'

export function SplitsTable({ splits, units }: { splits: Split[]; units: Units }) {
  if (splits.length === 0) return null

  const fullSplits = splits.filter((s) => s.distanceKm >= splits[0].distanceKm * 0.95)
  const fastest = fullSplits.reduce(
    (best, s) => Math.min(best, s.paceSecPerKm),
    Number.POSITIVE_INFINITY,
  )
  const slowest = fullSplits.reduce((worst, s) => Math.max(worst, s.paceSecPerKm), 0)
  const range = slowest - fastest || 1
  const hasHr = splits.some((s) => s.avgHr !== undefined)

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
            <th className="px-3 py-2 font-medium">{units === 'mi' ? 'Mile' : 'Km'}</th>
            <th className="px-3 py-2 font-medium">Pace</th>
            {hasHr && <th className="px-3 py-2 font-medium">HR</th>}
            <th className="px-3 py-2 font-medium">Elev</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split) => {
            const partial = split.distanceKm < splits[0].distanceKm * 0.95
            // Bar length shows relative effort at a glance without a chart.
            const fill = partial
              ? 0
              : 1 - (split.paceSecPerKm - fastest) / range
            return (
              <tr
                key={split.index}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
              >
                <td className="tnum px-3 py-2 font-medium">
                  {split.index}
                  {partial && (
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      ({split.distanceKm.toFixed(2)})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="tnum w-14">
                      {formatPace(split.paceSecPerKm, units)}
                    </span>
                    <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 sm:block dark:bg-slate-800">
                      <span
                        className="block h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(4, fill * 100)}%` }}
                      />
                    </span>
                  </div>
                </td>
                {hasHr && (
                  <td className="tnum px-3 py-2 text-slate-600 dark:text-slate-300">
                    {split.avgHr ?? '—'}
                  </td>
                )}
                <td className="tnum px-3 py-2 text-slate-600 dark:text-slate-300">
                  {split.elevationGainM !== undefined
                    ? `+${Math.round(split.elevationGainM)}m`
                    : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
        Pace shown per {units === 'mi' ? 'mile' : 'kilometre'} ({paceLabel(units)}).
      </p>
    </div>
  )
}
