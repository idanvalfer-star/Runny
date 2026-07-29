import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActivityType, HrSample, LiveSession, RoutePoint } from '../types'
import { acceptPoint, haversineM } from '../lib/geo'
import { caloriesPerMinute } from '../lib/calories'
import {
  clearLiveSession,
  getLiveSession,
  saveLiveSession,
} from '../db/repo'
import { simAvailable, simEnabled, startSimulatedWatch } from './simulatedGps'
import { useWakeLock } from './useWakeLock'

export type TrackerStatus = 'idle' | 'running' | 'paused' | 'autopaused'

/** Below this speed the runner is treated as stationary for auto-pause. */
const STATIONARY_SPEED_MPS = 0.5
const AUTO_PAUSE_AFTER_SEC = 10
const PERSIST_EVERY_MS = 5000

export interface TrackerState {
  status: TrackerStatus
  type: ActivityType
  startTime?: number
  route: RoutePoint[]
  hrSamples: HrSample[]
  distanceKm: number
  elapsedSec: number
  movingSec: number
  currentPaceSecPerKm?: number
  avgPaceSecPerKm?: number
  calories: number
  discardedPoints: number
  gpsAccuracyM?: number
  error?: string
}

export interface UseGeoTrackerOptions {
  weightKg: number
  autoPause: boolean
  keepScreenAwake: boolean
  /** Live HR feed, if a monitor is connected. */
  currentHr?: number
}

const INITIAL: TrackerState = {
  status: 'idle',
  type: 'run',
  route: [],
  hrSamples: [],
  distanceKm: 0,
  elapsedSec: 0,
  movingSec: 0,
  calories: 0,
  discardedPoints: 0,
}

export function useGeoTracker(options: UseGeoTrackerOptions) {
  const [state, setState] = useState<TrackerState>(INITIAL)
  const [recoverable, setRecoverable] = useState<LiveSession | undefined>()

  // Mutable mirrors: the geolocation callback and the ticker both need current
  // values without re-subscribing on every state change.
  const stateRef = useRef(state)
  stateRef.current = state
  const optionsRef = useRef(options)
  optionsRef.current = options

  const watchIdRef = useRef<number | null>(null)
  const stopSimRef = useRef<(() => void) | null>(null)
  const lastMoveTsRef = useRef<number>(0)
  const lastPersistRef = useRef<number>(0)
  const planSessionIdRef = useRef<string | undefined>(undefined)

  const isTracking = state.status === 'running' || state.status === 'autopaused'
  useWakeLock(isTracking && options.keepScreenAwake)

  // Offer to resume an activity that was interrupted mid-run.
  useEffect(() => {
    void (async () => {
      const live = await getLiveSession()
      if (live && live.route.length > 0) setRecoverable(live)
    })()
  }, [])

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    setState((prev) => {
      if (prev.status === 'idle' || prev.status === 'paused') return prev

      const point: RoutePoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        timestamp: pos.timestamp,
        elevation: pos.coords.altitude ?? undefined,
        accuracy: pos.coords.accuracy,
      }
      const last = prev.route[prev.route.length - 1]
      const decision = acceptPoint(last, point, prev.type)

      if (!decision.accept) {
        // A rejected fix still tells us the GPS is alive; only count the noisy
        // ones so the summary can report signal quality honestly.
        const countIt =
          decision.reason === 'impossible_speed' || decision.reason === 'accuracy'
        return {
          ...prev,
          gpsAccuracyM: pos.coords.accuracy,
          discardedPoints: prev.discardedPoints + (countIt ? 1 : 0),
        }
      }

      const speedMps = decision.speedMps ?? 0
      const moving = speedMps >= STATIONARY_SPEED_MPS
      if (moving) lastMoveTsRef.current = pos.timestamp

      const distanceKm = prev.distanceKm + (decision.distanceM ?? 0) / 1000

      // Auto-pause resumes the moment real movement returns.
      const status: TrackerStatus =
        prev.status === 'autopaused' && moving ? 'running' : prev.status

      return {
        ...prev,
        status,
        route: [...prev.route, point],
        distanceKm,
        gpsAccuracyM: pos.coords.accuracy,
        currentPaceSecPerKm: speedMps > 0.1 ? 1000 / speedMps : undefined,
      }
    })
  }, [])

  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null || stopSimRef.current) return

    if (simAvailable() && simEnabled()) {
      stopSimRef.current = startSimulatedWatch(handlePosition, {
        intervalMs: 1000,
        speedMps: 3,
        outlierEvery: 25,
      })
      return
    }

    if (!('geolocation' in navigator)) {
      setState((p) => ({
        ...p,
        error: 'This browser has no GPS access. You can still log a run manually.',
      }))
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => {
        setState((p) => ({
          ...p,
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Runny needs it to measure your route.'
              : 'Waiting for a GPS signal…',
        }))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )
  }, [handlePosition])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    stopSimRef.current?.()
    stopSimRef.current = null
  }, [])

  // One-second ticker: elapsed/moving time, auto-pause, calories, persistence.
  useEffect(() => {
    if (state.status === 'idle') return
    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.status === 'idle' || !prev.startTime) return prev
        const now = Date.now()
        const elapsedSec = (now - prev.startTime) / 1000

        if (prev.status === 'paused') {
          return { ...prev, elapsedSec }
        }

        let status = prev.status
        const opts = optionsRef.current
        if (
          opts.autoPause &&
          prev.status === 'running' &&
          lastMoveTsRef.current > 0 &&
          (now - lastMoveTsRef.current) / 1000 > AUTO_PAUSE_AFTER_SEC
        ) {
          status = 'autopaused'
        }

        const counting = status === 'running'
        const movingSec = prev.movingSec + (counting ? 1 : 0)
        const speedMps =
          prev.currentPaceSecPerKm && prev.currentPaceSecPerKm > 0
            ? 1000 / prev.currentPaceSecPerKm
            : 0
        const calories =
          prev.calories +
          (counting
            ? caloriesPerMinute(speedMps, prev.type, opts.weightKg) / 60
            : 0)

        const hrSamples =
          counting && opts.currentHr
            ? [...prev.hrSamples, { timestamp: now, bpm: opts.currentHr }]
            : prev.hrSamples

        return {
          ...prev,
          status,
          elapsedSec,
          movingSec,
          calories,
          hrSamples,
          avgPaceSecPerKm:
            prev.distanceKm > 0 ? movingSec / prev.distanceKm : undefined,
          // Stale pace reads as a lie once you've stopped moving.
          currentPaceSecPerKm: counting ? prev.currentPaceSecPerKm : undefined,
        }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [state.status])

  // Persist in-progress state so a crash or reload does not lose the run.
  useEffect(() => {
    if (state.status === 'idle' || !state.startTime) return
    const now = Date.now()
    if (now - lastPersistRef.current < PERSIST_EVERY_MS) return
    lastPersistRef.current = now
    void saveLiveSession({
      id: 'current',
      type: state.type,
      startTime: state.startTime,
      route: state.route,
      hrSamples: state.hrSamples,
      movingTimeSec: state.movingSec,
      elapsedTimeSec: state.elapsedSec,
      distanceKm: state.distanceKm,
      discardedPoints: state.discardedPoints,
      paused: state.status === 'paused',
      planSessionId: planSessionIdRef.current,
      updatedAt: now,
    })
  }, [state])

  useEffect(() => stopWatch, [stopWatch])

  const start = useCallback(
    (type: ActivityType, planSessionId?: string) => {
      planSessionIdRef.current = planSessionId
      lastMoveTsRef.current = Date.now()
      setState({ ...INITIAL, status: 'running', type, startTime: Date.now() })
      startWatch()
    },
    [startWatch],
  )

  const pause = useCallback(() => {
    setState((p) =>
      p.status === 'running' || p.status === 'autopaused'
        ? { ...p, status: 'paused', currentPaceSecPerKm: undefined }
        : p,
    )
  }, [])

  const resume = useCallback(() => {
    lastMoveTsRef.current = Date.now()
    setState((p) => (p.status === 'paused' ? { ...p, status: 'running' } : p))
    startWatch()
  }, [startWatch])

  const stop = useCallback(() => {
    stopWatch()
    const finished = stateRef.current
    setState(INITIAL)
    void clearLiveSession()
    return {
      ...finished,
      planSessionId: planSessionIdRef.current,
      endTime: Date.now(),
    }
  }, [stopWatch])

  const discardRecovery = useCallback(() => {
    setRecoverable(undefined)
    void clearLiveSession()
  }, [])

  const resumeRecovered = useCallback(
    (live: LiveSession) => {
      planSessionIdRef.current = live.planSessionId
      lastMoveTsRef.current = Date.now()
      setState({
        status: 'paused',
        type: live.type,
        startTime: live.startTime,
        route: live.route,
        hrSamples: live.hrSamples,
        distanceKm: live.distanceKm,
        elapsedSec: live.elapsedTimeSec,
        movingSec: live.movingTimeSec,
        calories: 0,
        discardedPoints: live.discardedPoints,
      })
      setRecoverable(undefined)
    },
    [],
  )

  /** Straight-line distance from the start, for a "how far out am I" readout. */
  const distanceFromStartM =
    state.route.length > 1
      ? haversineM(state.route[0], state.route[state.route.length - 1])
      : 0

  return {
    state,
    start,
    pause,
    resume,
    stop,
    recoverable,
    resumeRecovered,
    discardRecovery,
    distanceFromStartM,
  }
}
