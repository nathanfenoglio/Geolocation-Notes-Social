export type Visibility = 'private' | 'shared' | 'public'
export type MediaType = 'image' | 'video' | 'audio'

export interface Profile {
  id: string
  username: string
}

export interface NoteMedia {
  id: string
  note_id: string
  storage_path: string
  media_type: MediaType
  size_bytes: number
}

export interface Note {
  id: string
  author_id: string
  lat: number
  lng: number
  title: string
  body: string
  visibility: Visibility
  /** Date the note pertains to (YYYY-MM-DD), user selectable */
  note_date: string
  /** When the note was actually left */
  created_at: string
  updated_at: string
  author?: Profile
  note_media?: NoteMedia[]
}

export interface Group {
  id: string
  owner_id: string
  name: string
  member_count: number
}

export interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

/** Client-side map note filter driven from the Groups panel. */
export type MapNoteFilter =
  | null
  | { type: 'author'; userId: string }
  | { type: 'group'; groupId: string; name: string }
  | { type: 'direct'; sharerId: string; viewerId: string; name: string }

/** Row in the Groups panel All list (real group or virtual direct-share source). */
export type GroupsPanelItem =
  | { kind: 'group'; group: Group }
  | { kind: 'direct'; sharerId: string; username: string; noteCount: number }

export interface GeocodeResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox: [string, string, string, string]
}
