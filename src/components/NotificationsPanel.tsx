import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { fetchGroupsPanelItems } from '../lib/groupsApi'
import {
  fetchNotificationSettings,
  fetchProfilesForPublicSettings,
  publicNotesSummary,
  setMute,
  setPublicAuthorMuted,
  setPublicAuthorsAll,
} from '../lib/notificationsApi'
import type { Group, Note, NotificationSettings, Profile } from '../lib/types'

interface NotificationsPanelProps {
  notes: Note[]
  onClose: () => void
  onSelect: (note: Note) => void
  onSettingsChanged: () => void
}

type SettingsView = 'main' | 'publicAuthors'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function NotificationsPanel({
  notes,
  onClose,
  onSelect,
  onSettingsChanged,
}: NotificationsPanelProps) {
  const { session } = useAuth()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsView, setSettingsView] = useState<SettingsView>('main')
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [peers, setPeers] = useState<{ id: string; username: string }[]>([])
  const [publicAuthors, setPublicAuthors] = useState<Profile[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    if (!showSettings || !session?.user) return
    setSettingsLoading(true)
    Promise.all([
      fetchNotificationSettings(session.user.id),
      fetchGroupsPanelItems(session.user.id),
      fetchProfilesForPublicSettings(session.user.id),
    ])
      .then(([s, panel, profiles]) => {
        setSettings(s)
        setGroups(panel.groups)
        setPeers(
          panel.items
            .filter((i) => i.kind === 'direct')
            .map((i) => ({ id: i.peerId, username: i.username })),
        )
        setPublicAuthors(profiles)
      })
      .catch((err) => console.error('Failed to load notification settings:', err))
      .finally(() => setSettingsLoading(false))
  }, [showSettings, session?.user?.id])

  function leaveSettings() {
    setShowSettings(false)
    setSettingsView('main')
  }

  async function toggleMute(
    kind: 'group' | 'peer',
    targetId: string,
    currentlyMuted: boolean,
  ) {
    if (!session?.user || !settings) return
    setBusyKey(`${kind}:${targetId}`)
    try {
      await setMute(session.user.id, kind, targetId, !currentlyMuted)
      if (kind === 'group') {
        const mutedGroupIds = currentlyMuted
          ? settings.mutedGroupIds.filter((id) => id !== targetId)
          : [...settings.mutedGroupIds, targetId]
        setSettings({ ...settings, mutedGroupIds })
      } else {
        const mutedPeerIds = currentlyMuted
          ? settings.mutedPeerIds.filter((id) => id !== targetId)
          : [...settings.mutedPeerIds, targetId]
        setSettings({ ...settings, mutedPeerIds })
      }
      onSettingsChanged()
    } catch (err) {
      console.error(err)
    } finally {
      setBusyKey(null)
    }
  }

  async function togglePublicAuthorsAll() {
    if (!session?.user || !settings) return
    const enable = !settings.notifyPublic
    setBusyKey('public-all')
    try {
      await setPublicAuthorsAll(session.user.id, enable)
      setSettings({
        ...settings,
        notifyPublic: enable,
        mutedPublicAuthorIds: [],
      })
      onSettingsChanged()
    } catch (err) {
      console.error(err)
    } finally {
      setBusyKey(null)
    }
  }

  async function togglePublicAuthor(authorId: string) {
    if (!session?.user || !settings) return
    const currentlyMuted =
      !settings.notifyPublic || settings.mutedPublicAuthorIds.includes(authorId)
    setBusyKey(`public_author:${authorId}`)
    try {
      const next = await setPublicAuthorMuted(
        session.user.id,
        authorId,
        !currentlyMuted,
        publicAuthors.map((p) => p.id),
        settings,
      )
      setSettings(next)
      onSettingsChanged()
    } catch (err) {
      console.error(err)
    } finally {
      setBusyKey(null)
    }
  }

  const headerTitle =
    showSettings && settingsView === 'publicAuthors'
      ? 'Public notes'
      : showSettings
        ? 'Notification settings'
        : 'Notifications'

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>{headerTitle}</h2>
        <div className="panel-header-actions">
          {showSettings && settingsView === 'publicAuthors' ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Back to notification settings"
              onClick={() => setSettingsView('main')}
            >
              ←
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn"
              aria-label={showSettings ? 'Back to notifications' : 'Notification settings'}
              onClick={() => {
                if (showSettings) leaveSettings()
                else setShowSettings(true)
              }}
            >
              {showSettings ? '←' : '⚙'}
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      <div className="panel-body">
        {showSettings ? (
          settingsLoading || !settings ? (
            <p className="note-meta">Loading…</p>
          ) : settingsView === 'publicAuthors' ? (
            <div className="notif-public-overlay">
              <div className="notif-public-toolbar">
                <button
                  type="button"
                  className="notif-bulk-btn"
                  disabled={busyKey === 'public-all'}
                  onClick={() => void togglePublicAuthorsAll()}
                >
                  {settings.notifyPublic ? 'Uncheck all' : 'Check all'}
                </button>
              </div>
              {publicAuthors.length === 0 ? (
                <p className="note-meta">No other users yet.</p>
              ) : (
                <ul className="notif-settings-list">
                  {publicAuthors.map((author) => {
                    const checked =
                      settings.notifyPublic &&
                      !settings.mutedPublicAuthorIds.includes(author.id)
                    return (
                      <li key={author.id}>
                        <label className="notif-check-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busyKey === `public_author:${author.id}`}
                            onChange={() => void togglePublicAuthor(author.id)}
                          />
                          <span className="my-group-name">{author.username}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : (
            <ul className="notif-settings-list">
              <li>
                <button
                  type="button"
                  className="notif-nav-row"
                  onClick={() => setSettingsView('publicAuthors')}
                >
                  <span className="my-group-name">Public notes</span>
                  <span className="my-group-count">
                    {publicNotesSummary(settings)}
                  </span>
                </button>
              </li>
              {groups.map((g) => {
                const muted = settings.mutedGroupIds.includes(g.id)
                return (
                  <li key={`g-${g.id}`}>
                    <label className="notif-check-row">
                      <input
                        type="checkbox"
                        checked={!muted}
                        disabled={busyKey === `group:${g.id}`}
                        onChange={() => void toggleMute('group', g.id, muted)}
                      />
                      <span className="my-group-name">{g.name}</span>
                      <span className="my-group-count">group</span>
                    </label>
                  </li>
                )
              })}
              {peers.map((p) => {
                const muted = settings.mutedPeerIds.includes(p.id)
                return (
                  <li key={`p-${p.id}`}>
                    <label className="notif-check-row">
                      <input
                        type="checkbox"
                        checked={!muted}
                        disabled={busyKey === `peer:${p.id}`}
                        onChange={() => void toggleMute('peer', p.id, muted)}
                      />
                      <span className="my-group-name">{p.username}</span>
                      <span className="my-group-count">direct</span>
                    </label>
                  </li>
                )
              })}
              {groups.length === 0 && peers.length === 0 && (
                <li>
                  <p className="note-meta">
                    No groups or direct-share peers yet. Public notes can still be
                    configured above.
                  </p>
                </li>
              )}
            </ul>
          )
        ) : notes.length === 0 ? (
          <p className="note-meta">
            No new notes, replies, or reactions since your last visit.
          </p>
        ) : (
          <ul className="notif-notes-list">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="notif-note-row"
                  onClick={() => onSelect(n)}
                >
                  <span className="notif-note-title">
                    {n.title.trim() || '(untitled)'}
                  </span>
                  <span className="note-meta">
                    {n.author?.username ?? 'someone'} · {formatWhen(n.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
