import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Activity } from '../types'
import type { Units } from '../lib/units'
import { formatPace, kmToDisplay, paceSecPerUnit, secPerUnitToSecPerKm } from '../lib/units'

/**
 * Pace and elevation against distance. Pace is inverted on the axis so a faster
 * segment reads as a higher point, which is how runners expect to see it.
 */
export function PaceChart({ activity, units }: { activity: Activity; units: Units }) {
  const data = activity.splits
    .filter((s) => Number.isFinite(s.paceSecPerKm) && s.paceSecPerKm > 0)
    .map((s, i) => ({
      label: `${i + 1}`,
      pace: paceSecPerUnit(s.paceSecPerKm, units),
      hr: s.avgHr,
      elevation: s.elevationGainM,
    }))

  if (data.length < 2) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Not enough distance for a pace breakdown yet.
      </p>
    )
  }

  const paces = data.map((d) => d.pace)
  const pad = (Math.max(...paces) - Math.min(...paces)) * 0.15 || 20

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-slate-400"
            label={{
              value: units === 'mi' ? 'mile' : 'km',
              position: 'insideBottomRight',
              fontSize: 10,
            }}
          />
          <YAxis
            reversed
            domain={[Math.min(...paces) - pad, Math.max(...paces) + pad]}
            tickFormatter={(v: number) => formatPace(secPerUnitToSecPerKm(v, units), units)}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-slate-400"
            width={52}
          />
          <Tooltip
            formatter={(value) => [
              formatPace(secPerUnitToSecPerKm(Number(value), units), units),
              'Pace',
            ]}
            labelFormatter={(l) => `${units === 'mi' ? 'Mile' : 'Km'} ${l}`}
            contentStyle={{ borderRadius: 12, fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="pace"
            stroke="#059669"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
        Total {kmToDisplay(activity.distanceKm, units).toFixed(2)}{' '}
        {units === 'mi' ? 'mi' : 'km'} — higher on the chart is faster.
      </p>
    </div>
  )
}
