import type { Database } from './db'
import { log } from '../util/log'

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * Object-URL cache for album art.
 *
 * Artwork is stored once per album and handed to the UI as an object URL. URLs are kept in an
 * LRU so a long scroll cannot leak thousands of them, and revoked when evicted.
 */
export class ArtworkCache {
  private readonly urls = new Map<string, string>()
  private readonly pending = new Map<string, Promise<string | null>>()

  constructor(
    private readonly db: Database,
    private readonly limit = 300,
  ) {}

  /** Stable key so every track on an album shares one stored image. */
  static async keyFor(album: string, artist: string, fallback: string): Promise<string> {
    const identity = `${album.toLowerCase()}|${artist.toLowerCase()}`
    if (identity === '|') return fallback
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    return toHex(digest)
  }

  async store(key: string, blob: Blob): Promise<void> {
    if (await this.db.hasArtwork(key)) return
    await this.db.putArtwork(key, blob)
  }

  /** Returns a cached object URL, loading it from IndexedDB on first use. */
  async url(key: string): Promise<string | null> {
    const existing = this.urls.get(key)
    if (existing !== undefined) {
      // Refresh recency: re-inserting moves the key to the end of the Map's order.
      this.urls.delete(key)
      this.urls.set(key, existing)
      return existing
    }

    const inFlight = this.pending.get(key)
    if (inFlight !== undefined) return inFlight

    const load = (async (): Promise<string | null> => {
      try {
        const blob = await this.db.artwork(key)
        if (blob === undefined) return null
        const url = URL.createObjectURL(blob)
        this.urls.set(key, url)
        this.evictIfNeeded()
        return url
      } catch (error) {
        log.warn('library', `Artwork load failed: ${String(error)}`)
        return null
      } finally {
        this.pending.delete(key)
      }
    })()

    this.pending.set(key, load)
    return load
  }

  private evictIfNeeded(): void {
    while (this.urls.size > this.limit) {
      const oldest = this.urls.keys().next()
      if (oldest.done === true) break
      const url = this.urls.get(oldest.value)
      this.urls.delete(oldest.value)
      if (url !== undefined) URL.revokeObjectURL(url)
    }
  }

  clear(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
  }
}
