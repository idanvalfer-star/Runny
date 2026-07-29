import { useCallback, useEffect, useRef } from 'react'

/**
 * Holds a screen wake lock while tracking.
 *
 * The browser drops the lock whenever the tab is backgrounded, so it has to be
 * re-acquired on `visibilitychange` — otherwise the screen sleeps the first
 * time the runner pockets the phone and the lock never comes back.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  const acquire = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    if (sentinelRef.current) return
    try {
      sentinelRef.current = await navigator.wakeLock.request('screen')
      sentinelRef.current.addEventListener('release', () => {
        sentinelRef.current = null
      })
    } catch {
      // Denied or unsupported: tracking still works, the screen just sleeps.
    }
  }, [])

  const release = useCallback(async () => {
    try {
      await sentinelRef.current?.release()
    } catch {
      // Already released.
    }
    sentinelRef.current = null
  }, [])

  useEffect(() => {
    if (active) void acquire()
    else void release()

    const onVisibility = () => {
      if (active && document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void release()
    }
  }, [active, acquire, release])
}
