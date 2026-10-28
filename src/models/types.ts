/** How a track's bytes are stored. The PWA has only one option, unlike the native app. */
export type TrackStorage = 'indexeddb'

export interface Track {
  readonly id: string
  title: string
  artist: string
  album: string
  albumArtist: string
  genre: string
  composer: string
  year: number
  trackNumber: number
  discNumber: number
  /** Seconds. */
  duration: number
  fileName: string
  /** Upper-case extension, e.g. `MP3`. */
  fileFormat: string
  /** Virtual folder path, derived from the relative path of the picked files. */
  folderPath: string
  /** Content hash used for duplicate detection. */
  fingerprint: string
  byteSize: number
  addedAt: number
  lastPlayedAt: number | null
  playCount: number
  isFavorite: boolean
  /** Key into the artwork store, or null when the file carried no cover. */
  artworkKey: string | null
  /** Seconds to resume from. */
  resumePosition: number
  /** Embedded or sidecar lyrics, plain or LRC. Empty when the file carried none. */
  lyrics: string
  storage: TrackStorage
}

export interface Playlist {
  readonly id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

export interface PlayEvent {
  readonly id: string
  trackId: string
  playedAt: number
  secondsPlayed: number
}

export type RepeatMode = 'off' | 'all' | 'one'

export const nextRepeatMode = (mode: RepeatMode): RepeatMode =>
  mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'loading'

export type TrackSortOption =
  | 'titleAsc'
  | 'titleDesc'
  | 'artist'
  | 'album'
  | 'recentlyAdded'
  | 'recentlyPlayed'
  | 'mostPlayed'
  | 'durationAsc'
  | 'durationDesc'

export const TRACK_SORT_OPTIONS: readonly TrackSortOption[] = [
  'titleAsc',
  'titleDesc',
  'artist',
  'album',
  'recentlyAdded',
  'recentlyPlayed',
  'mostPlayed',
  'durationAsc',
  'durationDesc',
]

export const trackSortLabels: Record<TrackSortOption, string> = {
  titleAsc: 'Title A–Z',
  titleDesc: 'Title Z–A',
  artist: 'Artist',
  album: 'Album',
  recentlyAdded: 'Recently Added',
  recentlyPlayed: 'Recently Played',
  mostPlayed: 'Most Played',
  durationAsc: 'Shortest First',
  durationDesc: 'Longest First',
}

export type ThemePreference = 'system' | 'light' | 'dark'

/** Artist used for grouping; falls back to the track artist when no album artist is tagged. */
export const groupingArtist = (track: Track): string =>
  track.albumArtist.trim() === '' ? track.artist : track.albumArtist

export const albumKey = (track: Track): string =>
  `${track.album.toLowerCase()}|${groupingArtist(track).toLowerCase()}`

export const displayArtist = (track: Track): string =>
  track.artist.trim() === '' ? 'Unknown Artist' : track.artist

export const displayAlbum = (track: Track): string =>
  track.album.trim() === '' ? 'Unknown Album' : track.album

/**
 * When a listen "counts".
 *
 * Half the track or 60 seconds, whichever comes first; anything under 30 seconds has to be
 * heard almost to the end. Pressing play and skipping immediately never counts.
 */
export const PLAY_COUNT_RULE = {
  absoluteThreshold: 60,
  fractionalThreshold: 0.5,
  shortTrackCeiling: 30,
} as const

export function qualifiesAsPlay(secondsPlayed: number, duration: number): boolean {
  if (duration <= 0 || secondsPlayed <= 0) return false
  if (duration <= PLAY_COUNT_RULE.shortTrackCeiling) return secondsPlayed >= duration * 0.9
  return (
    secondsPlayed >=
    Math.min(PLAY_COUNT_RULE.absoluteThreshold, duration * PLAY_COUNT_RULE.fractionalThreshold)
  )
}

export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
