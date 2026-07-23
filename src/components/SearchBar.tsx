import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/geocode'
import type { GeocodeResult } from '../lib/types'

interface SearchBarProps {
  onSelect: (result: GeocodeResult) => void
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (query.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    timer.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchPlaces(query)
        setResults(res)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 500)
    return () => window.clearTimeout(timer.current)
  }, [query])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div className="search-bar" ref={wrapRef}>
      <input
        type="search"
        placeholder="Search places…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        aria-label="Search for a location"
      />
      {searching && <span className="search-spinner" aria-hidden="true" />}
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
