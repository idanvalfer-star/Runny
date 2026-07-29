import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Activity } from '../types'
import { deleteActivity, getActivity, listActivities, updateActivity } from '../db/repo'
import { useApp } from '../state/AppContext'
import { RouteMap } from '../components/RouteMap'
import { SplitsTable } from '../components/SplitsTable'
import { HrZoneBars } from '../components/HrZoneBars'
import { PaceChart } from '../components/PaceChart'
import { RpeSheet } from '../components/RpeSheet'
import { Button, Card, Metric, Pill, SectionTitle } from '../components/ui'
import { takeawayFor } from '../lib/takeaway'
import { estimateMaxHr } from '../lib/hrZones'
import { formatDateTime } from '../lib/dates'
import {
  distanceLabel,
  formatDistance,
  formatDuration,
  formatPace,
  paceLabel,
} from '../lib/units'
import { applyFeedbackToPlan } from '../plan/adapt'

export function ActivitySummary() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  const navigate = useNavigate()
  const { settings, profile } = useApp()

  const [activity, setActivity] = useState<Activity | undefined>()
  const [priors, setPriors] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [showRpe, setShowRpe] = useState(isNew)
  const [manualHrOpen, setManualHrOpen] = useState(false)

  useEffect(() => {
    void (async () => {
      if (!id) return
      const [a, all] = await Promise.all([getActivity(id), listActivities()])
      setActivity(a)
      setPriors(all.filter((x) => x.id !== id && x.startTime < (a?.startTime ?? 0)))
      setLoading(false)
    })()
  }, [id])

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>
  }
  if (!activity) {
    return (
      <div className="p-6">
        <p className="mb-4 text-sm text-slate-500">That activity no longer exists.</p>
        <Button onClick={() => navigate('/history')}>Back to history</Button>
      </div>
    )
  }

  const units = settings.units
  const maxHr = profile?.maxHr ?? estimateMaxHr(profile?.age ?? 35)
  const takeaway = takeawayFor(activity, priors, units)

  async function saveFeedback(rpe: number, painReported: boolean, painNote?: string) {
    if (!activity) return
    await updateActivity(activity.id, { rpe, painReported, painNote })
    const updated = { ...activity, rpe, painReported, painNote }
    setActivity(updated)
    setShowRpe(false)
    // Feedback is only useful if it actually reaches the plan.
    await applyFeedbackToPlan(updated)
  }

  return (
    <div className="px-4 pt-6 safe-top">
      <header className="mb-4">
        <div className="mb-1 flex items-center gap-2">
          <Pill tone="brand">{activity.type}</Pill>
          {activity.source === 'import' && <Pill>Imported</Pill>}
          {activity.painReported && <Pill tone="danger">Pain reported</Pill>}
          {activity.rpe !== undefined && <Pill>RPE {activity.rpe}</Pill>}
        </div>
        <h1 className="text-2xl font-bold">
          {formatDistance(activity.distanceKm, units)} {distanceLabel(units)}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {formatDateTime(activity.startTime)}
        </p>
      </header>

      <Card className="mb-4 border-l-4 border-brand-500">
        <p className="text-sm leading-relaxed">{takeaway}</p>
      </Card>

      <RouteMap route={activity.route} className="mb-4 h-56 overflow-hidden rounded-2xl" />

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-4">
          <Metric label="Moving time" value={formatDuration(activity.movingTimeSec)} />
          <Metric label="Elapsed" value={formatDuration(activity.elapsedTimeSec)} />
          <Metric
            label="Avg pace"
            value={formatPace(activity.avgPaceSecPerKm, units)}
            unit={paceLabel(units)}
          />
          <Metric
            label="Best pace"
            value={
              activity.bestPaceSecPerKm
                ? formatPace(activity.bestPaceSecPerKm, units)
                : '--:--'
            }
            unit={paceLabel(units)}
          />
          <Metric label="Calories" value={Math.round(activity.caloriesBurned).toString()} />
          <Metric
            label="Elevation"
            value={`+${Math.round(activity.elevationGainM)} / -${Math.round(activity.elevationLossM)}`}
            unit="m"
          />
        </div>
        {activity.discardedPoints ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {activity.discardedPoints} GPS reading
            {activity.discardedPoints === 1 ? ' was' : 's were'} discarded as noise.
          </p>
        ) : null}
      </Card>

      {activity.hrSamples.length > 0 ? (
        <section className="mb-4">
          <SectionTitle>Heart rate</SectionTitle>
          <Card>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <Metric label="Average" value={`${activity.avgHr ?? '--'}`} unit="bpm" />
              <Metric label="Max" value={`${activity.maxHr ?? '--'}`} unit="bpm" />
            </div>
            <HrZoneBars samples={activity.hrSamples} maxHr={maxHr} />
          </Card>
        </section>
      ) : (
        <Card className="mb-4">
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            No heart rate recorded for this session.
          </p>
          {manualHrOpen ? (
            <ManualHrForm
              onSave={async (avgHr, max) => {
                await updateActivity(activity.id, { avgHr, maxHr: max })
                setActivity({ ...activity, avgHr, maxHr: max })
                setManualHrOpen(false)
              }}
              onCancel={() => setManualHrOpen(false)}
            />
          ) : (
            <Button variant="secondary" onClick={() => setManualHrOpen(true)}>
              Add heart rate manually
            </Button>
          )}
        </Card>
      )}

      {activity.route.length > 2 && (
        <section className="mb-4">
          <SectionTitle>Pace over distance</SectionTitle>
          <Card>
            <PaceChart activity={activity} units={units} />
          </Card>
        </section>
      )}

      {activity.splits.length > 0 && (
        <section className="mb-4">
          <SectionTitle>Splits</SectionTitle>
          <SplitsTable splits={activity.splits} units={units} />
        </section>
      )}

      <div className="mb-8 flex flex-col gap-2">
        {activity.rpe === undefined && (
          <Button variant="secondary" onClick={() => setShowRpe(true)}>
            Add how it felt
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={async () => {
            if (!confirm('Delete this activity? This cannot be undone.')) return
            await deleteActivity(activity.id)
            navigate('/history')
          }}
        >
          Delete activity
        </Button>
      </div>

      {showRpe && (
        <RpeSheet
          onSubmit={saveFeedback}
          onDismiss={() => setShowRpe(false)}
        />
      )}
    </div>
  )
}

function ManualHrForm({
  onSave,
  onCancel,
}: {
  onSave: (avgHr: number, maxHr: number) => Promise<void>
  onCancel: () => void
}) {
  const [avg, setAvg] = useState('')
  const [max, setMax] = useState('')
  const valid = Number(avg) > 0 && Number(max) > 0

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500 dark:text-slate-400">Average</span>
          <input
            type="number"
            inputMode="numeric"
            value={avg}
            onChange={(e) => setAvg(e.target.value)}
            className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500 dark:text-slate-400">Max</span>
          <input
            type="number"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button disabled={!valid} onClick={() => void onSave(Number(avg), Number(max))}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
