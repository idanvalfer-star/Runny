export type Units = 'km' | 'mi'

export const KM_PER_MILE = 1.609344

export function kmToDisplay(km: number, units: Units): number {
  return units === 'mi' ? km / KM_PER_MILE : km
}

export function displayToKm(value: number, units: Units): number {
  return units === 'mi' ? value * KM_PER_MILE : value
}

export function distanceLabel(units: Units): string {
  return units === 'mi' ? 'mi' : 'km'
}

export function paceLabel(units: Units): string {
  return units === 'mi' ? '/mi' : '/km'
}

export function formatDistance(km: number, units: Units, digits = 2): string {
  return kmToDisplay(km, units).toFixed(digits)
}

/** Pace is stored per km; convert to per-mile only for display. */
export function paceSecPerUnit(secPerKm: number, units: Units): number {
  return units === 'mi' ? secPerKm * KM_PER_MILE : secPerKm
}

/** Inverse of `paceSecPerUnit`, for chart values already in display units. */
export function secPerUnitToSecPerKm(secPerUnit: number, units: Units): number {
  return units === 'mi' ? secPerUnit / KM_PER_MILE : secPerUnit
}

/** m:ss, the conventional way to read a pace. */
export function formatPace(secPerKm: number, units: Units): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--'
  const total = Math.round(paceSecPerUnit(secPerKm, units))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** h:mm:ss once past an hour, m:ss below it. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Compact duration for plan sessions: "45 min", "1h 15m". */
export function formatMinutes(min: number): string {
  const rounded = Math.round(min)
  if (rounded < 60) return `${rounded} min`
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatPaceRange(
  range: { minSecPerKm: number; maxSecPerKm: number },
  units: Units,
): string {
  return `${formatPace(range.minSecPerKm, units)}–${formatPace(range.maxSecPerKm, units)}${paceLabel(units)}`
}
