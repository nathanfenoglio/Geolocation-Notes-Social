import { useEffect, useMemo, type RefObject } from 'react'
import { Circle, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { GeoPosition } from '../lib/useGeolocation'

const dotIcon = L.divIcon({
  html: '<span class="me-dot"><span class="me-dot-pulse"></span><span class="me-dot-core"></span></span>',
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

interface CurrentLocationLayerProps {
  position: GeoPosition | null
  following: boolean
  /** Set to true while the app itself is moving the map (fly-to), so it doesn't break follow mode */
  programmaticMoveRef: RefObject<boolean>
  onFollowBroken: () => void
}

export default function CurrentLocationLayer({
  position,
  following,
  programmaticMoveRef,
  onFollowBroken,
}: CurrentLocationLayerProps) {
  const map = useMap()

  // Keep the user centered while follow mode is on
  useEffect(() => {
    if (following && position) {
      map.panTo([position.lat, position.lng], { animate: true })
    }
  }, [following, position, map])

  // Manual interaction breaks follow mode; programmatic moves don't
  useMapEvents({
    dragstart: () => {
      if (following) onFollowBroken()
    },
    zoomstart: () => {
      if (following && !programmaticMoveRef.current) onFollowBroken()
    },
  })

  const latLng = useMemo(
    () => (position ? ([position.lat, position.lng] as [number, number]) : null),
    [position],
  )

  if (!latLng || !position) return null

  return (
    <>
      {position.accuracy > 25 && (
        <Circle
          center={latLng}
          radius={position.accuracy}
          pathOptions={{
            color: '#4a90d9',
            weight: 1,
            opacity: 0.4,
            fillColor: '#4a90d9',
            fillOpacity: 0.12,
          }}
        />
      )}
      <Marker
        position={latLng}
        icon={dotIcon}
        zIndexOffset={1000}
        interactive={false}
      />
    </>
  )
}
