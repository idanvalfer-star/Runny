import { MapContainer, Polyline, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import type { LatLngBoundsExpression } from 'leaflet'
import type { RoutePoint } from '../types'
import { routeBounds } from '../lib/geo'
import 'leaflet/dist/leaflet.css'

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | undefined }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] })
  }, [bounds, map])
  return null
}

export function RouteMap({
  route,
  className,
}: {
  route: RoutePoint[]
  className?: string
}) {
  const bounds = routeBounds(route)
  if (route.length < 2 || !bounds) {
    return (
      <div
        className={
          className ??
          'flex h-48 items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }
      >
        No route recorded for this activity
      </div>
    )
  }

  const positions = route.map((p) => [p.lat, p.lng] as [number, number])
  const start = positions[0]
  const end = positions[positions.length - 1]

  return (
    <div className={className ?? 'h-64 overflow-hidden rounded-2xl'}>
      <MapContainer
        bounds={bounds}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={positions} pathOptions={{ color: '#059669', weight: 4 }} />
        <CircleMarker
          center={start}
          radius={6}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#10b981', fillOpacity: 1 }}
        />
        <CircleMarker
          center={end}
          radius={6}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}
        />
        <FitBounds bounds={bounds} />
      </MapContainer>
    </div>
  )
}
