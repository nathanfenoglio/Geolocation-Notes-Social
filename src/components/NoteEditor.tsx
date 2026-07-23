import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import {
  addShare,
  createNote,
  deleteNoteMedia,
  fetchShares,
  lookupUsername,
  mediaTypeOf,
  MAX_FILE_BYTES,
  removeShare,
  updateNote,
  uploadNoteMedia,
} from '../lib/notesApi'
import {
  addGroupShare,
  fetchMyGroups,
  fetchNoteGroupShares,
  removeGroupShare,
  type NoteGroupShare,
} from '../lib/groupsApi'
import type { Group, Note, NoteMedia, Visibility } from '../lib/types'
import MediaGallery from './MediaGallery'
import GroupCreator from './GroupCreator'

interface NoteEditorProps {
  /** Existing note when editing, null when creating */
  note: Note | null
  lat: number
  lng: number
  onSaved: (note: Note) => void
  onClose: () => void
}

interface ShareEntry {
  id: string
  username: string
}

function today(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function NoteEditor({ note, lat, lng, onSaved, onClose }: NoteEditorProps) {
  const { session } = useAuth()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [visibility, setVisibility] = useState<Visibility>(note?.visibility ?? 'private')
  const [noteDate, setNoteDate] = useState(note?.note_date ?? today())
  const [files, setFiles] = useState<File[]>([])
  const [existingMedia, setExistingMedia] = useState<NoteMedia[]>(note?.note_media ?? [])
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [shareInput, setShareInput] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [groupShares, setGroupShares] = useState<NoteGroupShare[]>([])
  const [showGroupCreator, setShowGroupCreator] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  useEffect(() => {
    if (note) {
      fetchShares(note.id)
        .then(setShares)
        .catch(() => {})
      fetchNoteGroupShares(note.id)
        .then(setGroupShares)
        .catch((err) => console.error('Failed to load group shares:', err))
    }
  }, [note?.id])

  // Load the user's groups when the shared option is in play
  useEffect(() => {
    if (visibility !== 'shared' || !session?.user) return
    fetchMyGroups()
      .then(setGroups)
      .catch((err) => console.error('Failed to load groups:', err))
  }, [visibility, session?.user?.id])

  function addFiles(list: FileList | null) {
    if (!list) return
    const next: File[] = []
    for (const file of Array.from(list)) {
      if (!mediaTypeOf(file)) {
        setError(`${file.name}: only image, video, and audio files are supported.`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name} is over the 50 MB limit.`)
        continue
      }
      next.push(file)
    }
    if (next.length > 0) setFiles((prev) => [...prev, ...next])
  }

  async function handleAddShare() {
    setShareError(null)
    const name = shareInput.trim()
    if (!name) return
    if (shares.some((s) => s.username.toLowerCase() === name.toLowerCase())) {
      setShareInput('')
      return
    }
    const user = await lookupUsername(name)
    if (!user) {
      setShareError(`No user named "${name}" found.`)
      return
    }
    if (user.id === session?.user?.id) {
      setShareError('That is you — no need to share with yourself.')
      return
    }
    setShares((prev) => [...prev, user])
    setShareInput('')
    if (note) await addShare(note.id, user.id)
  }

  async function handleRemoveShare(entry: ShareEntry) {
    setShares((prev) => prev.filter((s) => s.id !== entry.id))
    if (note) await removeShare(note.id, entry.id)
  }

  async function handleSelectGroup(groupId: string) {
    setShareError(null)
    if (!groupId || groupShares.some((g) => g.group_id === groupId)) return
    const group = groups.find((g) => g.id === groupId)
    if (!group) return
    const entry: NoteGroupShare = {
      group_id: group.id,
      name: group.name,
      member_count: group.member_count,
    }
    setGroupShares((prev) => [...prev, entry])
    if (note) {
      try {
        await addGroupShare(note.id, group.id)
      } catch (err) {
        console.error('Failed to share with group:', err)
        setGroupShares((prev) => prev.filter((g) => g.group_id !== group.id))
        setShareError('Could not share with that group.')
      }
    }
  }

  async function handleRemoveGroupShare(entry: NoteGroupShare) {
    setGroupShares((prev) => prev.filter((g) => g.group_id !== entry.group_id))
    if (note) await removeGroupShare(note.id, entry.group_id)
  }

  function handleGroupCreated(group: Group) {
    setGroups((prev) =>
      [...prev.filter((g) => g.id !== group.id), group].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )
    void handleSelectGroupCreated(group)
  }

  async function handleSelectGroupCreated(group: Group) {
    const entry: NoteGroupShare = {
      group_id: group.id,
      name: group.name,
      member_count: group.member_count,
    }
    setGroupShares((prev) =>
      prev.some((g) => g.group_id === group.id) ? prev : [...prev, entry],
    )
    if (note) {
      try {
        await addGroupShare(note.id, group.id)
      } catch (err) {
        console.error('Failed to share with new group:', err)
      }
    }
  }

  async function handleDeleteMedia(item: NoteMedia) {
    if (!confirm('Delete this attachment?')) return
    await deleteNoteMedia(item.id, item.storage_path)
    setExistingMedia((prev) => prev.filter((m) => m.id !== item.id))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!session?.user) return
    setError(null)
    setBusy(true)
    try {
      const input = { lat, lng, title, body, visibility, note_date: noteDate }
      let saved: Note
      if (note) {
        saved = await updateNote(note.id, input)
      } else {
        saved = await createNote(session.user.id, input)
        for (const entry of shares) {
          await addShare(saved.id, entry.id)
        }
        for (const entry of groupShares) {
          await addGroupShare(saved.id, entry.group_id)
        }
      }
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`)
        await uploadNoteMedia(session.user.id, saved.id, files[i])
      }
      onSaved(saved)
    } catch (err) {
      console.error('Failed to save note:', err)
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Something went wrong saving the note.'
      setError(message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>{note ? 'Edit note' : 'New note'}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <form className="panel-body form-stack" onSubmit={handleSubmit}>
        <p className="note-coords">
          Location: {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
        <div>
          <label htmlFor="ne-title">Title</label>
          <input
            id="ne-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. The old blue house"
          />
        </div>
        <div>
          <label htmlFor="ne-body">Note</label>
          <textarea
            id="ne-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Share an experience, some trivia, a memory…"
          />
        </div>
        <div>
          <label htmlFor="ne-date">Date this note is about</label>
          <input
            id="ne-date"
            type="date"
            value={noteDate}
            max={today()}
            onChange={(e) => setNoteDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="ne-visibility">Who can see it</label>
          <select
            id="ne-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            <option value="private">Private — only me</option>
            <option value="shared">Shared — specific users</option>
            <option value="public">Public — everyone</option>
          </select>
        </div>

        {visibility === 'shared' && (
          <div className="share-box">
            <label htmlFor="ne-share">Share with (username)</label>
            <div className="share-row">
              <input
                id="ne-share"
                value={shareInput}
                onChange={(e) => setShareInput(e.target.value)}
                placeholder="username"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAddShare()
                  }
                }}
              />
              <button type="button" onClick={() => void handleAddShare()}>
                Add
              </button>
            </div>
            <div className="group-share-row">
              <div className="group-share-select">
                <label htmlFor="ne-group">Share with group</label>
                <div className="share-row">
                  <select
                    id="ne-group"
                    value=""
                    onChange={(e) => void handleSelectGroup(e.target.value)}
                  >
                    <option value="">
                      {groups.length === 0 ? 'No groups yet' : 'Select a group…'}
                    </option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.member_count}{' '}
                        {g.member_count === 1 ? 'member' : 'members'})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowGroupCreator((v) => !v)}
                    title="Create a new group"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            {showGroupCreator && (
              <GroupCreator
                onCreated={handleGroupCreated}
                onClose={() => setShowGroupCreator(false)}
              />
            )}
            {shareError && <p className="form-error">{shareError}</p>}
            {(shares.length > 0 || groupShares.length > 0) && (
              <ul className="share-list">
                {groupShares.map((g) => (
                  <li key={`group-${g.group_id}`} className="group-chip">
                    {g.name} ({g.member_count}{' '}
                    {g.member_count === 1 ? 'member' : 'members'})
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void handleRemoveGroupShare(g)}
                      aria-label={`Stop sharing with group ${g.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {shares.map((s) => (
                  <li key={s.id}>
                    {s.username}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void handleRemoveShare(s)}
                      aria-label={`Stop sharing with ${s.username}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <label htmlFor="ne-media">Attachments (image / video / audio, max 50 MB each)</label>
          <input
            id="ne-media"
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {files.length > 0 && (
            <ul className="pending-files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {existingMedia.length > 0 && (
          <div>
            <label>Existing attachments</label>
            <MediaGallery media={existingMedia} onDelete={handleDeleteMedia} />
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
        {progress && <p className="form-info">{progress}</p>}
        <div className="panel-actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : note ? 'Save changes' : 'Add note'}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </aside>
  )
}
