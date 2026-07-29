import { useEffect, useMemo, useState } from 'react'
import type { Activity, ActivityType } from '../types'
import { listActivities } from '../db/repo'
import { useApp } from '../state/AppContext'
import { ActivityRow } from '../components/ActivityRow'
import { EmptyState, cx } from '../components/ui'
import { ImportButton } from '../components/ImportButton'
import { distanceLabel, formatDistance } from '../lib/units'
import { DAY_MS } from '../lib/dates'

type TypeFilter = 'all' | ActivityType
type RangeFilter = '7d' | '30d' | '90d' | 'all'

const RANGES: Array<{ key: RangeFilter; label: string; days?: number }> = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time' },
]

export function History() {
  const { settings } = useApp()
  const [activities, setActivities] = useState<Activity[]>([])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [range, setRange] = useState<RangeFilter>('30d')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setActivities(await listActivities())
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const filtered = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days
    const cutoff = days ? Date.now() - days * DAY_MS : 0
    return activities.filter(
      (a) =>
        (typeFilter === 'all' || a.type === typeFilter) && a.startTime >= cutoff,
    )
  }, [activities, typeFilter, range])

  const totalKm = filtered.reduce((sum, a) => sum + a.distanceKm, 0)

  return (
    <div className="px-4 pt-6 safe-top">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">History</h1>
          <p className="tnum text-sm text-slate-500 dark:text-slate-400">
            {filtered.length} activit{filtered.length === 1 ? 'y' : 'ies'} ·{' '}
            {formatDistance(totalKm, settings.units, 1)} {distanceLabel(settings.units)}
          </p>
        </div>
        <ImportButton onImported={refresh} />
      </header>

      <div className="mb-3 flex gap-2">
        {(['all', 'run', 'walk'] as const).map((t) => (
          <FilterChip
            key={t}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t)}
          >
            {t === 'all' ? 'All' : t === 'run' ? 'Runs' : 'Walks'}
          </FilterChip>
        ))}
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {RANGES.map((r) => (
          <FilterChip key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing in this range"
          body={
            activities.length === 0
              ? 'Track a run or walk, or import a GPX file from another app, and it will show up here.'
              : 'Try widening the date range or changing the activity filter.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2 pb-6">
          {filtered.map((a) => (
            <ActivityRow key={a.id} activity={a} units={settings.units} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'min-h-9 shrink-0 rounded-full px-4 text-sm font-medium transition',
        active
          ? 'bg-brand-600 text-white'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
