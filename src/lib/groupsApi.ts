import { supabase } from './supabase'
import type { Group, GroupsPanelItem, Profile } from './types'

interface GroupRow {
  id: string
  owner_id: string
  name: string
  user_group_members: { count: number }[]
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    member_count: row.user_group_members[0]?.count ?? 0,
  }
}

/** Groups the current user owns or belongs to (RLS does the filtering). */
export async function fetchMyGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from('user_groups')
    .select('id, owner_id, name, user_group_members(count)')
    .order('name')
  if (error) throw error
  return ((data ?? []) as GroupRow[]).map(toGroup)
}

interface DirectShareRow {
  note_id: string
  note:
    | {
        author_id: string
        author: { id: string; username: string } | { id: string; username: string }[] | null
      }
    | {
        author_id: string
        author: { id: string; username: string } | { id: string; username: string }[] | null
      }[]
    | null
}

/** Real groups plus virtual "From {username}" sources (direct note_shares). */
export async function fetchGroupsPanelItems(
  viewerId: string,
): Promise<{ groups: Group[]; items: GroupsPanelItem[] }> {
  const groups = await fetchMyGroups()

  const { data, error } = await supabase
    .from('note_shares')
    .select(
      'note_id, note:notes!inner(author_id, author:profiles!notes_author_id_fkey(id, username))',
    )
    .eq('shared_with', viewerId)
  if (error) throw error

  const bySharer = new Map<string, { username: string; noteIds: Set<string> }>()
  for (const row of (data ?? []) as DirectShareRow[]) {
    const note = Array.isArray(row.note) ? row.note[0] : row.note
    if (!note) continue
    const author = Array.isArray(note.author) ? note.author[0] : note.author
    if (!author?.id) continue
    // Skip shares of your own notes (shouldn't appear as recipient, but be safe).
    if (author.id === viewerId) continue
    const existing = bySharer.get(author.id)
    if (existing) {
      existing.noteIds.add(row.note_id)
    } else {
      bySharer.set(author.id, {
        username: author.username,
        noteIds: new Set([row.note_id]),
      })
    }
  }

  const directShares = [...bySharer.entries()]
    .map(([sharerId, { username, noteIds }]) => ({
      kind: 'direct' as const,
      sharerId,
      username,
      noteCount: noteIds.size,
    }))
    .sort((a, b) => a.username.localeCompare(b.username))

  const items: GroupsPanelItem[] = [
    ...groups.map((group) => ({ kind: 'group' as const, group })),
    ...directShares,
  ]

  return { groups, items }
}

export async function createGroup(
  ownerId: string,
  name: string,
  memberIds: string[],
): Promise<Group> {
  const { data, error } = await supabase
    .from('user_groups')
    .insert({ owner_id: ownerId, name: name.trim() })
    .select('id, owner_id, name')
    .single()
  if (error) throw error
  if (memberIds.length > 0) {
    const rows = memberIds.map((member_id) => ({ group_id: data.id, member_id }))
    const { error: memErr } = await supabase.from('user_group_members').insert(rows)
    if (memErr) throw memErr
  }
  return { ...data, member_count: memberIds.length }
}

export async function fetchGroupMembers(groupId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('user_group_members')
    .select('member_id, profile:profiles(id, username)')
    .eq('group_id', groupId)
  if (error) throw error
  return (data ?? []).map((row) => {
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile
    return p as Profile
  })
}

export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_group_members')
    .upsert({ group_id: groupId, member_id: userId })
  if (error) throw error
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('member_id', userId)
  if (error) throw error
}

// ---- Note group shares ----

export interface NoteGroupShare {
  group_id: string
  name: string
  member_count: number
}

export async function fetchNoteGroupShares(noteId: string): Promise<NoteGroupShare[]> {
  const { data, error } = await supabase
    .from('note_group_shares')
    .select('group_id, group:user_groups(id, name, user_group_members(count))')
    .eq('note_id', noteId)
  if (error) throw error
  return (data ?? []).map((row) => {
    const g = (Array.isArray(row.group) ? row.group[0] : row.group) as {
      id: string
      name: string
      user_group_members: { count: number }[]
    }
    return {
      group_id: g.id,
      name: g.name,
      member_count: g.user_group_members[0]?.count ?? 0,
    }
  })
}

export async function addGroupShare(noteId: string, groupId: string): Promise<void> {
  const { error } = await supabase
    .from('note_group_shares')
    .upsert({ note_id: noteId, group_id: groupId })
  if (error) throw error
}

export async function removeGroupShare(noteId: string, groupId: string): Promise<void> {
  const { error } = await supabase
    .from('note_group_shares')
    .delete()
    .eq('note_id', noteId)
    .eq('group_id', groupId)
  if (error) throw error
}
