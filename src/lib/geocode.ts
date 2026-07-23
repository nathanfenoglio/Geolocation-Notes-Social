import type { GeocodeResult } from './types'

// Nominatim usage policy: max 1 request/second, meaningful User-Agent,
// and attribution (shown in the map's attribution control).
const BASE = 'https://nominatim.openstreetmap.org/search'

let lastRequest = 0

export async function searchPlaces(query: string): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  // Enforce >= 1s spacing between requests
  const now = Date.now()
  const wait = Math.max(0, 1000 - (now - lastRequest))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequest = Date.now()

  const url = `${BASE}?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  return (await res.json()) as GeocodeResult[]
}
