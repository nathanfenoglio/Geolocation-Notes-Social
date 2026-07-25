import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useAuth } from './lib/auth'
import { deleteNote, fetchNotesForFilter, fetchNotesInBounds } from './lib/notesApi'
import {
  fetchNewNotificationNotes,
  fetchNotificationSettings,
  markNotificationsSeen,
} from './lib/notificationsApi'
import { flyTargetFromNotes } from './lib/mapFit'
import { useGeolocation } from './lib/useGeolocation'
import type { Session } from '@supabase/supabase-js'
import type { GeocodeResult, MapBounds, MapNoteFilter, Note } from './lib/types'
import MapView, { type FlyTarget } from './components/MapView'
import SearchBar from './components/SearchBar'
import AuthModal from './components/AuthModal'
import NoteDetail from './components/NoteDetail'
import NoteEditor from './components/NoteEditor'
import MyNotes from './components/MyNotes'
import MyGroups from './components/MyGroups'
import NotificationsPanel from './components/NotificationsPanel'

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
  const [showMyGroups, setShowMyGroups] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifSnapshot, setNotifSnapshot] = useState<Note[]>([])
  const [notifCount, setNotifCount] = useState(0)
  const [picking, setPicking] = useState(false)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [following, setFollowing] = useState(false)
  const [mapFilter, setMapFilter] = useState<MapNoteFilter>(null)
  const { position: myPosition, error: geoError } = useGeolocation()
  const boundsRef = useRef<MapBounds | null>(null)
  const mapFilterRef = useRef<MapNoteFilter>(null)
  const fetchTimer = useRef<number | undefined>(undefined)
  const initialCentered = useRef(false)
  const prevSessionRef = useRef<Session | null>(session)
  const skipFilterFitRef = useRef(true)
  const suppressFilterFitRef = useRef(false)
  mapFilterRef.current = mapFilter

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
    fetchNotesInBounds(bounds, mapFilterRef.current)
      .then(setNotes)
      .catch((err) => console.error('Failed to load notes:', err))
  }, [])

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4000)
  }

  function handleMapFilterChange(filter: MapNoteFilter) {
    setSelected(null)
    setMapFilter(filter)
  }

  // When the user logs out, clear auth-dependent UI and reload public notes.
  useEffect(() => {
    const wasLoggedIn = !!prevSessionRef.current
    const isLoggedIn = !!session
    prevSessionRef.current = session

    if (!wasLoggedIn || isLoggedIn) return

    setSelected(null)
    setEditor(null)
    setShowMyNotes(false)
    setShowMyGroups(false)
    setShowNotifications(false)
    setNotifSnapshot([])
    setNotifCount(0)
    setShowAuth(false)
    setPicking(false)
    setFollowing(false)
    setToast(null)
    suppressFilterFitRef.current = true
    setMapFilter(null)
    mapFilterRef.current = null
    setNotes([])
    setRefreshKey((k) => k + 1)
    reloadNotes()
  }, [session, reloadNotes])

  const refreshNotifBadge = useCallback(async () => {
    if (!session?.user) {
      setNotifCount(0)
      return
    }
    try {
      const settings = await fetchNotificationSettings(session.user.id)
      const list = await fetchNewNotificationNotes(session.user.id, settings)
      setNotifCount(list.length)
    } catch (err) {
      console.error('Failed to load notification count:', err)
    }
  }, [session?.user?.id])

  useEffect(() => {
    void refreshNotifBadge()
  }, [refreshNotifBadge])

  // On filter change: fetch the full matching set and fit the map (skip first mount).
  useEffect(() => {
    if (skipFilterFitRef.current) {
      skipFilterFitRef.current = false
      return
    }
    if (suppressFilterFitRef.current) {
      suppressFilterFitRef.current = false
      return
    }

    let cancelled = false
    setFollowing(false)
    fetchNotesForFilter(mapFilter)
      .then((list) => {
        if (cancelled) return
        setNotes(list)
        if (list.length === 0) {
          showToast('No notes match')
          return
        }
        const target = flyTargetFromNotes(list)
        if (target) setFlyTo(target)
      })
      .catch((err) => console.error('Failed to load filtered notes:', err))

    return () => {
      cancelled = true
    }
  }, [mapFilter])

  const handleBoundsChange = useCallback(
    (bounds: MapBounds) => {
      boundsRef.current = bounds
      window.clearTimeout(fetchTimer.current)
      fetchTimer.current = window.setTimeout(reloadNotes, 300)
    },
    [reloadNotes],
  )

  function handleMapClick(lat: number, lng: number) {
    if (!picking) return
    setPicking(false)
    setSelected(null)
    setShowMyNotes(false)
    setShowMyGroups(false)
    setShowNotifications(false)
    setEditor({ note: null, lat, lng })
  }

  function handleAddNote() {
    if (!session) {
      setShowAuth(true)
      return
    }
    setSelected(null)
    setEditor(null)
    setShowMyNotes(false)
    setShowMyGroups(false)
    setShowNotifications(false)
    setPicking(true)
  }

  function confirmLeaveEditor(): boolean {
    if (!editor) return true
    const ok = window.confirm(
      'Discard this note draft? Unsaved changes will be lost.',
    )
    if (!ok) return false
    setEditor(null)
    return true
  }

  function requestOpenPanel(panel: 'myNotes' | 'myGroups') {
    if (!confirmLeaveEditor()) return
    setSelected(null)
    setPicking(false)
    setShowNotifications(false)
    if (panel === 'myNotes') {
      setShowMyGroups(false)
      setShowMyNotes(true)
    } else {
      setShowMyNotes(false)
      setShowMyGroups(true)
    }
  }

  async function openNotifications() {
    if (!session?.user) return
    if (!confirmLeaveEditor()) return
    setSelected(null)
    setPicking(false)
    setShowMyNotes(false)
    setShowMyGroups(false)

    try {
      const settings = await fetchNotificationSettings(session.user.id)
      const list = await fetchNewNotificationNotes(session.user.id, settings)
      setNotifSnapshot(list)
      setShowNotifications(true)
      if (list.length > 0) {
        handleMapFilterChange({
          type: 'notifications',
          noteIds: list.map((n) => n.id),
          name: 'New notes',
        })
      }
      await markNotificationsSeen(session.user.id)
      setNotifCount(0)
    } catch (err) {
      console.error('Failed to open notifications:', err)
      showToast('Could not load notifications.')
    }
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
    setShowNotifications(false)
    setSelected(note)
    setFollowing(false)
    setFlyTo({ lat: note.lat, lng: note.lng, zoom: 15 })
  }

  function handleSelectNotification(note: Note) {
    setShowNotifications(false)
    setSelected(note)
    setFollowing(false)
    setFlyTo({ lat: note.lat, lng: note.lng, zoom: 15 })
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-pin" aria-hidden="true">
            ◉
          </span>
          Geolocation Notes Social
        </div>
        <SearchBar onSelect={handleSearchSelect} />
        <div className="top-actions">
          <button className="primary" onClick={handleAddNote}>
            + Add note
          </button>
          {session ? (
            <>
              <button
                type="button"
                className="notif-bell"
                onClick={() => void openNotifications()}
                aria-label={
                  notifCount > 0
                    ? `Notifications, ${notifCount} new`
                    : 'Notifications'
                }
              >
                <span className="notif-bell-icon" aria-hidden="true">
                  🔔
                </span>
                {notifCount > 0 && (
                  <span className="notif-badge">
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </button>
              <button onClick={() => requestOpenPanel('myNotes')}>My notes</button>
              <button onClick={() => requestOpenPanel('myGroups')}>Groups</button>
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

      {!picking && mapFilter && (
        <div className="filter-chip">
          <span>
            Filtered:{' '}
            {mapFilter.type === 'author'
              ? 'my notes'
              : mapFilter.type === 'private'
                ? 'private'
                : mapFilter.name}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear map filter"
            onClick={() => handleMapFilterChange(null)}
          >
            ✕
          </button>
        </div>
      )}

      <main className="map-area">
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
            setShowMyGroups(false)
            setShowNotifications(false)
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

        {showMyNotes && !selected && !editor && !showNotifications && (
          <MyNotes
            onSelect={handleSelectFromList}
            onClose={() => setShowMyNotes(false)}
            refreshKey={refreshKey}
          />
        )}

        {showMyGroups && !selected && !editor && !showMyNotes && !showNotifications && (
          <MyGroups
            onClose={() => setShowMyGroups(false)}
            mapFilter={mapFilter}
            onMapFilterChange={handleMapFilterChange}
          />
        )}

        {showNotifications && !selected && !editor && !showMyNotes && !showMyGroups && (
          <NotificationsPanel
            notes={notifSnapshot}
            onClose={() => {
              setShowNotifications(false)
              void refreshNotifBadge()
            }}
            onSelect={handleSelectNotification}
            onSettingsChanged={() => void refreshNotifBadge()}
          />
        )}
      </main>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
