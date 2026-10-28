export type TabId = 'home' | 'library' | 'playlists' | 'favorites' | 'settings'

export const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'settings', label: 'Settings' },
]

export type SmartListId =
  'recentlyAdded' | 'recentlyPlayed' | 'mostPlayed' | 'favorites' | 'neverPlayed'

/** A screen pushed on top of a tab's root. Plain data, so the stack stays serialisable. */
export type Route =
  | { kind: 'allSongs' }
  | { kind: 'albums' }
  | { kind: 'album'; id: string }
  | { kind: 'artists' }
  | { kind: 'artist'; id: string }
  | { kind: 'genres' }
  | { kind: 'genre'; name: string }
  | { kind: 'folders'; path: string }
  | { kind: 'format'; name: string }
  | { kind: 'smart'; id: SmartListId }
  | { kind: 'playlist'; id: string }
  | { kind: 'equalizer' }
  | { kind: 'history' }
  | { kind: 'stats' }
