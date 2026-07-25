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

export interface NoteReply {
  id: string
  note_id: string
  author_id: string
  body: string
  created_at: string
  author?: Profile
}

export interface NoteReaction {
  note_id: string
  user_id: string
  emoji: string
  created_at: string
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
  | { type: 'private'; userId: string }
  | { type: 'public'; viewerId: string; name: string }
  | { type: 'group'; groupId: string; name: string }
  | { type: 'direct'; peerId: string; viewerId: string; name: string }
  | { type: 'notifications'; noteIds: string[]; name: string }

export type NotificationMuteKind =
  | 'group'
  | 'peer'
  | 'public_author'
  | 'map_public_author'

export interface MapPublicFilterSettings {
  mapShowPublic: boolean
  mutedMapPublicAuthorIds: string[]
}

export interface NotificationSettings {
  seenAt: string | null
  profileCreatedAt: string
  notifyPublic: boolean
  mutedGroupIds: string[]
  mutedPeerIds: string[]
  mutedPublicAuthorIds: string[]
}

/** Row in the Groups panel All list (real group or virtual direct-share peer). */
export type GroupsPanelItem =
  | { kind: 'group'; group: Group }
  | { kind: 'direct'; peerId: string; username: string; noteCount: number }

export interface GeocodeResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox: [string, string, string, string]
}
