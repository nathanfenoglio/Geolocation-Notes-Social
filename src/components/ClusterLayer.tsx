import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { Note, Visibility } from '../lib/types'

const PIN_COLORS: Record<Visibility, string> = {
  public: '#4cc38a',
  shared: '#f5a623',
  private: '#8a8aa3',
}

function pinIcon(visibility: Visibility): L.DivIcon {
  const color = PIN_COLORS[visibility]
  const html = `<span class="geo-pin"><svg viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 27 15 27s15-16 15-27C30 6.7 23.3 0 15 0z" fill="${color}"/>
    <circle cx="15" cy="14.5" r="6" fill="#14141f"/>
  </svg></span>`
  return L.divIcon({
    html,
    className: '',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  })
}

interface ClusterLayerProps {
  notes: Note[]
  onMarkerClick: (note: Note) => void
}

export default function ClusterLayer({ notes, onMarkerClick }: ClusterLayerProps) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
    })
    map.addLayer(group)
    groupRef.current = group
    return () => {
      map.removeLayer(group)
      groupRef.current = null
    }
  }, [map])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clearLayers()
    for (const note of notes) {
      const marker = L.marker([note.lat, note.lng], {
        icon: pinIcon(note.visibility),
        title: note.title || 'Note',
      })
      marker.on('click', () => clickRef.current(note))
      group.addLayer(marker)
    }
  }, [notes])

  return null
}
