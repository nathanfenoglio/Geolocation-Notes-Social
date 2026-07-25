import { supabase } from './supabase'
import type { MapBounds, MapNoteFilter, MediaType, Note, Visibility } from './types'

// SELECT and JOIN clauses
// author: names the alias of the result from the JOIN to the profiles table
// !notes_author_id_fkey specifies the foreign key in the profiles table
// (id, username) specifies only to grab these fields from the JOIN to the profiles table
// note_media is a JOIN on the note_media table, doesn't specify foreign key explicitly but foreign key note_media_note_id_fkey relates notes table to note_media table notes.id = note_id
// (id, note_id, storage_path, media_type, size_bytes) are the specific fields to be returned by the notes, note_media JOIN
const NOTE_SELECT =
  'id, author_id, lat, lng, title, body, visibility, note_date, created_at, updated_at, author:profiles!notes_author_id_fkey(id, username), note_media(id, note_id, storage_path, media_type, size_bytes)'

// check if db returned author: (id, username) as {(id, username)} and get rid of the outer array holder if it exists
function normalize(row: Record<string, unknown>): Note {
  const author = row.author
  return {
    ...(row as unknown as Note),
    author: Array.isArray(author) ? author[0] : (author as Note['author']),
  }
}

function applyBounds<T extends { gte: (c: string, v: number) => T; lte: (c: string, v: number) => T }>(
  query: T,
  bounds: MapBounds | undefined,
): T {
  if (!bounds) return query
  return query
    .gte('lat', bounds.south)
    .lte('lat', bounds.north)
    .gte('lng', bounds.west)
    .lte('lng', bounds.east)
}

async function queryNotes(
  filter: MapNoteFilter,
  bounds?: MapBounds,
): Promise<Note[]> {
  if (filter?.type === 'group') {
    const { data, error } = await applyBounds(
      supabase
        .from('notes')
        .select(
          `${NOTE_SELECT}, note_group_shares!inner(group_id)` as typeof NOTE_SELECT,
        )
        .eq('note_group_shares.group_id', filter.groupId)
        .order('created_at', { ascending: false })
        .limit(500),
      bounds,
    )
    if (error) throw error
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalize)
  }

  if (filter?.type === 'direct') {
    const { data, error } = await applyBounds(
      supabase
        .from('notes')
        .select(
          `${NOTE_SELECT}, note_shares!inner(shared_with)` as typeof NOTE_SELECT,
        )
        .eq('author_id', filter.sharerId)
        .eq('note_shares.shared_with', filter.viewerId)
        .order('created_at', { ascending: false })
        .limit(500),
      bounds,
    )
    if (error) throw error
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalize)
  }

  let query = applyBounds(
    supabase
      .from('notes')
      .select(NOTE_SELECT)
      .order('created_at', { ascending: false })
      .limit(500),
    bounds,
  )

  if (filter?.type === 'author') {
    query = query.eq('author_id', filter.userId)
  } else if (filter?.type === 'private') {
    query = query.eq('author_id', filter.userId).eq('visibility', 'private')
  }

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(normalize)
}

/** Fetch notes visible to the current user within map bounds (RLS filters visibility). */
export async function fetchNotesInBounds(
  bounds: MapBounds,
  filter: MapNoteFilter = null,
): Promise<Note[]> {
  return queryNotes(filter, bounds)
}

/** Fetch notes matching a filter with no viewport clip (for fit-to-markers). */
export async function fetchNotesForFilter(
  filter: MapNoteFilter = null,
): Promise<Note[]> {
  return queryNotes(filter)
}

export async function fetchMyNotes(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_SELECT)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalize)
}

export interface NoteInput {
  lat: number
  lng: number
  title: string
  body: string
  visibility: Visibility // 'private' | 'shared' | 'public'
  note_date: string
}

// INSERT note into notes table 
// then SELECT it to return the fields defined in NOTE_SELECT
// .select does not need a WHERE clause as PostgREST automatically returns the row(s) that were just inserted when chained after an .insert
export async function createNote(authorId: string, input: NoteInput): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .insert({ author_id: authorId, ...input })
    .select(NOTE_SELECT)
    .single()
  if (error) throw error
  return normalize(data)
}

// Partial type specifying that can update only the fields that are passed and leave the others as is if not included
export async function updateNote(noteId: string, input: Partial<NoteInput>): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update(input)
    .eq('id', noteId)
    .select(NOTE_SELECT)
    .single()
  if (error) throw error
  return normalize(data)
}

export async function deleteNote(note: Note): Promise<void> {
  const paths = (note.note_media ?? []).map((m) => m.storage_path)
  if (paths.length > 0) {
    await supabase.storage.from('note-media').remove(paths)
  }
  const { error } = await supabase.from('notes').delete().eq('id', note.id)
  if (error) throw error
}

// ---- Sharing ----

// get all id, usernames that a note is shared with
export async function fetchShares(noteId: string): Promise<{ id: string; username: string }[]> {
  const { data, error } = await supabase
    .from('note_shares')
    .select('shared_with, profile:profiles!note_shares_shared_with_fkey(id, username)')
    .eq('note_id', noteId)
  if (error) throw error
  return (data ?? []).map((row) => {
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile
    return { id: p.id as string, username: p.username as string }
  })
}

export async function lookupUsername(username: string): Promise<{ id: string; username: string } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', username.trim()) // ilike (ignore case)
    .maybeSingle() // returns 0 or 1 row, throws error for more than 1 row returned
  return data ?? null
}

export async function addShare(noteId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('note_shares')
    .upsert({ note_id: noteId, shared_with: userId }) // upsert (update or insert if no record exists)
  if (error) throw error
}

export async function removeShare(noteId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('note_shares')
    .delete()
    .eq('note_id', noteId)
    .eq('shared_with', userId)
  if (error) throw error
}

// ---- Media ----

export const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB (Supabase free-tier per-file cap)

export function mediaTypeOf(file: File): MediaType | null {
  // file.type automatically populated by browser when file is uploaded
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return null
}

export async function uploadNoteMedia(
  userId: string,
  noteId: string,
  file: File,
): Promise<void> {
  const type = mediaTypeOf(file)
  if (!type) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`)
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is larger than the 50 MB limit.`)
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') // replace any characters not in the regex with an underscore
  const path = `${userId}/${noteId}/${Date.now()}_${safeName}`

  // upload image, video, or audio to note-media storage bucket
  const { error: upErr } = await supabase.storage
    .from('note-media')
    .upload(path, file, { contentType: file.type })
  if (upErr) throw upErr

  const { error: dbErr } = await supabase.from('note_media').insert({
    note_id: noteId,
    storage_path: path,
    media_type: type,
    size_bytes: file.size,
  })
  if (dbErr) throw dbErr
}

export async function deleteNoteMedia(mediaId: string, storagePath: string): Promise<void> {
  await supabase.storage.from('note-media').remove([storagePath])
  const { error } = await supabase.from('note_media').delete().eq('id', mediaId)
  if (error) throw error
}

/** Get short-lived signed URLs for a note's media (private bucket). */
// supabase generates a url for frontend to access media from database that lasts a short amount of time before the url becomes invalid
export async function getSignedMediaUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage
    .from('note-media')
    .createSignedUrls(paths, 60 * 60)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl
  }
  return map
}
