import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { MapBounds, Note } from '../lib/types'
import type { GeoPosition } from '../lib/useGeolocation'
import ClusterLayer from './ClusterLayer'
import CurrentLocationLayer from './CurrentLocationLayer'

export interface FlyTarget {
  lat: number
  lng: number
  zoom?: number
  bounds?: LatLngBoundsExpression
}

interface MapViewProps {
  notes: Note[]
  flyTo: FlyTarget | null
  picking: boolean
  myPosition: GeoPosition | null
  following: boolean
  onBoundsChange: (bounds: MapBounds) => void
  onMapClick: (lat: number, lng: number) => void
  onMarkerClick: (note: Note) => void
  onLocateClick: () => void
  onFollowBroken: () => void
}

function toBounds(map: L.Map): MapBounds {
  const b = map.getBounds()
  return {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest(),
  }
}

function MapEvents({
  onBoundsChange,
  onMapClick,
}: {
  onBoundsChange: (b: MapBounds) => void
  onMapClick: (lat: number, lng: number) => void
}) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(toBounds(map)),
    zoomend: () => onBoundsChange(toBounds(map)),
    click: (e) => onMapClick(e.latlng.lat, e.latlng.lng),
  })

  useEffect(() => {
    onBoundsChange(toBounds(map))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

function FlyController({
  target,
  programmaticMoveRef,
}: {
  target: FlyTarget | null
  programmaticMoveRef: React.RefObject<boolean>
}) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    programmaticMoveRef.current = true
    const done = () => {
      programmaticMoveRef.current = false
    }
    map.once('moveend', done)
    if (target.bounds) {
      map.flyToBounds(target.bounds, { duration: 1.2, maxZoom: 16 })
    } else {
      map.flyTo([target.lat, target.lng], target.zoom ?? 14, { duration: 1.2 })
    }
    return () => {
      map.off('moveend', done)
    }
  }, [target, map, programmaticMoveRef])
  return null
}

export default function MapView({
  notes,
  flyTo,
  picking,
  myPosition,
  following,
  onBoundsChange,
  onMapClick,
  onMarkerClick,
  onLocateClick,
  onFollowBroken,
}: MapViewProps) {
  const programmaticMoveRef = useRef(false)

  return (
    <div className={`map-wrap${picking ? ' picking' : ''}`}>
      <MapContainer
        center={[25, 10]}
        zoom={3}
        minZoom={2}
        worldCopyJump
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Search by <a href="https://nominatim.org">Nominatim</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents onBoundsChange={onBoundsChange} onMapClick={onMapClick} />
        <FlyController target={flyTo} programmaticMoveRef={programmaticMoveRef} />
        <ClusterLayer notes={notes} onMarkerClick={onMarkerClick} />
        <CurrentLocationLayer
          position={myPosition}
          following={following}
          programmaticMoveRef={programmaticMoveRef}
          onFollowBroken={onFollowBroken}
        />
      </MapContainer>
      <button
        type="button"
        className={`locate-btn${following ? ' active' : ''}`}
        onClick={onLocateClick}
        title="Go to my location"
        aria-label="Go to my location"
        aria-pressed={following}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-1.07A8.006 8.006 0 0 0 13 4.07V3a1 1 0 1 0-2 0v1.07A8.006 8.006 0 0 0 4.07 11H3a1 1 0 1 0 0 2h1.07A8.006 8.006 0 0 0 11 19.93V21a1 1 0 1 0 2 0v-1.07A8.006 8.006 0 0 0 19.93 13H21a1 1 0 1 0 0-2zm-9 7a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"
          />
        </svg>
      </button>
    </div>
  )
}
