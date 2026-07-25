import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import {
  REACTION_EMOJIS,
  addReply,
  deleteReply,
  fetchReactions,
  fetchReplies,
  toggleReaction,
} from '../lib/engagementApi'
import type { Note, NoteReaction, NoteReply } from '../lib/types'
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
  const userId = session?.user?.id
  const isAuthor = userId === note.author_id

  const [replies, setReplies] = useState<NoteReply[]>([])
  const [reactions, setReactions] = useState<NoteReaction[]>([])
  const [loadingEngagement, setLoadingEngagement] = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingEngagement(true)
    setError(null)
    setShowPicker(false)
    setReplyBody('')
    Promise.all([fetchReplies(note.id), fetchReactions(note.id)])
      .then(([r, rx]) => {
        if (cancelled) return
        setReplies(r)
        setReactions(rx)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError('Failed to load replies and reactions')
      })
      .finally(() => {
        if (!cancelled) setLoadingEngagement(false)
      })
    return () => {
      cancelled = true
    }
  }, [note.id])

  const reactionGroups = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>()
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
      cur.count += 1
      if (userId && r.user_id === userId) cur.mine = true
      map.set(r.emoji, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
  }, [reactions, userId])

  async function handleToggleReaction(emoji: string) {
    if (!userId) return
    setBusyKey(`rx:${emoji}`)
    setError(null)
    try {
      await toggleReaction(note.id, userId, emoji)
      setReactions(await fetchReactions(note.id))
      setShowPicker(false)
    } catch (err) {
      console.error(err)
      setError('Could not update reaction')
    } finally {
      setBusyKey(null)
    }
  }

  async function handlePostReply(e: FormEvent) {
    e.preventDefault()
    if (!userId || !replyBody.trim()) return
    setBusyKey('reply')
    setError(null)
    try {
      const created = await addReply(note.id, userId, replyBody)
      setReplies((prev) => [...prev, created])
      setReplyBody('')
    } catch (err) {
      console.error(err)
      setError('Could not post reply')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDeleteReply(replyId: string) {
    if (!userId) return
    setBusyKey(`del:${replyId}`)
    setError(null)
    try {
      await deleteReply(replyId)
      setReplies((prev) => prev.filter((r) => r.id !== replyId))
    } catch (err) {
      console.error(err)
      setError('Could not delete reply')
    } finally {
      setBusyKey(null)
    }
  }

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

        <section className="note-engagement">
          <h3 className="note-engagement-heading">Reactions</h3>
          {loadingEngagement ? (
            <p className="note-meta">Loading…</p>
          ) : (
            <div className="reaction-row">
              {reactionGroups.map((g) => (
                <button
                  key={g.emoji}
                  type="button"
                  className={`reaction-chip${g.mine ? ' active' : ''}`}
                  disabled={!userId || busyKey === `rx:${g.emoji}`}
                  onClick={() => void handleToggleReaction(g.emoji)}
                  aria-pressed={g.mine}
                  title={userId ? (g.mine ? 'Remove reaction' : 'Add reaction') : undefined}
                >
                  <span aria-hidden="true">{g.emoji}</span>
                  <span>{g.count}</span>
                </button>
              ))}
              {userId && (
                <div className="reaction-picker-wrap">
                  <button
                    type="button"
                    className="reaction-chip add"
                    aria-label="Add reaction"
                    aria-expanded={showPicker}
                    onClick={() => setShowPicker((v) => !v)}
                  >
                    +
                  </button>
                  {showPicker && (
                    <div className="reaction-picker" role="listbox" aria-label="Emoji picker">
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="reaction-pick"
                          disabled={busyKey === `rx:${emoji}`}
                          onClick={() => void handleToggleReaction(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!userId && reactionGroups.length === 0 && (
                <p className="note-meta">Sign in to react.</p>
              )}
            </div>
          )}

          <h3 className="note-engagement-heading">Replies</h3>
          {loadingEngagement ? null : replies.length === 0 ? (
            <p className="note-meta">No replies yet.</p>
          ) : (
            <ul className="reply-list">
              {replies.map((r) => (
                <li key={r.id} className="reply-item">
                  <div className="reply-meta">
                    <strong>{r.author?.username ?? 'someone'}</strong>
                    <span>{formatTimestamp(r.created_at)}</span>
                    {userId === r.author_id && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={busyKey === `del:${r.id}`}
                        onClick={() => void handleDeleteReply(r.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="reply-body">{r.body}</p>
                </li>
              ))}
            </ul>
          )}

          {userId ? (
            <form className="reply-composer" onSubmit={(e) => void handlePostReply(e)}>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply…"
                rows={3}
                maxLength={2000}
                disabled={busyKey === 'reply'}
              />
              <button
                type="submit"
                className="primary"
                disabled={busyKey === 'reply' || !replyBody.trim()}
              >
                Post
              </button>
            </form>
          ) : (
            <p className="note-meta">Sign in to reply.</p>
          )}

          {error && <p className="form-error">{error}</p>}
        </section>

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
