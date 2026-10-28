import { displayAlbum, displayArtist, type Track } from '../models/types'
import { log } from '../util/log'

export interface MediaSessionHandlers {
  play: () => void
  pause: () => void
  next: () => void
  previous: () => void
  seekTo: (seconds: number) => void
  seekBy: (offset: number) => void
  stop: () => void
}

/**
 * Lock Screen, Control Center and Bluetooth/headset controls.
 *
 * This is the web counterpart of `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`. Safari on
 * iOS 15+ supports it, which is what makes the Lock Screen show the right song and the
 * headphone buttons work while the app is in the background.
 */
export class MediaSessionBridge {
  private artworkUrl: string | null = null
  private readonly supported = 'mediaSession' in navigator

  constructor() {
    if (!this.supported)
      log.warn('audio', 'Media Session API unavailable; no lock-screen controls.')
  }

  bind(handlers: MediaSessionHandlers): void {
    if (!this.supported) return
    const session = navigator.mediaSession
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null): void => {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // Browsers reject actions they do not implement; that is not an error for us.
      }
    }

    set('play', () => {
      handlers.play()
    })
    set('pause', () => {
      handlers.pause()
    })
    set('stop', () => {
      handlers.stop()
    })
    set('nexttrack', () => {
      handlers.next()
    })
    set('previoustrack', () => {
      handlers.previous()
    })
    set('seekto', (details) => {
      if (typeof details.seekTime === 'number') handlers.seekTo(details.seekTime)
    })
    set('seekforward', (details) => {
      handlers.seekBy(details.seekOffset ?? 15)
    })
    set('seekbackward', (details) => {
      handlers.seekBy(-(details.seekOffset ?? 15))
    })
  }

  /** `artworkUrl` is an object URL owned by `ArtworkCache`; this class never revokes it. */
  setTrack(track: Track | null, artworkUrl: string | null): void {
    if (!this.supported) return
    if (track === null) {
      navigator.mediaSession.metadata = null
      this.artworkUrl = null
      return
    }
    this.artworkUrl = artworkUrl
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: displayArtist(track),
      album: displayAlbum(track),
      artwork:
        artworkUrl === null
          ? [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
          : [{ src: artworkUrl, sizes: '512x512' }],
    })
  }

  setPlaybackState(isPlaying: boolean): void {
    if (!this.supported) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }

  /** Feeds the Lock Screen scrubber. Bad values throw, so every field is validated first. */
  setPosition(duration: number, position: number, rate: number): void {
    if (!this.supported || navigator.mediaSession.setPositionState === undefined) return
    if (!Number.isFinite(duration) || duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(position, 0), duration),
        playbackRate: rate > 0 ? rate : 1,
      })
    } catch {
      // Safari throws if position briefly exceeds duration during a track change.
    }
  }

  clear(): void {
    if (!this.supported) return
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
    this.artworkUrl = null
  }

  get currentArtworkUrl(): string | null {
    return this.artworkUrl
  }
}
