import { supabase } from './supabase'
import type { NoteReaction, NoteReply } from './types'

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥'] as const

const REPLY_SELECT =
  'id, note_id, author_id, body, created_at, author:profiles!note_replies_author_id_fkey(id, username)'

function normalizeReply(row: Record<string, unknown>): NoteReply {
  const author = row.author
  return {
    ...(row as unknown as NoteReply),
    author: Array.isArray(author) ? author[0] : (author as NoteReply['author']),
  }
}

export async function fetchReplies(noteId: string): Promise<NoteReply[]> {
  const { data, error } = await supabase
    .from('note_replies')
    .select(REPLY_SELECT)
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeReply)
}

export async function addReply(
  noteId: string,
  userId: string,
  body: string,
): Promise<NoteReply> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Reply cannot be empty')
  if (trimmed.length > 2000) throw new Error('Reply is too long')

  const { data, error } = await supabase
    .from('note_replies')
    .insert({ note_id: noteId, author_id: userId, body: trimmed })
    .select(REPLY_SELECT)
    .single()
  if (error) throw error
  return normalizeReply(data as Record<string, unknown>)
}

export async function deleteReply(replyId: string): Promise<void> {
  const { error } = await supabase.from('note_replies').delete().eq('id', replyId)
  if (error) throw error
}

export async function fetchReactions(noteId: string): Promise<NoteReaction[]> {
  const { data, error } = await supabase
    .from('note_reactions')
    .select('note_id, user_id, emoji, created_at')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as NoteReaction[]
}

/** Add reaction if missing; remove if already present. Returns whether it is now active. */
export async function toggleReaction(
  noteId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  const { data: existing, error: findError } = await supabase
    .from('note_reactions')
    .select('emoji')
    .eq('note_id', noteId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle()
  if (findError) throw findError

  if (existing) {
    const { error } = await supabase
      .from('note_reactions')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
    if (error) throw error
    return false
  }

  const { error } = await supabase.from('note_reactions').insert({
    note_id: noteId,
    user_id: userId,
    emoji,
  })
  if (error) throw error
  return true
}
