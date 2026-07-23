import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useAuth } from './lib/auth'
import { deleteNote, fetchNotesInBounds } from './lib/notesApi'
import { useGeolocation } from './lib/useGeolocation'
import type { GeocodeResult, MapBounds, Note } from './lib/types'
import MapView, { type FlyTarget } from './components/MapView'
import SearchBar from './components/SearchBar'
import AuthModal from './components/AuthModal'
import NoteDetail from './components/NoteDetail'
import NoteEditor from './components/NoteEditor'
import MyNotes from './components/MyNotes'

interface EditorState {
  note: Note | null
  lat: number
  lng: number
}

export default function App() {
  const { session, profile, signOut } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showMyNotes, setShowMyNotes] = useState(false)
  const [picking, setPicking] = useState(false)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [following, setFollowing] = useState(false)
  const { position: myPosition, error: geoError } = useGeolocation()
  const boundsRef = useRef<MapBounds | null>(null)
  const fetchTimer = useRef<number | undefined>(undefined)
  const initialCentered = useRef(false)

  // Center the map on the user's location once, when the first fix arrives.
  // Skipped if the map has already been sent somewhere (e.g. a search).
  useEffect(() => {
    if (!myPosition || initialCentered.current) return
    initialCentered.current = true
    setFlyTo((current) => current ?? { lat: myPosition.lat, lng: myPosition.lng, zoom: 15 })
  }, [myPosition])

  const reloadNotes = useCallback(() => {
    const bounds = boundsRef.current
    if (!bounds) return
    fetchNotesInBounds(bounds)
      .then(setNotes)
      .catch((err) => console.error('Failed to load notes:', err))
  }, [])

  const handleBoundsChange = useCallback(
    (bounds: MapBounds) => {
      boundsRef.current = bounds
      window.clearTimeout(fetchTimer.current)
      fetchTimer.current = window.setTimeout(reloadNotes, 300)
    },
    [reloadNotes],
  )

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4000)
  }

  function handleMapClick(lat: number, lng: number) {
    if (!picking) return
    setPicking(false)
    setSelected(null)
    setShowMyNotes(false)
    setEditor({ note: null, lat, lng })
  }

  function handleAddNote() {
    if (!session) {
      setShowAuth(true)
      return
    }
    setSelected(null)
    setEditor(null)
    setPicking(true)
  }

  function handleUseMyLocation() {
    // The live watch usually already has a fix; fall back to a one-shot request.
    if (myPosition) {
      setPicking(false)
      setFollowing(false)
      setFlyTo({ lat: myPosition.lat, lng: myPosition.lng, zoom: 16 })
      setEditor({ note: null, lat: myPosition.lat, lng: myPosition.lng })
      return
    }
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setPicking(false)
        setFollowing(false)
        setFlyTo({ lat: latitude, lng: longitude, zoom: 16 })
        setEditor({ note: null, lat: latitude, lng: longitude })
      },
      () => showToast('Could not get your location. Check browser permissions.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function handleLocateClick() {
    if (!myPosition) {
      showToast(geoError ?? 'Waiting for your location…')
      return
    }
    setFlyTo({ lat: myPosition.lat, lng: myPosition.lng, zoom: 16 })
    setFollowing(true)
  }

  function handleSearchSelect(result: GeocodeResult) {
    const [south, north, west, east] = result.boundingbox.map(Number)
    setFollowing(false)
    setFlyTo({
      lat: Number(result.lat),
      lng: Number(result.lon),
      bounds: [
        [south, west],
        [north, east],
      ],
    })
  }

  function handleSaved(note: Note) {
    setEditor(null)
    setRefreshKey((k) => k + 1)
    reloadNotes()
    setFollowing(false)
    setFlyTo({ lat: note.lat, lng: note.lng, zoom: 15 })
    showToast(editorWasEdit(note) ? 'Note updated.' : 'Note added to the map.')
  }

  function editorWasEdit(note: Note): boolean {
    return note.created_at !== note.updated_at
  }

  async function handleDelete(note: Note) {
    try {
      await deleteNote(note)
      setSelected(null)
      setRefreshKey((k) => k + 1)
      reloadNotes()
      showToast('Note deleted.')
    } catch {
      showToast('Could not delete the note.')
    }
  }

  function handleSelectFromList(note: Note) {
    setShowMyNotes(false)
    setSelected(note)
    setFollowing(false)
    setFlyTo({ lat: note.lat, lng: note.lng, zoom: 15 })
  }

  const panelOpen = selected !== null || editor !== null || showMyNotes

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-pin" aria-hidden="true">
            ◉
          </span>
          Geo Notes
        </div>
        <SearchBar onSelect={handleSearchSelect} />
        <div className="top-actions">
          <button className="primary" onClick={handleAddNote}>
            + Add note
          </button>
          {session ? (
            <>
              <button onClick={() => setShowMyNotes(true)}>My notes</button>
              <button onClick={() => void signOut()} title={profile?.username}>
                Log out{profile ? ` (${profile.username})` : ''}
              </button>
            </>
          ) : (
            <button onClick={() => setShowAuth(true)}>Log in</button>
          )}
        </div>
      </header>

      {picking && (
        <div className="pick-banner">
          <span>Tap anywhere on the map to place your note</span>
          <button onClick={handleUseMyLocation}>Use my location</button>
          <button onClick={() => setPicking(false)}>Cancel</button>
        </div>
      )}

      <main className={`map-area${panelOpen ? ' with-panel' : ''}`}>
        <MapView
          notes={notes}
          flyTo={flyTo}
          picking={picking}
          myPosition={myPosition}
          following={following}
          onBoundsChange={handleBoundsChange}
          onMapClick={handleMapClick}
          onMarkerClick={(note) => {
            setEditor(null)
            setShowMyNotes(false)
            setSelected(note)
          }}
          onLocateClick={handleLocateClick}
          onFollowBroken={() => setFollowing(false)}
        />

        {selected && !editor && (
          <NoteDetail
            note={selected}
            onClose={() => setSelected(null)}
            onEdit={(note) => {
              setSelected(null)
              setEditor({ note, lat: note.lat, lng: note.lng })
            }}
            onDelete={(note) => void handleDelete(note)}
          />
        )}

        {editor && (
          <NoteEditor
            note={editor.note}
            lat={editor.lat}
            lng={editor.lng}
            onSaved={handleSaved}
            onClose={() => setEditor(null)}
          />
        )}

        {showMyNotes && !selected && !editor && (
          <MyNotes
            onSelect={handleSelectFromList}
            onClose={() => setShowMyNotes(false)}
            refreshKey={refreshKey}
          />
        )}
      </main>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
