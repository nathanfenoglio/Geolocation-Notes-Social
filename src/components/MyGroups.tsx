import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { fetchGroupsPanelItems } from '../lib/groupsApi'
import type { Group, GroupsPanelItem, MapNoteFilter } from '../lib/types'
import GroupCreator from './GroupCreator'

type ListTab = 'owner' | 'all'

interface MyGroupsProps {
  onClose: () => void
  mapFilter: MapNoteFilter
  onMapFilterChange: (filter: MapNoteFilter) => void
}

export default function MyGroups({
  onClose,
  mapFilter,
  onMapFilterChange,
}: MyGroupsProps) {
  const { session } = useAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [directShares, setDirectShares] = useState<
    Extract<GroupsPanelItem, { kind: 'direct' }>[]
  >([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [listTab, setListTab] = useState<ListTab>(
    mapFilter?.type === 'author' ? 'owner' : 'all',
  )

  useEffect(() => {
    if (!session?.user) return
    setLoading(true)
    fetchGroupsPanelItems(session.user.id)
      .then(({ groups: g, items }) => {
        setGroups(g)
        setDirectShares(items.filter((i) => i.kind === 'direct'))
      })
      .catch((err) => {
        console.error('Failed to load groups:', err)
        setGroups([])
        setDirectShares([])
      })
      .finally(() => setLoading(false))
  }, [session?.user?.id])

  const visibleGroups = useMemo(() => {
    if (!session?.user) return []
    if (listTab === 'owner') {
      return groups.filter((g) => g.owner_id === session.user.id)
    }
    return groups
  }, [groups, listTab, session?.user?.id])

  const selectedGroupId = mapFilter?.type === 'group' ? mapFilter.groupId : null
  const selectedSharerId = mapFilter?.type === 'direct' ? mapFilter.sharerId : null

  function clearToTabDefault() {
    if (listTab === 'owner' && session?.user) {
      onMapFilterChange({ type: 'author', userId: session.user.id })
    } else {
      onMapFilterChange(null)
    }
  }

  function handleTab(tab: ListTab) {
    setListTab(tab)
    setExpandedId(null)
    if (tab === 'owner' && session?.user) {
      onMapFilterChange({ type: 'author', userId: session.user.id })
    } else {
      onMapFilterChange(null)
    }
  }

  function handleGroupClick(group: Group) {
    if (selectedGroupId === group.id) {
      clearToTabDefault()
      setExpandedId(null)
      return
    }
    onMapFilterChange({ type: 'group', groupId: group.id, name: group.name })
    setExpandedId(group.id)
  }

  function handleDirectClick(item: Extract<GroupsPanelItem, { kind: 'direct' }>) {
    if (!session?.user) return
    setExpandedId(null)
    if (selectedSharerId === item.sharerId) {
      clearToTabDefault()
      return
    }
    onMapFilterChange({
      type: 'direct',
      sharerId: item.sharerId,
      viewerId: session.user.id,
      name: `From ${item.username}`,
    })
  }

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

  const listEmpty =
    visibleGroups.length === 0 &&
    (listTab === 'owner' || directShares.length === 0) &&
    !creating

  const emptyCopy =
    listTab === 'owner'
      ? "You haven't created any groups yet. Groups let you share a note with many people at once."
      : "You're not in any groups yet, and no one has shared notes with you directly. Create a group or ask someone to share."

  return (
    <aside className="panel">
      <div className="panel-header">
        <div className="panel-segments" role="tablist" aria-label="Group list">
          <button
            type="button"
            role="tab"
            aria-selected={listTab === 'owner'}
            className={listTab === 'owner' ? 'active' : undefined}
            onClick={() => handleTab('owner')}
          >
            Owner
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listTab === 'all'}
            className={listTab === 'all' ? 'active' : undefined}
            onClick={() => handleTab('all')}
          >
            All
          </button>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="panel-body">
        {loading ? (
          <p className="note-meta">Loading…</p>
        ) : (
          <>
            {listEmpty && <p className="note-meta">{emptyCopy}</p>}
            <ul className="my-groups-list">
              {visibleGroups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={[
                      'my-group-row',
                      expandedId === g.id ? 'expanded' : '',
                      selectedGroupId === g.id ? 'filter-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleGroupClick(g)}
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
              {listTab === 'all' &&
                directShares.map((item) => (
                  <li key={`direct-${item.sharerId}`}>
                    <button
                      type="button"
                      className={[
                        'my-group-row',
                        'direct-share-row',
                        selectedSharerId === item.sharerId ? 'filter-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => handleDirectClick(item)}
                    >
                      <span className="my-group-name">From {item.username}</span>
                      <span className="my-group-count">
                        {item.noteCount}{' '}
                        {item.noteCount === 1 ? 'note' : 'notes'}
                      </span>
                    </button>
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
