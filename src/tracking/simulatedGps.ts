/**
 * Replays a synthetic track through the same interface as `watchPosition`.
 *
 * There is no real GPS in a desktop browser or a test runner, so this is how
 * tracking gets exercised end to end. It is enabled only via `?sim=1` and is
 * tree-shaken out of production builds by the `import.meta.env.DEV` guard at
 * the call site.
 */

export interface SimOptions {
  /** Wall-clock ms between emitted fixes. */
  intervalMs?: number
  /** Metres per second the simulated runner moves. */
  speedMps?: number
  startLat?: number
  startLng?: number
  /** Emit a wild outlier every N fixes, to exercise the noise filter. */
  outlierEvery?: number
}

export function startSimulatedWatch(
  onPosition: (pos: GeolocationPosition) => void,
  options: SimOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 1000
  const speedMps = options.speedMps ?? 3.0 // ~5:33/km
  const startLat = options.startLat ?? 51.5074
  const startLng = options.startLng ?? -0.1278
  const outlierEvery = options.outlierEvery ?? 0

  let tick = 0
  let lat = startLat
  let lng = startLng
  const metresPerDegLat = 111_320

  const timer = setInterval(() => {
    tick++
    // Run a gentle arc so the polyline is not a straight line.
    const bearing = (tick / 40) * Math.PI
    const stepM = speedMps * (intervalMs / 1000)
    lat += (stepM * Math.cos(bearing)) / metresPerDegLat
    lng +=
      (stepM * Math.sin(bearing)) /
      (metresPerDegLat * Math.cos((lat * Math.PI) / 180))

    const isOutlier = outlierEvery > 0 && tick % outlierEvery === 0
    const position = {
      coords: {
        latitude: isOutlier ? lat + 0.05 : lat,
        longitude: isOutlier ? lng + 0.05 : lng,
        accuracy: 5,
        altitude: 20 + Math.sin(tick / 15) * 8,
        altitudeAccuracy: 3,
        heading: null,
        speed: speedMps,
        toJSON() {
          return this
        },
      },
      timestamp: Date.now(),
      toJSON() {
        return this
      },
    } as unknown as GeolocationPosition

    onPosition(position)
  }, intervalMs)

  return () => clearInterval(timer)
}

export function simEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('sim') === '1'
}
