import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ActivityType, LiveSession } from '../types'
import { useApp } from '../state/AppContext'
import { useGeoTracker } from '../tracking/useGeoTracker'
import { useHeartRate } from '../tracking/useHeartRate'
import { buildActivity } from '../lib/activity'
import { saveActivity } from '../db/repo'
import { Button, Card, Metric, Pill, cx } from '../components/ui'
import { formatDistance, formatDuration, formatPace, paceLabel, distanceLabel } from '../lib/units'

export function Track() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const planSessionId = params.get('session') ?? undefined
  const { settings, profile } = useApp()
  const hr = useHeartRate()

  const [type, setType] = useState<ActivityType>('run')
  const [confirmingStop, setConfirmingStop] = useState(false)

  const tracker = useGeoTracker({
    weightKg: profile?.weightKg ?? 70,
    autoPause: settings.autoPause,
    keepScreenAwake: settings.keepScreenAwake,
    currentHr: hr.bpm,
  })
  const { state } = tracker
  const active = state.status !== 'idle'

  // Warn before a reload or back-navigation throws away an in-progress run.
  useEffect(() => {
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])

  async function handleStop() {
    const finished = tracker.stop()
    if (finished.route.length < 2 || finished.distanceKm < 0.01) {
      navigate('/')
      return
    }
    const activity = buildActivity({
      type: finished.type,
      startTime: finished.startTime ?? Date.now(),
      endTime: finished.endTime,
      route: finished.route,
      hrSamples: finished.hrSamples,
      movingTimeSec: finished.movingSec,
      elapsedTimeSec: finished.elapsedSec,
      weightKg: profile?.weightKg ?? 70,
      discardedPoints: finished.discardedPoints,
      planSessionId: finished.planSessionId ?? planSessionId,
    })
    await saveActivity(activity)
    navigate(`/activity/${activity.id}?new=1`)
  }

  const units = settings.units

  return (
    <div className="flex min-h-dvh flex-col">
      {tracker.recoverable && !active && (
        <RecoveryBanner
          session={tracker.recoverable}
          onResume={() => tracker.resumeRecovered(tracker.recoverable!)}
          onDiscard={tracker.discardRecovery}
        />
      )}

      <div className="flex-1 px-4 pt-4 safe-top">
        {!active && (
          <div className="mb-6">
            <h1 className="mb-1 text-2xl font-bold">Ready when you are</h1>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Pick what you're doing — it changes how calories are estimated.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(['run', 'walk'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cx(
                    'min-h-16 rounded-2xl text-lg font-semibold capitalize transition ring-1',
                    type === t
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800',
                  )}
                  aria-pressed={type === t}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {active && <Pill tone="brand">{state.type}</Pill>}
          {state.status === 'autopaused' && <Pill tone="warn">Auto-paused</Pill>}
          {state.status === 'paused' && <Pill>Paused</Pill>}
          {state.gpsAccuracyM !== undefined && (
            <Pill tone={state.gpsAccuracyM > 20 ? 'warn' : 'neutral'}>
              GPS ±{Math.round(state.gpsAccuracyM)}m
            </Pill>
          )}
          {hr.status === 'connected' && <Pill tone="brand">♥ {hr.bpm ?? '--'}</Pill>}
          {state.discardedPoints > 0 && (
            <Pill>{state.discardedPoints} noisy fixes filtered</Pill>
          )}
        </div>

        {state.error && (
          <Card className="mb-4 border-l-4 border-amber-500">
            <p className="text-sm">{state.error}</p>
          </Card>
        )}

        {/* Distance is the number you glance at mid-stride, so it gets the room. */}
        <div className="mb-6 text-center">
          <div className="tnum text-7xl leading-none font-bold">
            {formatDistance(state.distanceKm, units)}
          </div>
          <div className="mt-1 text-sm font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {distanceLabel(units)}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <Metric label="Time" value={formatDuration(state.elapsedSec)} size="lg" />
          <Metric
            label="Avg pace"
            value={formatPace(state.avgPaceSecPerKm ?? 0, units)}
            unit={paceLabel(units)}
            size="lg"
          />
          <Metric
            label="Current pace"
            value={formatPace(state.currentPaceSecPerKm ?? 0, units)}
            unit={paceLabel(units)}
            size="lg"
          />
          <Metric label="Calories" value={Math.round(state.calories).toString()} size="lg" />
        </div>

        {hr.status === 'connected' ? (
          <Card className="mb-4">
            <Metric label="Heart rate" value={`${hr.bpm ?? '--'}`} unit="bpm" size="lg" accent />
          </Card>
        ) : (
          hr.supported && !active && (
            <Button variant="secondary" full onClick={() => void hr.connect()}>
              {hr.status === 'connecting' ? 'Connecting…' : 'Connect heart rate monitor'}
            </Button>
          )
        )}
      </div>

      {/* Controls sit at the bottom, in thumb reach. */}
      <div className="sticky bottom-0 border-t border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur safe-bottom dark:border-slate-800 dark:bg-slate-950/95">
        {!active ? (
          <Button size="lg" full onClick={() => tracker.start(type, planSessionId)}>
            Start {type}
          </Button>
        ) : confirmingStop ? (
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" variant="secondary" onClick={() => setConfirmingStop(false)}>
              Keep going
            </Button>
            <Button size="lg" variant="danger" onClick={() => void handleStop()}>
              Finish
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {state.status === 'paused' ? (
              <Button size="lg" onClick={tracker.resume}>
                Resume
              </Button>
            ) : (
              <Button size="lg" variant="secondary" onClick={tracker.pause}>
                Pause
              </Button>
            )}
            <Button size="lg" variant="danger" onClick={() => setConfirmingStop(true)}>
              Stop
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function RecoveryBanner({
  session,
  onResume,
  onDiscard,
}: {
  session: LiveSession
  onResume: () => void
  onDiscard: () => void
}) {
  return (
    <Card className="m-4 border-l-4 border-brand-500">
      <p className="mb-1 font-semibold">Unfinished {session.type}</p>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Runny closed mid-session with {session.distanceKm.toFixed(2)} km recorded.
        Pick it back up, or discard it.
      </p>
      <div className="flex gap-2">
        <Button onClick={onResume}>Resume</Button>
        <Button variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </Card>
  )
}
