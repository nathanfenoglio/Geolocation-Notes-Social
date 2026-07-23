import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { fetchMyNotes } from '../lib/notesApi'
import type { Note } from '../lib/types'

interface MyNotesProps {
  onSelect: (note: Note) => void
  onClose: () => void
  refreshKey: number
}

export default function MyNotes({ onSelect, onClose, refreshKey }: MyNotesProps) {
  const { session } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user) return
    setLoading(true)
    fetchMyNotes(session.user.id)
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [session?.user?.id, refreshKey])

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>My notes</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="panel-body">
        {loading ? (
          <p className="note-meta">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="note-meta">You haven't added any notes yet.</p>
        ) : (
          <ul className="my-notes-list">
            {notes.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onSelect(n)}>
                  <span className={`badge badge-${n.visibility}`}>{n.visibility}</span>
                  <span className="my-note-title">{n.title || 'Untitled note'}</span>
                  <span className="my-note-date">{n.note_date}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
