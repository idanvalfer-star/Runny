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
    <div className="px-4 pt-6 pb-24 safe-top dark:bg-[#0F1419] min-h-dvh">
      <header className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Pill tone="brand">{activity.type}</Pill>
          {activity.source === 'import' && <Pill>Imported</Pill>}
          {activity.painReported && <Pill tone="danger">Pain reported</Pill>}
          {activity.rpe !== undefined && <Pill>RPE {activity.rpe}</Pill>}
        </div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          {formatDistance(activity.distanceKm, units)} {distanceLabel(units)}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {formatDateTime(activity.startTime)}
        </p>
      </header>

      <Card className="mb-6 border-l-4 border-brand-500 dark:bg-[#1A1F2E]">
        <p className="text-base leading-relaxed text-slate-900 dark:text-slate-100 font-medium">{takeaway}</p>
      </Card>

      <RouteMap route={activity.route} className="mb-6 h-64 overflow-hidden rounded-2xl shadow-sm" />

      <Card className="mb-6 dark:bg-[#1A1F2E]">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Moving time</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatDuration(activity.movingTimeSec)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Elapsed</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatDuration(activity.elapsedTimeSec)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Avg pace</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatPace(activity.avgPaceSecPerKm, units)}</div>
            <div className="text-xs text-slate-600 dark:text-slate-400">{paceLabel(units)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Best pace</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {activity.bestPaceSecPerKm ? formatPace(activity.bestPaceSecPerKm, units) : '--:--'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">{paceLabel(units)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Calories</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{Math.round(activity.caloriesBurned)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Elevation</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              +{Math.round(activity.elevationGainM)}m
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">−{Math.round(activity.elevationLossM)}m</div>
          </div>
        </div>
        {activity.discardedPoints ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {activity.discardedPoints} GPS reading
            {activity.discardedPoints === 1 ? ' was' : 's were'} discarded as noise.
          </p>
        ) : null}
      </Card>

      {activity.hrSamples.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Heart rate</h2>
          <Card className="dark:bg-[#1A1F2E]">
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Average</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{activity.avgHr ?? '--'}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">bpm</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Max</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{activity.maxHr ?? '--'}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">bpm</div>
              </div>
            </div>
            <HrZoneBars samples={activity.hrSamples} maxHr={maxHr} />
          </Card>
        </section>
      ) : (
        <Card className="mb-6 dark:bg-[#1A1F2E]">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
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
        <section className="mb-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Pace over distance</h2>
          <Card className="dark:bg-[#1A1F2E]">
            <PaceChart activity={activity} units={units} />
          </Card>
        </section>
      )}

      {activity.splits.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Splits</h2>
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
