import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { fetchGroupsPanelItems } from '../lib/groupsApi'
import {
  fetchMapPublicFilterSettings,
  fetchPublicAuthorsForMapFilter,
  mapPublicFilterChipName,
  mapPublicFilterSummary,
  setMapPublicAuthorMuted,
  setMapPublicAuthorsAll,
} from '../lib/mapPublicFilterApi'
import type {
  Group,
  GroupsPanelItem,
  MapNoteFilter,
  MapPublicFilterSettings,
  Profile,
} from '../lib/types'
import GroupCreator from './GroupCreator'

type ListTab = 'owner' | 'all'
type PanelView = 'main' | 'publicAuthors'

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
  const [panelView, setPanelView] = useState<PanelView>('main')
  const [mapPublicSettings, setMapPublicSettings] =
    useState<MapPublicFilterSettings | null>(null)
  const [publicAuthors, setPublicAuthors] = useState<Profile[]>([])
  const [publicLoading, setPublicLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [listTab, setListTab] = useState<ListTab>(
    mapFilter?.type === 'author' || mapFilter?.type === 'private'
      ? 'owner'
      : 'all',
  )

  useEffect(() => {
    if (!session?.user) return
    setLoading(true)
    Promise.all([
      fetchGroupsPanelItems(session.user.id),
      fetchMapPublicFilterSettings(session.user.id),
    ])
      .then(([{ groups: g, items }, prefs]) => {
        setGroups(g)
        setDirectShares(items.filter((i) => i.kind === 'direct'))
        setMapPublicSettings(prefs)
      })
      .catch((err) => {
        console.error('Failed to load groups:', err)
        setGroups([])
        setDirectShares([])
      })
      .finally(() => setLoading(false))
  }, [session?.user?.id])

  useEffect(() => {
    if (panelView !== 'publicAuthors' || !session?.user) return
    setPublicLoading(true)
    Promise.all([
      fetchMapPublicFilterSettings(session.user.id),
      fetchPublicAuthorsForMapFilter(),
    ])
      .then(([prefs, authors]) => {
        setMapPublicSettings(prefs)
        setPublicAuthors(authors)
      })
      .catch((err) => console.error('Failed to load public filter authors:', err))
      .finally(() => setPublicLoading(false))
  }, [panelView, session?.user?.id])

  const visibleGroups = useMemo(() => {
    if (!session?.user) return []
    if (listTab === 'owner') {
      return groups.filter((g) => g.owner_id === session.user.id)
    }
    return groups
  }, [groups, listTab, session?.user?.id])

  const selectedGroupId = mapFilter?.type === 'group' ? mapFilter.groupId : null
  const selectedPeerId = mapFilter?.type === 'direct' ? mapFilter.peerId : null
  const privateSelected = mapFilter?.type === 'private'
  const publicSelected = mapFilter?.type === 'public'

  function applyPublicFilter(settings: MapPublicFilterSettings) {
    if (!session?.user) return
    onMapFilterChange({
      type: 'public',
      viewerId: session.user.id,
      name: mapPublicFilterChipName(settings),
    })
  }

  function clearToTabDefault() {
    setPanelView('main')
    if (listTab === 'owner' && session?.user) {
      onMapFilterChange({ type: 'author', userId: session.user.id })
    } else {
      onMapFilterChange(null)
    }
  }

  function handleTab(tab: ListTab) {
    setListTab(tab)
    setExpandedId(null)
    setPanelView('main')
    setCreating(false)
    if (tab === 'owner' && session?.user) {
      onMapFilterChange({ type: 'author', userId: session.user.id })
    } else {
      onMapFilterChange(null)
    }
  }

  function handlePrivateClick() {
    if (!session?.user) return
    setExpandedId(null)
    setPanelView('main')
    if (privateSelected) {
      clearToTabDefault()
      return
    }
    onMapFilterChange({ type: 'private', userId: session.user.id })
  }

  function handlePublicClick() {
    if (!session?.user || !mapPublicSettings) return
    setExpandedId(null)
    setCreating(false)
    setPanelView('publicAuthors')
    applyPublicFilter(mapPublicSettings)
  }

  function handleGroupClick(group: Group) {
    setPanelView('main')
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
    setPanelView('main')
    if (selectedPeerId === item.peerId) {
      clearToTabDefault()
      return
    }
    onMapFilterChange({
      type: 'direct',
      peerId: item.peerId,
      viewerId: session.user.id,
      name: item.username,
    })
  }

  async function toggleMapPublicAll() {
    if (!session?.user || !mapPublicSettings) return
    const enable = !mapPublicSettings.mapShowPublic
    setBusyKey('public-all')
    try {
      await setMapPublicAuthorsAll(session.user.id, enable)
      const next: MapPublicFilterSettings = {
        mapShowPublic: enable,
        mutedMapPublicAuthorIds: [],
      }
      setMapPublicSettings(next)
      applyPublicFilter(next)
    } catch (err) {
      console.error(err)
    } finally {
      setBusyKey(null)
    }
  }

  async function toggleMapPublicAuthor(authorId: string) {
    if (!session?.user || !mapPublicSettings) return
    const currentlyMuted =
      !mapPublicSettings.mapShowPublic ||
      mapPublicSettings.mutedMapPublicAuthorIds.includes(authorId)
    setBusyKey(`map_public_author:${authorId}`)
    try {
      const next = await setMapPublicAuthorMuted(
        session.user.id,
        authorId,
        !currentlyMuted,
        publicAuthors.map((p) => p.id),
        mapPublicSettings,
      )
      setMapPublicSettings(next)
      applyPublicFilter(next)
    } catch (err) {
      console.error(err)
    } finally {
      setBusyKey(null)
    }
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
      : "You're not in any groups yet, and you have no direct shares with other users. Create a group or share a note by username."

  const publicSummary = mapPublicSettings
    ? mapPublicFilterSummary(mapPublicSettings)
    : '…'

  return (
    <aside className="panel">
      <div className="panel-header">
        {panelView === 'publicAuthors' ? (
          <>
            <h2>Public</h2>
            <div className="panel-header-actions">
              <button
                type="button"
                className="icon-btn"
                aria-label="Back to groups"
                onClick={() => setPanelView('main')}
              >
                ←
              </button>
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      <div className="panel-body">
        {loading ? (
          <p className="note-meta">Loading…</p>
        ) : panelView === 'publicAuthors' ? (
          publicLoading || !mapPublicSettings ? (
            <p className="note-meta">Loading…</p>
          ) : (
            <div className="notif-public-overlay">
              <div className="notif-public-toolbar">
                <button
                  type="button"
                  className="notif-bulk-btn"
                  disabled={busyKey === 'public-all'}
                  onClick={() => void toggleMapPublicAll()}
                >
                  {mapPublicSettings.mapShowPublic ? 'Uncheck all' : 'Check all'}
                </button>
              </div>
              {publicAuthors.length === 0 ? (
                <p className="note-meta">No public notes to filter yet.</p>
              ) : (
                <ul className="notif-settings-list">
                  {publicAuthors.map((author) => {
                    const checked =
                      mapPublicSettings.mapShowPublic &&
                      !mapPublicSettings.mutedMapPublicAuthorIds.includes(author.id)
                    return (
                      <li key={author.id}>
                        <label className="notif-check-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busyKey === `map_public_author:${author.id}`}
                            onChange={() => void toggleMapPublicAuthor(author.id)}
                          />
                          <span className="my-group-name">{author.username}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        ) : (
          <>
            {listEmpty && <p className="note-meta">{emptyCopy}</p>}
            <ul className="my-groups-list">
              <li>
                <button
                  type="button"
                  className={[
                    'my-group-row',
                    'direct-share-row',
                    privateSelected ? 'filter-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handlePrivateClick}
                >
                  <span className="my-group-name">Private</span>
                  <span className="my-group-count">my notes</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={[
                    'my-group-row',
                    'direct-share-row',
                    publicSelected ? 'filter-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handlePublicClick}
                >
                  <span className="my-group-name">Public</span>
                  <span className="my-group-count">{publicSummary}</span>
                </button>
              </li>
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
                  <li key={`direct-${item.peerId}`}>
                    <button
                      type="button"
                      className={[
                        'my-group-row',
                        'direct-share-row',
                        selectedPeerId === item.peerId ? 'filter-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => handleDirectClick(item)}
                    >
                      <span className="my-group-name">{item.username}</span>
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
