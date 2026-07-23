import { useEffect, useState } from 'react'

export interface GeoPosition {
  lat: number
  lng: number
  accuracy: number
}

export interface GeolocationState {
  position: GeoPosition | null
  error: string | null
}

/**
 * Watches the device location for as long as the component is mounted.
 * Single source of truth for the user's current position.
 */
export function useGeolocation(): GeolocationState {
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) { // navigator is built in browser API
      setError('Geolocation is not supported by this browser.')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setError(null)
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable it in your browser settings.'
            : 'Could not determine your location.',
        )
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return { position, error }
}
