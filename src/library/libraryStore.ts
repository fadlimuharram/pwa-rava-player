import { Store } from '../util/store'
import { errorMessage, log } from '../util/log'
import { newId, qualifiesAsPlay, type PlayEvent, type Playlist, type Track } from '../models/types'
import { sortTracks } from '../models/library'
import type { Database } from './db'

export interface LibraryState {
  readonly tracks: readonly Track[]
  readonly playlists: readonly Playlist[]
  readonly isLoading: boolean
}

export interface HistoryEntry {
  readonly id: string
  readonly track: Track
  readonly playedAt: number
}

/**
 * The single source of truth for the music library.
 *
 * IndexedDB holds the durable copy; this store keeps a flat in-memory snapshot of it so that
 * list screens, search and the player can read tracks synchronously without an async hop on
 * every keystroke. Every mutation goes through here, writes to IndexedDB and then replaces the
 * snapshot, so the two cannot drift.
 */
export class LibraryStore extends Store<LibraryState> {
  private index = new Map<string, Track>()
  private fingerprints = new Set<string>()
  private events: PlayEvent[] = []

  constructor(private readonly db: Database) {
    super({ tracks: [], playlists: [], isLoading: true })
  }

  async load(): Promise<void> {
    try {
      const [tracks, playlists, events] = await Promise.all([
        this.db.allTracks(),
        this.db.allPlaylists(),
        this.db.allEvents(),
      ])
      this.events = events
      this.applyTracks(tracks)
      this.update((state) => ({
        ...state,
        playlists: [...playlists].sort((a, b) => b.createdAt - a.createdAt),
        isLoading: false,
      }))
      log.debug('library', `Loaded ${tracks.length} tracks, ${playlists.length} playlists.`)
    } catch (error) {
      log.error('library', `Load failed: ${errorMessage(error)}`)
      this.update((state) => ({ ...state, isLoading: false }))
    }
  }

  private applyTracks(tracks: readonly Track[]): void {
    this.index = new Map(tracks.map((track) => [track.id, track]))
    this.fingerprints = new Set(tracks.map((track) => track.fingerprint))
    this.update((state) => ({ ...state, tracks: [...tracks] }))
  }

  // -- reading --------------------------------------------------------------

  get tracks(): readonly Track[] {
    return this.state.tracks
  }

  get playlists(): readonly Playlist[] {
    return this.state.playlists
  }

  track(id: string): Track | undefined {
    return this.index.get(id)
  }

  /** Resolves ids to tracks, preserving the given order and dropping ids that no longer exist. */
  tracksByIds(ids: readonly string[]): Track[] {
    const result: Track[] = []
    for (const id of ids) {
      const track = this.index.get(id)
      if (track !== undefined) result.push(track)
    }
    return result
  }

  hasFingerprint(fingerprint: string): boolean {
    return this.fingerprints.has(fingerprint)
  }

  get favorites(): Track[] {
    return this.state.tracks.filter((track) => track.isFavorite)
  }

  get recentlyAdded(): Track[] {
    return sortTracks(this.state.tracks, 'recentlyAdded').slice(0, 100)
  }

  get recentlyPlayed(): Track[] {
    return sortTracks(
      this.state.tracks.filter((track) => track.lastPlayedAt !== null),
      'recentlyPlayed',
    ).slice(0, 100)
  }

  get mostPlayed(): Track[] {
    return sortTracks(
      this.state.tracks.filter((track) => track.playCount > 0),
      'mostPlayed',
    ).slice(0, 100)
  }

  get neverPlayed(): Track[] {
    return sortTracks(
      this.state.tracks.filter((track) => track.playCount === 0),
      'titleAsc',
    )
  }

  // -- writing --------------------------------------------------------------

  /** Adds an already-persisted track to the in-memory snapshot. */
  registerImported(track: Track): void {
    const tracks = [...this.state.tracks, track]
    this.index.set(track.id, track)
    this.fingerprints.add(track.fingerprint)
    this.update((state) => ({ ...state, tracks }))
  }

  async updateTrack(track: Track): Promise<void> {
    this.index.set(track.id, track)
    this.update((state) => ({
      ...state,
      tracks: state.tracks.map((candidate) => (candidate.id === track.id ? track : candidate)),
    }))
    await this.db.putTracks([track])
  }

  async toggleFavorite(trackId: string): Promise<void> {
    const track = this.index.get(trackId)
    if (track === undefined) return
    await this.updateTrack({ ...track, isFavorite: !track.isFavorite })
  }

  async setResumePosition(trackId: string, position: number): Promise<void> {
    const track = this.index.get(trackId)
    if (track === undefined) return
    await this.updateTrack({ ...track, resumePosition: position })
  }

  /** Records a finished listen: bumps the play count, stamps the time, appends a history row. */
  async registerPlay(trackId: string, secondsPlayed: number, at = Date.now()): Promise<void> {
    const track = this.index.get(trackId)
    if (track === undefined) return
    if (!qualifiesAsPlay(secondsPlayed, track.duration)) return

    await this.updateTrack({ ...track, playCount: track.playCount + 1, lastPlayedAt: at })
    const event: PlayEvent = { id: newId(), trackId, playedAt: at, secondsPlayed }
    this.events = [...this.events, event]
    await this.db.addEvent(event)
  }

  async deleteTracks(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    await this.db.deleteTracks(ids)

    this.events = this.events.filter((event) => !idSet.has(event.trackId))
    this.applyTracks(this.state.tracks.filter((track) => !idSet.has(track.id)))
    this.update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => {
        const trackIds = playlist.trackIds.filter((trackId) => !idSet.has(trackId))
        return trackIds.length === playlist.trackIds.length
          ? playlist
          : { ...playlist, trackIds, updatedAt: Date.now() }
      }),
    }))

    const keep = new Set(
      this.state.tracks
        .map((track) => track.artworkKey)
        .filter((key): key is string => key !== null),
    )
    await this.db.pruneArtwork(keep)
  }

  async deleteAllTracks(): Promise<void> {
    await this.deleteTracks(this.state.tracks.map((track) => track.id))
  }

  // -- playlists ------------------------------------------------------------

  async createPlaylist(name: string, trackIds: readonly string[] = []): Promise<Playlist> {
    const now = Date.now()
    const playlist: Playlist = {
      id: newId(),
      name,
      trackIds: [...trackIds],
      createdAt: now,
      updatedAt: now,
    }
    await this.db.putPlaylist(playlist)
    this.update((state) => ({ ...state, playlists: [playlist, ...state.playlists] }))
    return playlist
  }

  playlist(id: string): Playlist | undefined {
    return this.state.playlists.find((playlist) => playlist.id === id)
  }

  tracksInPlaylist(id: string): Track[] {
    const playlist = this.playlist(id)
    return playlist === undefined ? [] : this.tracksByIds(playlist.trackIds)
  }

  async renamePlaylist(id: string, name: string): Promise<void> {
    await this.mutatePlaylist(id, (playlist) => ({ ...playlist, name }))
  }

  /** Deletes the playlist only. The member tracks stay in the library. */
  async deletePlaylist(id: string): Promise<void> {
    await this.db.deletePlaylist(id)
    this.update((state) => ({
      ...state,
      playlists: state.playlists.filter((playlist) => playlist.id !== id),
    }))
  }

  async addToPlaylist(
    id: string,
    trackIds: readonly string[],
    allowDuplicates = false,
  ): Promise<void> {
    await this.mutatePlaylist(id, (playlist) => {
      const existing = new Set(playlist.trackIds)
      const additions = allowDuplicates
        ? [...trackIds]
        : trackIds.filter((trackId) => !existing.has(trackId))
      if (additions.length === 0) return playlist
      return { ...playlist, trackIds: [...playlist.trackIds, ...additions] }
    })
  }

  async removeFromPlaylist(id: string, index: number): Promise<void> {
    await this.mutatePlaylist(id, (playlist) => {
      if (index < 0 || index >= playlist.trackIds.length) return playlist
      const trackIds = [...playlist.trackIds]
      trackIds.splice(index, 1)
      return { ...playlist, trackIds }
    })
  }

  async movePlaylistTrack(id: string, from: number, to: number): Promise<void> {
    await this.mutatePlaylist(id, (playlist) => {
      if (from === to) return playlist
      const trackIds = [...playlist.trackIds]
      const [moved] = trackIds.splice(from, 1)
      if (moved === undefined) return playlist
      trackIds.splice(to, 0, moved)
      return { ...playlist, trackIds }
    })
  }

  private async mutatePlaylist(
    id: string,
    mutate: (playlist: Playlist) => Playlist,
  ): Promise<void> {
    const current = this.playlist(id)
    if (current === undefined) return
    const next = mutate(current)
    if (next === current) return
    const stamped = { ...next, updatedAt: Date.now() }
    await this.db.putPlaylist(stamped)
    this.update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => (playlist.id === id ? stamped : playlist)),
    }))
  }

  // -- history --------------------------------------------------------------

  history(limit = 200): HistoryEntry[] {
    return [...this.events]
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, limit)
      .flatMap((event) => {
        const track = this.index.get(event.trackId)
        return track === undefined ? [] : [{ id: event.id, track, playedAt: event.playedAt }]
      })
  }

  get totalListeningTime(): number {
    return this.events.reduce((total, event) => total + event.secondsPlayed, 0)
  }

  /** Clears history rows, play counts and last-played stamps. Favorites and playlists survive. */
  async clearHistory(): Promise<void> {
    await this.db.clearEvents()
    this.events = []
    const reset = this.state.tracks.map((track) => ({
      ...track,
      playCount: 0,
      lastPlayedAt: null,
    }))
    await this.db.putTracks(reset)
    this.applyTracks(reset)
  }

  audioBlob(trackId: string): Promise<Blob | undefined> {
    return this.db.audioBlob(trackId)
  }

  storedBytes(): Promise<number> {
    return this.db.totalAudioBytes()
  }
}
