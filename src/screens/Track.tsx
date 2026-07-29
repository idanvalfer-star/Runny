import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ActivityType, LiveSession } from '../types'
import { useApp } from '../state/AppContext'
import { useGeoTracker } from '../tracking/useGeoTracker'
import { useHeartRate } from '../tracking/useHeartRate'
import { simAvailable, simEnabled } from '../tracking/simulatedGps'
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
  // No GPS receiver in a desktop browser, so the demo build can fake one.
  const simOn = simAvailable() && simEnabled()
  const canOfferSim = simAvailable() && !simEnabled()

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
    <div className="flex min-h-dvh flex-col dark:bg-[#0F1419]">
      {tracker.recoverable && !active && (
        <RecoveryBanner
          session={tracker.recoverable}
          onResume={() => tracker.resumeRecovered(tracker.recoverable!)}
          onDiscard={tracker.discardRecovery}
        />
      )}

      <div className="flex-1 px-4 pt-4 safe-top">
        {!active && (
          <div className="mb-8">
            <h1 className="mb-1 text-3xl font-bold text-slate-900 dark:text-white">Ready when you are</h1>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Pick what you're doing — it changes how calories are estimated.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(['run', 'walk'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cx(
                    'min-h-16 rounded-2xl text-lg font-semibold capitalize transition ring-1 shadow-sm',
                    type === t
                      ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:ring-brand-500'
                      : 'bg-white text-slate-700 ring-slate-200 dark:bg-[#1A1F2E] dark:text-slate-200 dark:ring-slate-700',
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
          {simOn && <Pill tone="warn">Simulated GPS</Pill>}
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
          <Card className="mb-4 border-l-4 border-amber-500 dark:bg-[#1A1F2E]">
            <p className="text-sm text-slate-900 dark:text-slate-200">{state.error}</p>
          </Card>
        )}

        {/* Distance is the number you glance at mid-stride, so it gets the room. */}
        <div className="mb-8 text-center">
          <div className="inline-block rounded-3xl border-4 border-[#FF6B4A] px-8 py-6">
            <div className="tnum text-8xl leading-none font-bold text-slate-900 dark:text-white">
              {formatDistance(state.distanceKm, units)}
            </div>
            <div className="mt-2 text-sm font-medium tracking-wide text-slate-600 uppercase dark:text-slate-400">
              {distanceLabel(units)}
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-slate-100 dark:bg-[#252B3A] p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Time</div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white tnum">{formatDuration(state.elapsedSec)}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 dark:bg-[#252B3A] p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Avg pace</div>
            <div className="text-3xl font-bold text-[#FF6B4A] tnum">
              {formatPace(state.avgPaceSecPerKm ?? 0, units)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{paceLabel(units)}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 dark:bg-[#252B3A] p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Current pace</div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white tnum">
              {formatPace(state.currentPaceSecPerKm ?? 0, units)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{paceLabel(units)}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 dark:bg-[#252B3A] p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Calories</div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white tnum">{Math.round(state.calories)}</div>
          </div>
        </div>

        {hr.status === 'connected' ? (
          <Card className="mb-4 dark:bg-[#1A1F2E] border-l-4 border-brand-500">
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
      <div className="sticky bottom-0 border-t border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur safe-bottom dark:border-slate-700 dark:bg-[#1A1F2E]/95">
        {!active ? (
          <div className="flex flex-col gap-2">
            <Button size="lg" full onClick={() => tracker.start(type, planSessionId)}>
              Start {type}
            </Button>
            {canOfferSim && (
              <Button
                variant="ghost"
                full
                onClick={() => navigate(`/track?sim=1`, { replace: true })}
              >
                No GPS here? Run a simulated demo
              </Button>
            )}
          </div>
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
