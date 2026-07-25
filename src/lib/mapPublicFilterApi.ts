import { supabase } from './supabase'
import type { MapPublicFilterSettings, Profile } from './types'

async function setMapPublicMute(
  userId: string,
  authorId: string,
  muted: boolean,
): Promise<void> {
  if (muted) {
    const { error } = await supabase.from('notification_mutes').upsert({
      user_id: userId,
      kind: 'map_public_author',
      target_id: authorId,
    })
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('notification_mutes')
    .delete()
    .eq('user_id', userId)
    .eq('kind', 'map_public_author')
    .eq('target_id', authorId)
  if (error) throw error
}

export async function fetchMapPublicFilterSettings(
  userId: string,
): Promise<MapPublicFilterSettings> {
  const [profileRes, mutesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('map_show_public')
      .eq('id', userId)
      .single(),
    supabase
      .from('notification_mutes')
      .select('target_id')
      .eq('user_id', userId)
      .eq('kind', 'map_public_author'),
  ])

  if (profileRes.error) throw profileRes.error
  if (mutesRes.error) throw mutesRes.error

  return {
    mapShowPublic: profileRes.data.map_show_public ?? true,
    mutedMapPublicAuthorIds: (mutesRes.data ?? []).map((r) => r.target_id),
  }
}

async function updateMapShowPublic(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ map_show_public: enabled })
    .eq('id', userId)
  if (error) throw error
}

async function clearMapPublicAuthorMutes(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_mutes')
    .delete()
    .eq('user_id', userId)
    .eq('kind', 'map_public_author')
  if (error) throw error
}

/** Authors with at least one viewable public note (includes self when applicable). */
export async function fetchPublicAuthorsForMapFilter(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(
      'author_id, author:profiles!notes_author_id_fkey(id, username)',
    )
    .eq('visibility', 'public')
    .limit(1000)
  if (error) throw error

  const byId = new Map<string, Profile>()
  for (const row of data ?? []) {
    const author = row.author
    const profile = (Array.isArray(author) ? author[0] : author) as
      | Profile
      | null
      | undefined
    if (!profile?.id) continue
    byId.set(profile.id, { id: profile.id, username: profile.username })
  }
  return [...byId.values()].sort((a, b) => a.username.localeCompare(b.username))
}

export async function setMapPublicAuthorsAll(
  userId: string,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    await updateMapShowPublic(userId, true)
    await clearMapPublicAuthorMutes(userId)
    return
  }
  await updateMapShowPublic(userId, false)
  await clearMapPublicAuthorMutes(userId)
}

export async function setMapPublicAuthorMuted(
  userId: string,
  authorId: string,
  muted: boolean,
  allAuthorIds: string[],
  settings: MapPublicFilterSettings,
): Promise<MapPublicFilterSettings> {
  if (!muted) {
    if (!settings.mapShowPublic) {
      await updateMapShowPublic(userId, true)
      const others = allAuthorIds.filter((id) => id !== authorId)
      if (others.length > 0) {
        const rows = others.map((target_id) => ({
          user_id: userId,
          kind: 'map_public_author' as const,
          target_id,
        }))
        const { error } = await supabase.from('notification_mutes').upsert(rows)
        if (error) throw error
      }
      return {
        mapShowPublic: true,
        mutedMapPublicAuthorIds: others,
      }
    }
    await setMapPublicMute(userId, authorId, false)
    return {
      ...settings,
      mutedMapPublicAuthorIds: settings.mutedMapPublicAuthorIds.filter(
        (id) => id !== authorId,
      ),
    }
  }

  await setMapPublicMute(userId, authorId, true)
  const mutedMapPublicAuthorIds = settings.mutedMapPublicAuthorIds.includes(authorId)
    ? settings.mutedMapPublicAuthorIds
    : [...settings.mutedMapPublicAuthorIds, authorId]

  const allMuted =
    allAuthorIds.length > 0 &&
    allAuthorIds.every((id) => mutedMapPublicAuthorIds.includes(id))
  if (allMuted) {
    await setMapPublicAuthorsAll(userId, false)
    return { mapShowPublic: false, mutedMapPublicAuthorIds: [] }
  }

  return { ...settings, mutedMapPublicAuthorIds }
}

export function mapPublicFilterSummary(
  settings: MapPublicFilterSettings,
): 'On' | 'Off' | 'Custom' {
  if (!settings.mapShowPublic) return 'Off'
  if (settings.mutedMapPublicAuthorIds.length > 0) return 'Custom'
  return 'On'
}

export function mapPublicFilterChipName(settings: MapPublicFilterSettings): string {
  return mapPublicFilterSummary(settings) === 'Custom' ? 'public (custom)' : 'public'
}
