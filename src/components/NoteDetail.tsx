import { useAuth } from '../lib/auth'
import type { Note } from '../lib/types'
import MediaGallery from './MediaGallery'

interface NoteDetailProps {
  note: Note
  onClose: () => void
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
}

function formatDate(iso: string): string {
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(
    undefined,
    { year: 'numeric', month: 'long', day: 'numeric' },
  )
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function NoteDetail({ note, onClose, onEdit, onDelete }: NoteDetailProps) {
  const { session } = useAuth()
  const isAuthor = session?.user?.id === note.author_id

  return (
    <aside className="panel">
      <div className="panel-header">
        <span className={`badge badge-${note.visibility}`}>{note.visibility}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="panel-body">
        <h2 className="note-title">{note.title || 'Untitled note'}</h2>
        <p className="note-meta">
          by <strong>{note.author?.username ?? 'unknown'}</strong>
        </p>
        <p className="note-meta">
          About: <strong>{formatDate(note.note_date)}</strong>
          <br />
          Posted: {formatTimestamp(note.created_at)}
          {note.updated_at !== note.created_at && (
            <> (edited {formatTimestamp(note.updated_at)})</>
          )}
        </p>
        {note.body && <p className="note-body">{note.body}</p>}
        <MediaGallery media={note.note_media ?? []} />
        <p className="note-coords">
          {note.lat.toFixed(5)}, {note.lng.toFixed(5)}
        </p>
        {isAuthor && (
          <div className="panel-actions">
            <button className="primary" onClick={() => onEdit(note)}>
              Edit
            </button>
            <button
              className="danger"
              onClick={() => {
                if (confirm('Delete this note and its attachments?')) onDelete(note)
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
