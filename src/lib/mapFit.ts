import type { Note } from './types'
import type { FlyTarget } from '../components/MapView'

const PAD = 40
const PANEL_PAD_RIGHT_DESKTOP = 420
const PANEL_PAD_RIGHT_MOBILE = 24

/** Build a fly target that fits all note markers, with padding for the side panel. */
export function flyTargetFromNotes(notes: Note[]): FlyTarget | null {
  if (notes.length === 0) return null

  const points: [number, number][] = notes.map((n) => [n.lat, n.lng])
  const lat = notes.reduce((s, n) => s + n.lat, 0) / notes.length
  const lng = notes.reduce((s, n) => s + n.lng, 0) / notes.length

  const wide = typeof window !== 'undefined' && window.innerWidth >= 720
  const right = wide ? PANEL_PAD_RIGHT_DESKTOP : PANEL_PAD_RIGHT_MOBILE

  return {
    lat,
    lng,
    bounds: points,
    paddingTopLeft: [PAD, PAD],
    paddingBottomRight: [right, PAD],
  }
}
