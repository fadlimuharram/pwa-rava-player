import { log } from '../util/log'
import type { PlayEvent, Playlist, Track } from '../models/types'

/**
 * IndexedDB layout.
 *
 * Audio blobs live in their own store, keyed by track id, so the metadata store stays small
 * enough to read in one transaction at startup. Artwork is separate again and shared between
 * every track of an album.
 */
export const DB_NAME = 'rava-music'
export const DB_VERSION = 1

export const STORE = {
  tracks: 'tracks',
  audio: 'audio',
  artwork: 'artwork',
  playlists: 'playlists',
  events: 'events',
  meta: 'meta',
} as const

export class StorageQuotaError extends Error {
  constructor() {
    super('There is not enough free space on this device to store that file.')
    this.name = 'StorageQuotaError'
  }
}

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result)
    }
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'))
    }
  })

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve()
    }
    tx.onabort = () => {
      const error = tx.error
      reject(
        error?.name === 'QuotaExceededError'
          ? new StorageQuotaError()
          : (error ?? new Error('IndexedDB transaction aborted')),
      )
    }
    tx.onerror = () => {
      const error = tx.error
      reject(
        error?.name === 'QuotaExceededError'
          ? new StorageQuotaError()
          : (error ?? new Error('IndexedDB transaction failed')),
      )
    }
  })

export async function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  const open = indexedDB.open(name, DB_VERSION)
  open.onupgradeneeded = () => {
    const db = open.result
    if (!db.objectStoreNames.contains(STORE.tracks)) {
      const tracks = db.createObjectStore(STORE.tracks, { keyPath: 'id' })
      tracks.createIndex('fingerprint', 'fingerprint', { unique: false })
      tracks.createIndex('addedAt', 'addedAt', { unique: false })
    }
    if (!db.objectStoreNames.contains(STORE.audio)) db.createObjectStore(STORE.audio)
    if (!db.objectStoreNames.contains(STORE.artwork)) db.createObjectStore(STORE.artwork)
    if (!db.objectStoreNames.contains(STORE.playlists)) {
      db.createObjectStore(STORE.playlists, { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains(STORE.events)) {
      const events = db.createObjectStore(STORE.events, { keyPath: 'id' })
      events.createIndex('playedAt', 'playedAt', { unique: false })
      events.createIndex('trackId', 'trackId', { unique: false })
    }
    if (!db.objectStoreNames.contains(STORE.meta)) db.createObjectStore(STORE.meta)
  }
  const db = await request(open)
  db.onversionchange = () => {
    db.close()
  }
  return db
}

/** Thin typed wrapper so no screen ever writes a raw IndexedDB transaction. */
export class Database {
  constructor(private readonly db: IDBDatabase) {}

  static async open(name = DB_NAME): Promise<Database> {
    return new Database(await openDatabase(name))
  }

  close(): void {
    this.db.close()
  }

  // -- tracks ---------------------------------------------------------------

  async allTracks(): Promise<Track[]> {
    const tx = this.db.transaction(STORE.tracks, 'readonly')
    const rows = await request(tx.objectStore(STORE.tracks).getAll() as IDBRequest<Track[]>)
    await transactionDone(tx)
    return rows
  }

  async putTracks(tracks: readonly Track[]): Promise<void> {
    if (tracks.length === 0) return
    const tx = this.db.transaction(STORE.tracks, 'readwrite')
    const store = tx.objectStore(STORE.tracks)
    for (const track of tracks) store.put(track)
    await transactionDone(tx)
  }

  /** Writes the metadata row and its audio blob in one transaction, so neither can orphan. */
  async addTrackWithAudio(track: Track, audio: Blob): Promise<void> {
    const tx = this.db.transaction([STORE.tracks, STORE.audio], 'readwrite')
    tx.objectStore(STORE.tracks).put(track)
    tx.objectStore(STORE.audio).put(audio, track.id)
    await transactionDone(tx)
  }

  async deleteTracks(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    const tx = this.db.transaction(
      [STORE.tracks, STORE.audio, STORE.events, STORE.playlists],
      'readwrite',
    )
    const tracks = tx.objectStore(STORE.tracks)
    const audio = tx.objectStore(STORE.audio)
    for (const id of ids) {
      tracks.delete(id)
      audio.delete(id)
    }

    const idSet = new Set(ids)
    const events = tx.objectStore(STORE.events)
    const eventRows = await request(events.getAll() as IDBRequest<PlayEvent[]>)
    for (const event of eventRows) if (idSet.has(event.trackId)) events.delete(event.id)

    const playlists = tx.objectStore(STORE.playlists)
    const playlistRows = await request(playlists.getAll() as IDBRequest<Playlist[]>)
    for (const playlist of playlistRows) {
      const filtered = playlist.trackIds.filter((trackId) => !idSet.has(trackId))
      if (filtered.length !== playlist.trackIds.length) {
        playlists.put({ ...playlist, trackIds: filtered, updatedAt: Date.now() })
      }
    }
    await transactionDone(tx)
  }

  async audioBlob(trackId: string): Promise<Blob | undefined> {
    const tx = this.db.transaction(STORE.audio, 'readonly')
    const blob = await request(
      tx.objectStore(STORE.audio).get(trackId) as IDBRequest<Blob | undefined>,
    )
    await transactionDone(tx)
    return blob
  }

  // -- artwork --------------------------------------------------------------

  async putArtwork(key: string, blob: Blob): Promise<void> {
    const tx = this.db.transaction(STORE.artwork, 'readwrite')
    tx.objectStore(STORE.artwork).put(blob, key)
    await transactionDone(tx)
  }

  async artwork(key: string): Promise<Blob | undefined> {
    const tx = this.db.transaction(STORE.artwork, 'readonly')
    const blob = await request(
      tx.objectStore(STORE.artwork).get(key) as IDBRequest<Blob | undefined>,
    )
    await transactionDone(tx)
    return blob
  }

  async hasArtwork(key: string): Promise<boolean> {
    const tx = this.db.transaction(STORE.artwork, 'readonly')
    const count = await request(tx.objectStore(STORE.artwork).count(key))
    await transactionDone(tx)
    return count > 0
  }

  /** Deletes artwork no longer referenced by any track. */
  async pruneArtwork(keep: ReadonlySet<string>): Promise<void> {
    const tx = this.db.transaction(STORE.artwork, 'readwrite')
    const store = tx.objectStore(STORE.artwork)
    const keys = await request(store.getAllKeys())
    for (const key of keys) {
      if (typeof key === 'string' && !keep.has(key)) store.delete(key)
    }
    await transactionDone(tx)
  }

  // -- playlists ------------------------------------------------------------

  async allPlaylists(): Promise<Playlist[]> {
    const tx = this.db.transaction(STORE.playlists, 'readonly')
    const rows = await request(tx.objectStore(STORE.playlists).getAll() as IDBRequest<Playlist[]>)
    await transactionDone(tx)
    return rows
  }

  async putPlaylist(playlist: Playlist): Promise<void> {
    const tx = this.db.transaction(STORE.playlists, 'readwrite')
    tx.objectStore(STORE.playlists).put(playlist)
    await transactionDone(tx)
  }

  async deletePlaylist(id: string): Promise<void> {
    const tx = this.db.transaction(STORE.playlists, 'readwrite')
    tx.objectStore(STORE.playlists).delete(id)
    await transactionDone(tx)
  }

  // -- history --------------------------------------------------------------

  async allEvents(): Promise<PlayEvent[]> {
    const tx = this.db.transaction(STORE.events, 'readonly')
    const rows = await request(tx.objectStore(STORE.events).getAll() as IDBRequest<PlayEvent[]>)
    await transactionDone(tx)
    return rows
  }

  async addEvent(event: PlayEvent): Promise<void> {
    const tx = this.db.transaction(STORE.events, 'readwrite')
    tx.objectStore(STORE.events).put(event)
    await transactionDone(tx)
  }

  async clearEvents(): Promise<void> {
    const tx = this.db.transaction(STORE.events, 'readwrite')
    tx.objectStore(STORE.events).clear()
    await transactionDone(tx)
  }

  // -- key/value ------------------------------------------------------------

  async readMeta<T>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction(STORE.meta, 'readonly')
    const value = await request(tx.objectStore(STORE.meta).get(key) as IDBRequest<T | undefined>)
    await transactionDone(tx)
    return value
  }

  async writeMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(STORE.meta, 'readwrite')
    const store = tx.objectStore(STORE.meta)
    if (value === undefined) store.delete(key)
    else store.put(value, key)
    await transactionDone(tx)
  }

  async totalAudioBytes(): Promise<number> {
    const tx = this.db.transaction(STORE.audio, 'readonly')
    const blobs = await request(tx.objectStore(STORE.audio).getAll() as IDBRequest<Blob[]>)
    await transactionDone(tx)
    return blobs.reduce((total, blob) => total + blob.size, 0)
  }
}

export interface StorageEstimateSummary {
  usage: number
  quota: number
  persisted: boolean
}

/**
 * Asks the browser to keep this origin's data.
 *
 * Without it, Safari may evict IndexedDB after a period of disuse, which would silently take
 * the user's library with it. Installing the app to the Home Screen is what usually makes this
 * grant succeed on iOS; it is requested once at startup either way.
 */
export async function requestPersistentStorage(): Promise<StorageEstimateSummary> {
  let persisted = false
  try {
    if (navigator.storage?.persisted !== undefined) persisted = await navigator.storage.persisted()
    if (!persisted && navigator.storage?.persist !== undefined) {
      persisted = await navigator.storage.persist()
    }
  } catch {
    persisted = false
  }

  let usage = 0
  let quota = 0
  try {
    const estimate = await navigator.storage?.estimate()
    usage = estimate?.usage ?? 0
    quota = estimate?.quota ?? 0
  } catch {
    log.warn('storage', 'Storage estimate is unavailable in this browser.')
  }
  return { usage, quota, persisted }
}
