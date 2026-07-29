import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import type { Activity } from '../types'
import { listActivities } from '../db/repo'
import { useApp } from '../state/AppContext'
import { Card, EmptyState, SectionTitle } from '../components/ui'
import { personalBests } from '../lib/personalBests'
import { startOfWeek, formatShortDate, DAY_MS } from '../lib/dates'
import {
  distanceLabel,
  formatDuration,
  formatPace,
  kmToDisplay,
  paceLabel,
  paceSecPerUnit,
  secPerUnitToSecPerKm,
} from '../lib/units'

interface WeekBucket {
  weekStart: number
  label: string
  distance: number
  calories: number
  avgPace?: number
  avgHr?: number
}

export function Trends() {
  const { settings } = useApp()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setActivities(await listActivities())
      setLoading(false)
    })()
  }, [])

  const units = settings.units

  const weeks = useMemo<WeekBucket[]>(() => {
    if (activities.length === 0) return []
    const buckets = new Map<number, Activity[]>()
    // Twelve weeks is enough to see a trend without crushing the chart.
    const cutoff = startOfWeek(Date.now() - 11 * 7 * DAY_MS)

    for (let ws = cutoff; ws <= startOfWeek(Date.now()); ws += 7 * DAY_MS) {
      buckets.set(ws, [])
    }
    for (const a of activities) {
      const ws = startOfWeek(a.startTime)
      if (ws < cutoff) continue
      buckets.get(ws)?.push(a)
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([weekStart, acts]) => {
        const distance = acts.reduce((s, a) => s + a.distanceKm, 0)
        const movingSec = acts.reduce((s, a) => s + a.movingTimeSec, 0)
        const withHr = acts.filter((a) => a.avgHr)
        return {
          weekStart,
          label: formatShortDate(weekStart),
          distance: Number(kmToDisplay(distance, units).toFixed(2)),
          calories: Math.round(acts.reduce((s, a) => s + a.caloriesBurned, 0)),
          avgPace:
            distance > 0
              ? Number(paceSecPerUnit(movingSec / distance, units).toFixed(0))
              : undefined,
          avgHr:
            withHr.length > 0
              ? Math.round(withHr.reduce((s, a) => s + (a.avgHr ?? 0), 0) / withHr.length)
              : undefined,
        }
      })
  }, [activities, units])

  const bests = useMemo(() => personalBests(activities), [activities])
  const paceWeeks = weeks.filter((w) => w.avgPace !== undefined)
  const hrWeeks = weeks.filter((w) => w.avgHr !== undefined)

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>

  if (activities.length === 0) {
    return (
      <div className="px-4 pt-6 safe-top">
        <h1 className="mb-4 text-2xl font-bold">Trends</h1>
        <EmptyState
          title="Nothing to chart yet"
          body="Once you've logged a few sessions, your weekly volume, pace and heart rate trends will appear here."
        />
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-6 safe-top">
      <h1 className="mb-5 text-2xl font-bold">Trends</h1>

      <section className="mb-6">
        <SectionTitle>Weekly distance</SectionTitle>
        <Card>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-slate-200 dark:stroke-slate-800"
                />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <Tooltip
                  formatter={(v) => [`${Number(v)} ${distanceLabel(units)}`, 'Distance']}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="distance" fill="#059669" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {paceWeeks.length >= 2 && (
        <section className="mb-6">
          <SectionTitle>Average pace</SectionTitle>
          <Card>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={paceWeeks} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-slate-200 dark:stroke-slate-800"
                  />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                  <YAxis
                    reversed
                    domain={['dataMin - 20', 'dataMax + 20']}
                    tickFormatter={(v: number) =>
                      formatPace(secPerUnitToSecPerKm(v, units), units)
                    }
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    width={48}
                  />
                  <Tooltip
                    formatter={(v) => [
                      `${formatPace(secPerUnitToSecPerKm(Number(v), units), units)}${paceLabel(units)}`,
                      'Avg pace',
                    ]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="avgPace" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
              Higher is faster.
            </p>
          </Card>
        </section>
      )}

      {hrWeeks.length >= 2 && (
        <section className="mb-6">
          <SectionTitle>Average heart rate</SectionTitle>
          <Card>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hrWeeks} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-slate-200 dark:stroke-slate-800"
                  />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                  <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                  <Tooltip
                    formatter={(v) => [`${Number(v)} bpm`, 'Avg HR']}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="avgHr" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}

      <section className="mb-6">
        <SectionTitle>Calories per week</SectionTitle>
        <Card>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <Tooltip formatter={(v) => [`${Number(v)} kcal`, 'Calories']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="calories" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Personal bests</SectionTitle>
        {bests.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Bests are detected automatically from your runs — including a fast 5K
              inside a longer run. Nothing has reached a full 1K yet.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {bests.map((b) => (
              <Link
                key={b.distance.key}
                to={`/activity/${b.activityId}`}
                className="flex items-center justify-between rounded-2xl bg-white p-3 ring-1 ring-slate-200/70 transition active:scale-[0.99] dark:bg-slate-900 dark:ring-slate-800"
              >
                <div>
                  <div className="font-semibold">{b.distance.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatShortDate(b.date)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-lg font-bold">{formatDuration(b.timeSec)}</div>
                  <div className="tnum text-xs text-slate-500 dark:text-slate-400">
                    {formatPace(b.paceSecPerKm, units)}
                    {paceLabel(units)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
