import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { lookupUsername } from '../lib/notesApi'
import {
  addGroupMember,
  createGroup,
  fetchGroupMembers,
  removeGroupMember,
} from '../lib/groupsApi'
import type { Group, Profile } from '../lib/types'

interface GroupCreatorProps {
  /** Existing group -> edit mode (member changes save immediately). Absent -> create mode. */
  group?: Group | null
  onCreated?: (group: Group) => void
  onMembersChanged?: (groupId: string, memberCount: number) => void
  onClose: () => void
}

export default function GroupCreator({
  group,
  onCreated,
  onMembersChanged,
  onClose,
}: GroupCreatorProps) {
  const { session } = useAuth()
  const isEdit = !!group
  const [name, setName] = useState(group?.name ?? '')
  const [members, setMembers] = useState<Profile[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!group) return
    fetchGroupMembers(group.id)
      .then(setMembers)
      .catch((err) => console.error('Failed to load group members:', err))
  }, [group?.id])

  async function handleAddMember() {
    setError(null)
    const username = input.trim()
    if (!username) return
    if (members.some((m) => m.username.toLowerCase() === username.toLowerCase())) {
      setInput('')
      return
    }
    const user = await lookupUsername(username)
    if (!user) {
      setError(`No user named "${username}" found.`)
      return
    }
    if (user.id === session?.user?.id) {
      setError('You are the group owner — no need to add yourself.')
      return
    }
    try {
      if (isEdit && group) {
        await addGroupMember(group.id, user.id)
        onMembersChanged?.(group.id, members.length + 1)
      }
      setMembers((prev) => [...prev, user])
      setInput('')
    } catch (err) {
      console.error('Failed to add group member:', err)
      setError('Could not add that user to the group.')
    }
  }

  async function handleRemoveMember(user: Profile) {
    try {
      if (isEdit && group) {
        await removeGroupMember(group.id, user.id)
        onMembersChanged?.(group.id, members.length - 1)
      }
      setMembers((prev) => prev.filter((m) => m.id !== user.id))
    } catch (err) {
      console.error('Failed to remove group member:', err)
      setError('Could not remove that user from the group.')
    }
  }

  async function handleCreate() {
    if (!session?.user) return
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please give the group a name.')
      return
    }
    setBusy(true)
    try {
      const created = await createGroup(
        session.user.id,
        trimmed,
        members.map((m) => m.id),
      )
      onCreated?.(created)
      onClose()
    } catch (err) {
      console.error('Failed to create group:', err)
      let message = 'Could not create the group.'
      if (err && typeof err === 'object') {
        if ('code' in err && err.code === '23505') {
          message = 'You already have a group with that name.'
        } else if ('message' in err && typeof err.message === 'string') {
          message = err.message
        }
      }
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group-creator">
      {!isEdit && (
        <div>
          <label htmlFor="gc-name">Group name</label>
          <input
            id="gc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hiking friends"
            maxLength={60}
            required
          />
        </div>
      )}
      <div>
        <label htmlFor="gc-member">Add user (username)</label>
        <div className="share-row">
          <input
            id="gc-member"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="username"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAddMember()
              }
            }}
          />
          <button type="button" onClick={() => void handleAddMember()}>
            Add
          </button>
        </div>
      </div>
      {members.length > 0 && (
        <ul className="share-list">
          {members.map((m) => (
            <li key={m.id}>
              {m.username}
              <button
                type="button"
                className="icon-btn"
                onClick={() => void handleRemoveMember(m)}
                aria-label={`Remove ${m.username} from group`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="group-creator-actions">
        {!isEdit && (
          <button type="button" className="primary" onClick={() => void handleCreate()} disabled={busy}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
        )}
        <button type="button" onClick={onClose} disabled={busy}>
          {isEdit ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
