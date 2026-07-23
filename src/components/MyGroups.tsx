import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { fetchMyGroups } from '../lib/groupsApi'
import type { Group } from '../lib/types'
import GroupCreator from './GroupCreator'

interface MyGroupsProps {
  onClose: () => void
}

export default function MyGroups({ onClose }: MyGroupsProps) {
  const { session } = useAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!session?.user) return
    setLoading(true)
    fetchMyGroups()
      .then((all) => setGroups(all.filter((g) => g.owner_id === session.user.id)))
      .catch((err) => {
        console.error('Failed to load groups:', err)
        setGroups([])
      })
      .finally(() => setLoading(false))
  }, [session?.user?.id])

  function handleMembersChanged(groupId: string, memberCount: number) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, member_count: memberCount } : g)),
    )
  }

  function handleCreated(group: Group) {
    setGroups((prev) =>
      [...prev, group].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setCreating(false)
  }

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>My groups</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="panel-body">
        {loading ? (
          <p className="note-meta">Loading…</p>
        ) : (
          <>
            {groups.length === 0 && !creating && (
              <p className="note-meta">
                You haven't created any groups yet. Groups let you share a note
                with many people at once.
              </p>
            )}
            <ul className="my-groups-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={`my-group-row${expandedId === g.id ? ' expanded' : ''}`}
                    onClick={() =>
                      setExpandedId((cur) => (cur === g.id ? null : g.id))
                    }
                  >
                    <span className="my-group-name">{g.name}</span>
                    <span className="my-group-count">
                      {g.member_count}{' '}
                      {g.member_count === 1 ? 'member' : 'members'}
                    </span>
                  </button>
                  {expandedId === g.id && (
                    <GroupCreator
                      group={g}
                      onMembersChanged={handleMembersChanged}
                      onClose={() => setExpandedId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {creating ? (
              <GroupCreator
                onCreated={handleCreated}
                onClose={() => setCreating(false)}
              />
            ) : (
              <button
                type="button"
                className="primary new-group-btn"
                onClick={() => {
                  setCreating(true)
                  setExpandedId(null)
                }}
              >
                + New group
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
