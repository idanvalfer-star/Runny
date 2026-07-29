import type { Activity, ActivityType, HrSample, RoutePoint } from '../types'
import { buildActivity } from './activity'

/**
 * GPX / TCX import for browsers without Web Bluetooth (iOS Safari, mainly) and
 * for backfilling history from Garmin, Apple Watch or Strava exports.
 *
 * Heart rate lives in an extension namespace in GPX — Garmin's `gpxtpx:hr` and
 * the older `gpxdata:hr` are both common, so both are read.
 */
export function parseGpx(
  xml: string,
  type: ActivityType,
  weightKg: number,
): Activity | undefined {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return undefined

  const trkpts = Array.from(doc.getElementsByTagName('trkpt'))
  if (trkpts.length === 0) return undefined

  const route: RoutePoint[] = []
  const hrSamples: HrSample[] = []

  for (const pt of trkpts) {
    const lat = Number(pt.getAttribute('lat'))
    const lng = Number(pt.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const timeText = pt.getElementsByTagName('time')[0]?.textContent
    const timestamp = timeText ? Date.parse(timeText) : NaN
    if (!Number.isFinite(timestamp)) continue

    const eleText = pt.getElementsByTagName('ele')[0]?.textContent
    const elevation = eleText ? Number(eleText) : undefined

    route.push({
      lat,
      lng,
      timestamp,
      elevation: Number.isFinite(elevation) ? elevation : undefined,
    })

    const hrText = findHeartRate(pt)
    if (hrText !== undefined) hrSamples.push({ timestamp, bpm: hrText })
  }

  if (route.length < 2) return undefined

  const startTime = route[0].timestamp
  const endTime = route[route.length - 1].timestamp
  const elapsedSec = (endTime - startTime) / 1000

  return buildActivity({
    type,
    startTime,
    endTime,
    route,
    hrSamples,
    // An import has no pause record, so moving time is elapsed time.
    movingTimeSec: elapsedSec,
    elapsedTimeSec: elapsedSec,
    weightKg,
    source: 'import',
  })
}

function findHeartRate(pt: Element): number | undefined {
  // Namespace prefixes vary between exporters; match on local name instead.
  const candidates = Array.from(pt.getElementsByTagName('*')).filter((el) => {
    const local = el.localName?.toLowerCase()
    return local === 'hr' || local === 'heartratebpm'
  })
  for (const el of candidates) {
    const value = Number(el.textContent)
    if (Number.isFinite(value) && value > 0) return value
  }
  return undefined
}

/**
 * Minimal CSV import: one row per sample, with headers. Column names are
 * matched loosely because every exporter names them differently.
 */
export function parseCsv(
  text: string,
  type: ActivityType,
  weightKg: number,
): Activity | undefined {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 3) return undefined

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) =>
    headers.findIndex((h) => names.some((n) => h.includes(n)))

  const latIdx = col('lat')
  const lngIdx = col('lon', 'lng')
  const timeIdx = col('time', 'timestamp', 'date')
  const eleIdx = col('ele', 'alt')
  const hrIdx = col('hr', 'heart')

  if (latIdx < 0 || lngIdx < 0 || timeIdx < 0) return undefined

  const route: RoutePoint[] = []
  const hrSamples: HrSample[] = []

  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    const lat = Number(cells[latIdx])
    const lng = Number(cells[lngIdx])
    const raw = cells[timeIdx]?.trim()
    // Accept both ISO strings and epoch values.
    const timestamp = /^\d+$/.test(raw ?? '') ? Number(raw) : Date.parse(raw ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(timestamp)) {
      continue
    }

    const elevation = eleIdx >= 0 ? Number(cells[eleIdx]) : undefined
    route.push({
      lat,
      lng,
      timestamp,
      elevation: Number.isFinite(elevation) ? elevation : undefined,
    })

    if (hrIdx >= 0) {
      const bpm = Number(cells[hrIdx])
      if (Number.isFinite(bpm) && bpm > 0) hrSamples.push({ timestamp, bpm })
    }
  }

  if (route.length < 2) return undefined

  const startTime = route[0].timestamp
  const endTime = route[route.length - 1].timestamp
  const elapsedSec = (endTime - startTime) / 1000

  return buildActivity({
    type,
    startTime,
    endTime,
    route,
    hrSamples,
    movingTimeSec: elapsedSec,
    elapsedTimeSec: elapsedSec,
    weightKg,
    source: 'import',
  })
}

export function parseActivityFile(
  filename: string,
  content: string,
  type: ActivityType,
  weightKg: number,
): Activity | undefined {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) return parseCsv(content, type, weightKg)
  // .gpx and .tcx are both XML with trackpoints; the GPX reader handles both
  // well enough because it matches on local element names.
  return parseGpx(content, type, weightKg)
}
