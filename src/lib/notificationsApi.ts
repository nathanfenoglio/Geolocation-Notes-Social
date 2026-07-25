import { supabase } from './supabase'
import { NOTE_SELECT, normalizeNote } from './notesApi'
import type { Note, NotificationMuteKind, NotificationSettings, Profile } from './types'

const MAX_NOTIFICATION_NOTES = 100
const FIRST_OPEN_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

export async function fetchNotificationSettings(
  userId: string,
): Promise<NotificationSettings> {
  const [profileRes, mutesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('created_at, notifications_seen_at, notify_public')
      .eq('id', userId)
      .single(),
    supabase
      .from('notification_mutes')
      .select('kind, target_id')
      .eq('user_id', userId),
  ])

  if (profileRes.error) throw profileRes.error
  if (mutesRes.error) throw mutesRes.error

  const mutedGroupIds: string[] = []
  const mutedPeerIds: string[] = []
  const mutedPublicAuthorIds: string[] = []
  for (const row of mutesRes.data ?? []) {
    if (row.kind === 'group') mutedGroupIds.push(row.target_id)
    else if (row.kind === 'peer') mutedPeerIds.push(row.target_id)
    else if (row.kind === 'public_author') mutedPublicAuthorIds.push(row.target_id)
  }

  return {
    seenAt: profileRes.data.notifications_seen_at ?? null,
    profileCreatedAt: profileRes.data.created_at,
    notifyPublic: profileRes.data.notify_public ?? true,
    mutedGroupIds,
    mutedPeerIds,
    mutedPublicAuthorIds,
  }
}

export async function markNotificationsSeen(userId: string): Promise<string> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('profiles')
    .update({ notifications_seen_at: now })
    .eq('id', userId)
  if (error) throw error
  return now
}

export async function updateNotifyPublic(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ notify_public: enabled })
    .eq('id', userId)
  if (error) throw error
}

export async function setMute(
  userId: string,
  kind: NotificationMuteKind,
  targetId: string,
  muted: boolean,
): Promise<void> {
  if (muted) {
    const { error } = await supabase
      .from('notification_mutes')
      .upsert({ user_id: userId, kind, target_id: targetId })
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('notification_mutes')
    .delete()
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('target_id', targetId)
  if (error) throw error
}

export async function fetchProfilesForPublicSettings(
  viewerId: string,
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .neq('id', viewerId)
    .order('username')
  if (error) throw error
  return (data ?? []) as Profile[]
}

async function clearPublicAuthorMutes(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_mutes')
    .delete()
    .eq('user_id', userId)
    .eq('kind', 'public_author')
  if (error) throw error
}

/** Check all / Uncheck all for public-note authors. */
export async function setPublicAuthorsAll(
  userId: string,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    await updateNotifyPublic(userId, true)
    await clearPublicAuthorMutes(userId)
    return
  }
  await updateNotifyPublic(userId, false)
  await clearPublicAuthorMutes(userId)
}

/**
 * Toggle one public author. If enabling while master public is off, turns public
 * on and mutes every other listed author so only this one remains.
 */
export async function setPublicAuthorMuted(
  userId: string,
  authorId: string,
  muted: boolean,
  allAuthorIds: string[],
  settings: NotificationSettings,
): Promise<NotificationSettings> {
  if (!muted) {
    // Enabling this author
    if (!settings.notifyPublic) {
      await updateNotifyPublic(userId, true)
      const others = allAuthorIds.filter((id) => id !== authorId)
      if (others.length > 0) {
        const rows = others.map((target_id) => ({
          user_id: userId,
          kind: 'public_author' as const,
          target_id,
        }))
        const { error } = await supabase.from('notification_mutes').upsert(rows)
        if (error) throw error
      }
      return {
        ...settings,
        notifyPublic: true,
        mutedPublicAuthorIds: others,
      }
    }
    await setMute(userId, 'public_author', authorId, false)
    return {
      ...settings,
      mutedPublicAuthorIds: settings.mutedPublicAuthorIds.filter((id) => id !== authorId),
    }
  }

  // Muting this author
  await setMute(userId, 'public_author', authorId, true)
  const mutedPublicAuthorIds = settings.mutedPublicAuthorIds.includes(authorId)
    ? settings.mutedPublicAuthorIds
    : [...settings.mutedPublicAuthorIds, authorId]

  // If every known author is muted, treat as public off.
  const allMuted =
    allAuthorIds.length > 0 &&
    allAuthorIds.every((id) => mutedPublicAuthorIds.includes(id))
  if (allMuted) {
    await setPublicAuthorsAll(userId, false)
    return {
      ...settings,
      notifyPublic: false,
      mutedPublicAuthorIds: [],
    }
  }

  return { ...settings, mutedPublicAuthorIds }
}

/** Lower bound for "new since last visit" queries. */
export function notificationSince(settings: NotificationSettings): string {
  if (settings.seenAt) return settings.seenAt
  const lookback = new Date(Date.now() - FIRST_OPEN_LOOKBACK_MS).toISOString()
  return settings.profileCreatedAt > lookback ? settings.profileCreatedAt : lookback
}

function mergeNotes(rows: Record<string, unknown>[]): Note[] {
  const byId = new Map<string, Note>()
  for (const row of rows) {
    const note = normalizeNote(row)
    byId.set(note.id, note)
  }
  return [...byId.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

function extractJoinedNotes(
  rows: Array<{ notes?: Record<string, unknown> | Record<string, unknown>[] | null }>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const row of rows) {
    const n = row.notes
    if (!n) continue
    if (Array.isArray(n)) {
      if (n[0]) out.push(n[0])
    } else {
      out.push(n)
    }
  }
  return out
}

/**
 * Notes the user didn't author, created after seenAt, matching enabled channels
 * (direct share / unmuted group share / public if enabled), plus the user's own
 * notes that received replies/reactions from others after seenAt.
 */
export async function fetchNewNotificationNotes(
  userId: string,
  settings: NotificationSettings,
): Promise<Note[]> {
  const since = notificationSince(settings)
  const mutedGroups = new Set(settings.mutedGroupIds)
  const mutedPeers = new Set(settings.mutedPeerIds)
  const mutedPublicAuthors = new Set(settings.mutedPublicAuthorIds)
  const collected: Record<string, unknown>[] = []

  const tasks: Promise<void>[] = []

  if (settings.notifyPublic) {
    tasks.push(
      (async () => {
        const { data, error } = await supabase
          .from('notes')
          .select(NOTE_SELECT)
          .eq('visibility', 'public')
          .neq('author_id', userId)
          .gt('created_at', since)
          .order('created_at', { ascending: false })
          .limit(MAX_NOTIFICATION_NOTES)
        if (error) throw error
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          const authorId = row.author_id as string
          if (mutedPublicAuthors.has(authorId)) continue
          collected.push(row)
        }
      })(),
    )
  }

  tasks.push(
    (async () => {
      const { data, error } = await supabase
        .from('notes')
        .select(
          `${NOTE_SELECT}, note_shares!inner(shared_with)` as typeof NOTE_SELECT,
        )
        .eq('note_shares.shared_with', userId)
        .neq('author_id', userId)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATION_NOTES)
      if (error) throw error
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const authorId = row.author_id as string
        if (mutedPeers.has(authorId)) continue
        collected.push(row)
      }
    })(),
  )

  tasks.push(
    (async () => {
      const { data, error } = await supabase
        .from('notes')
        .select(
          `${NOTE_SELECT}, note_group_shares!inner(group_id)` as typeof NOTE_SELECT,
        )
        .neq('author_id', userId)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATION_NOTES)
      if (error) throw error
      for (const row of (data ?? []) as Array<
        Record<string, unknown> & {
          note_group_shares?: { group_id: string } | { group_id: string }[]
        }
      >) {
        const shares = row.note_group_shares
        const list = Array.isArray(shares) ? shares : shares ? [shares] : []
        const unmuted = list.some((s) => !mutedGroups.has(s.group_id))
        if (!unmuted) continue
        collected.push(row)
      }
    })(),
  )

  // Owner engagement: replies/reactions on the user's notes (mutes do not apply).
  const noteEmbed = `notes!inner(${NOTE_SELECT})`
  tasks.push(
    (async () => {
      const { data, error } = await supabase
        .from('note_replies')
        .select(noteEmbed)
        .neq('author_id', userId)
        .gt('created_at', since)
        .eq('notes.author_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATION_NOTES)
      if (error) throw error
      collected.push(
        ...extractJoinedNotes(
          (data ?? []) as Array<{
            notes?: Record<string, unknown> | Record<string, unknown>[] | null
          }>,
        ),
      )
    })(),
  )

  tasks.push(
    (async () => {
      const { data, error } = await supabase
        .from('note_reactions')
        .select(noteEmbed)
        .neq('user_id', userId)
        .gt('created_at', since)
        .eq('notes.author_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATION_NOTES)
      if (error) throw error
      collected.push(
        ...extractJoinedNotes(
          (data ?? []) as Array<{
            notes?: Record<string, unknown> | Record<string, unknown>[] | null
          }>,
        ),
      )
    })(),
  )

  await Promise.all(tasks)
  return mergeNotes(collected).slice(0, MAX_NOTIFICATION_NOTES)
}

export function publicNotesSummary(settings: NotificationSettings): 'On' | 'Off' | 'Custom' {
  if (!settings.notifyPublic) return 'Off'
  if (settings.mutedPublicAuthorIds.length > 0) return 'Custom'
  return 'On'
}
