import { useEffect, useState } from 'react'
import { getSignedMediaUrls } from '../lib/notesApi'
import type { NoteMedia } from '../lib/types'

interface MediaGalleryProps {
  media: NoteMedia[]
  onDelete?: (item: NoteMedia) => void
}

export default function MediaGallery({ media, onDelete }: MediaGalleryProps) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (media.length === 0) {
      setUrls({})
      return
    }
    let cancelled = false
    getSignedMediaUrls(media.map((m) => m.storage_path))
      .then((map) => {
        if (!cancelled) setUrls(map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [media])

  if (media.length === 0) return null

  return (
    <div className="media-gallery">
      {media.map((m) => {
        const url = urls[m.storage_path]
        return (
          <div className="media-item" key={m.id}>
            {!url ? (
              <div className="media-loading">Loading…</div>
            ) : m.media_type === 'image' ? (
              <a href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Note attachment" loading="lazy" />
              </a>
            ) : m.media_type === 'video' ? (
              <video src={url} controls preload="metadata" />
            ) : (
              <audio src={url} controls preload="metadata" />
            )}
            {onDelete && (
              <button
                type="button"
                className="media-delete"
                onClick={() => onDelete(m)}
                aria-label="Delete attachment"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
