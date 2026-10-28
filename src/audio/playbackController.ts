import { Store } from '../util/store'
import { errorMessage, log } from '../util/log'
import { nextRepeatMode, type PlaybackStatus, type RepeatMode, type Track } from '../models/types'
import {
  advanceQueue,
  appendToQueue,
  clearQueue,
  clearUpcoming,
  currentEntry,
  emptyQueue,
  jumpToEntry,
  moveEntry,
  playNext as queuePlayNext,
  removeEntry,
  removeTrackFromQueue,
  replaceQueue,
  rewindQueue,
  setRepeatMode as queueSetRepeatMode,
  setShuffled,
  upcomingEntries,
  type QueueEntry,
  type QueueState,
} from '../models/queue'
import type { SleepTimerOption } from '../models/equalizer'
import type { LibraryStore } from '../library/libraryStore'
import type { ArtworkCache } from '../library/artwork'
import { AudioEngine } from './audioEngine'
import { MediaSessionBridge } from './mediaSession'
import { SleepTimer } from './sleepTimer'
import type { SettingsStore } from './settings'

export interface PlaybackState {
  readonly currentTrack: Track | null
  readonly status: PlaybackStatus
  readonly queue: QueueState
  readonly error: string | null
  readonly volume: number
}

export interface ProgressState {
  readonly currentTime: number
  readonly duration: number
}

/**
 * Playback position, kept in its own store on purpose.
 *
 * The position changes several times a second while a song plays. If it lived on
 * `PlaybackController`, every screen observing the player — including a song list filtering and
 * sorting thousands of tracks — would re-render on each tick. Only the few components that draw
 * a clock or a progress bar subscribe here.
 */
export class ProgressStore extends Store<ProgressState> {
  constructor() {
    super({ currentTime: 0, duration: 0 })
  }

  setTime(currentTime: number): void {
    this.update((state) => ({ ...state, currentTime }))
  }

  setDuration(duration: number): void {
    this.update((state) => ({ ...state, duration }))
  }

  reset(): void {
    this.update(() => ({ currentTime: 0, duration: 0 }))
  }
}

/**
 * The playback brain: owns the queue, drives the engine, keeps the Lock Screen in sync and
 * records listening history.
 *
 * It lives for the whole life of the page, outside React, so navigating between screens,
 * closing Now Playing or backgrounding the tab never touches playback.
 */
export class PlaybackController extends Store<PlaybackState> {
  readonly progress = new ProgressStore()
  readonly sleepTimer = new SleepTimer()

  private readonly engine: AudioEngine
  private readonly mediaSession = new MediaSessionBridge()

  private listenedSeconds = 0
  private lastSampledTime = 0
  private consecutiveFailures = 0
  private pendingStartPosition = 0
  private endOfTrackStop = false

  constructor(
    private readonly library: LibraryStore,
    private readonly settings: SettingsStore,
    private readonly artwork: ArtworkCache,
    engine: AudioEngine = new AudioEngine(),
  ) {
    super({
      currentTrack: null,
      status: 'idle',
      queue: emptyQueue(),
      error: null,
      volume: settings.state.volume,
    })

    this.engine = engine
    this.engine.volume = settings.state.volume
    this.engine.playbackRate = settings.state.playbackSpeed
    this.engine.setCallbacks({
      onEnded: () => {
        void this.handleEnded()
      },
      onTimeUpdate: (time) => {
        this.handleTimeUpdate(time)
      },
      onDurationChange: (duration) => {
        this.progress.setDuration(duration)
        this.pushPosition()
      },
      onPlayingChange: (isPlaying) => {
        this.handlePlayingChange(isPlaying)
      },
      onError: (message) => {
        this.update((state) => ({ ...state, error: message }))
      },
    })

    this.mediaSession.bind({
      play: () => {
        void this.resume()
      },
      pause: () => {
        this.pause()
      },
      next: () => {
        void this.next()
      },
      previous: () => {
        void this.previous()
      },
      seekTo: (seconds) => {
        this.seek(seconds)
      },
      seekBy: (offset) => {
        this.skip(offset)
      },
      stop: () => {
        void this.stop()
      },
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.engine.resumeContext()
    })
  }

  // -- derived --------------------------------------------------------------

  get isPlaying(): boolean {
    return this.state.status === 'playing'
  }

  get repeatMode(): RepeatMode {
    return this.state.queue.repeatMode
  }

  get isShuffled(): boolean {
    return this.state.queue.isShuffled
  }

  get hasActiveTrack(): boolean {
    return this.state.currentTrack !== null
  }

  upcoming(): { entry: QueueEntry; track: Track }[] {
    return upcomingEntries(this.state.queue).flatMap((entry) => {
      const track = this.library.track(entry.trackId)
      return track === undefined ? [] : [{ entry, track }]
    })
  }

  fullQueue(): { entry: QueueEntry; track: Track; isCurrent: boolean }[] {
    const currentId = currentEntry(this.state.queue)?.id
    return this.state.queue.entries.flatMap((entry) => {
      const track = this.library.track(entry.trackId)
      return track === undefined ? [] : [{ entry, track, isCurrent: entry.id === currentId }]
    })
  }

  // -- starting playback ----------------------------------------------------

  async play(tracks: readonly Track[], startAt = 0): Promise<void> {
    if (tracks.length === 0) return
    await this.finishCurrentListen()
    this.consecutiveFailures = 0
    this.update((state) => ({
      ...state,
      error: null,
      queue: replaceQueue(
        state.queue,
        tracks.map((track) => track.id),
        startAt,
      ),
    }))
    await this.loadCurrent(true, 0)
  }

  async shuffleAll(tracks: readonly Track[]): Promise<void> {
    if (tracks.length === 0) return
    if (!this.state.queue.isShuffled) {
      this.update((state) => ({ ...state, queue: setShuffled(state.queue, true) }))
    }
    await this.play(tracks, Math.floor(Math.random() * tracks.length))
  }

  async playEntry(entryId: string): Promise<void> {
    await this.finishCurrentListen()
    const { state, entry } = jumpToEntry(this.state.queue, entryId)
    if (entry === null) return
    this.update((current) => ({ ...current, queue: state }))
    await this.loadCurrent(true, 0)
  }

  // -- transport ------------------------------------------------------------

  async togglePlayPause(): Promise<void> {
    if (this.state.status === 'playing') this.pause()
    else await this.resume()
  }

  async resume(): Promise<void> {
    if (this.state.currentTrack === null) {
      if (currentEntry(this.state.queue) !== null) await this.loadCurrent(true, 0)
      return
    }
    if (!this.engine.isLoaded) {
      const start = this.pendingStartPosition
      this.pendingStartPosition = 0
      await this.loadCurrent(true, start)
      return
    }
    await this.engine.play()
  }

  pause(): void {
    this.engine.pause()
    void this.persistResumePosition()
    this.saveSession()
  }

  async stop(): Promise<void> {
    await this.finishCurrentListen()
    this.engine.unload()
    this.progress.reset()
    this.update((state) => ({
      ...state,
      currentTrack: null,
      status: 'idle',
      queue: clearQueue(state.queue),
    }))
    this.mediaSession.clear()
    this.settings.saveSession(null)
  }

  async next(): Promise<void> {
    await this.advance(false)
  }

  /**
   * Restarts the track when more than three seconds have played — what every other player
   * does — and otherwise moves to the previous track.
   */
  async previous(): Promise<void> {
    if (this.progress.state.currentTime > 3) {
      this.seek(0)
      return
    }
    await this.finishCurrentListen()
    const { state, entry } = rewindQueue(this.state.queue)
    if (entry === null) {
      this.seek(0)
      return
    }
    this.consecutiveFailures = 0
    this.update((current) => ({ ...current, queue: state }))
    await this.loadCurrent(this.state.status === 'playing', 0)
  }

  seek(seconds: number): void {
    if (this.state.currentTrack === null) return
    if (!this.engine.isLoaded) {
      this.pendingStartPosition = Math.max(0, seconds)
      this.progress.setTime(this.pendingStartPosition)
      return
    }
    this.engine.seek(seconds)
    this.lastSampledTime = seconds
    this.progress.setTime(seconds)
    this.pushPosition()
  }

  skip(offset: number): void {
    this.seek(this.progress.state.currentTime + offset)
  }

  // -- modes ----------------------------------------------------------------

  toggleShuffle(): void {
    this.update((state) => ({
      ...state,
      queue: setShuffled(state.queue, !state.queue.isShuffled),
    }))
    this.saveSession()
  }

  cycleRepeatMode(): void {
    this.setRepeatMode(nextRepeatMode(this.state.queue.repeatMode))
  }

  setRepeatMode(mode: RepeatMode): void {
    this.update((state) => ({ ...state, queue: queueSetRepeatMode(state.queue, mode) }))
    this.saveSession()
  }

  // -- queue editing --------------------------------------------------------

  async playNext(tracks: readonly Track[]): Promise<void> {
    if (tracks.length === 0) return
    if (this.state.queue.entries.length === 0) {
      await this.play(tracks)
      return
    }
    this.update((state) => ({
      ...state,
      queue: queuePlayNext(
        state.queue,
        tracks.map((track) => track.id),
      ),
    }))
    this.saveSession()
  }

  async addToQueue(tracks: readonly Track[]): Promise<void> {
    if (tracks.length === 0) return
    if (this.state.queue.entries.length === 0) {
      await this.play(tracks)
      return
    }
    this.update((state) => ({
      ...state,
      queue: appendToQueue(
        state.queue,
        tracks.map((track) => track.id),
      ),
    }))
    this.saveSession()
  }

  async removeFromQueue(entryId: string): Promise<void> {
    const { state, removedCurrent } = removeEntry(this.state.queue, entryId)
    this.update((current) => ({ ...current, queue: state }))
    if (state.entries.length === 0) {
      await this.stop()
    } else if (removedCurrent) {
      await this.loadCurrent(this.state.status === 'playing', 0)
    }
    this.saveSession()
  }

  moveInQueue(from: number, to: number): void {
    this.update((state) => ({ ...state, queue: moveEntry(state.queue, from, to) }))
    this.saveSession()
  }

  clearUpcoming(): void {
    this.update((state) => ({ ...state, queue: clearUpcoming(state.queue) }))
    this.saveSession()
  }

  /** Called when a track leaves the library so the queue cannot point at deleted audio. */
  async purge(trackIds: readonly string[]): Promise<void> {
    const affectsCurrent =
      this.state.currentTrack !== null && trackIds.includes(this.state.currentTrack.id)
    let queue = this.state.queue
    for (const id of trackIds) queue = removeTrackFromQueue(queue, id)
    this.update((state) => ({ ...state, queue }))

    if (affectsCurrent) {
      if (queue.entries.length === 0) await this.stop()
      else await this.loadCurrent(this.state.status === 'playing', 0)
    }
    this.saveSession()
  }

  // -- audio parameters -----------------------------------------------------

  setVolume(volume: number): void {
    const clamped = Math.min(Math.max(volume, 0), 1)
    this.engine.volume = clamped
    this.settings.patch({ volume: clamped })
    this.update((state) => ({ ...state, volume: clamped }))
  }

  setPlaybackSpeed(speed: number): void {
    const clamped = Math.min(Math.max(speed, 0.5), 2)
    this.engine.playbackRate = clamped
    this.settings.patch({ playbackSpeed: clamped })
    this.pushPosition()
  }

  applyEqualizer(gains?: readonly number[]): void {
    const { equalizerEnabled } = this.settings.state
    this.engine.setEqualizer(gains ?? this.settings.activePreset.gains, equalizerEnabled)
  }

  get equalizerGraphBuilt(): boolean {
    return this.engine.isEqualizerGraphBuilt
  }

  clearError(): void {
    this.update((state) => ({ ...state, error: null }))
  }

  // -- sleep timer ----------------------------------------------------------

  startSleepTimer(option: SleepTimerOption): void {
    this.sleepTimer.start(option, () => {
      this.pause()
    })
  }

  cancelSleepTimer(): void {
    this.sleepTimer.cancel()
  }

  // -- session restore ------------------------------------------------------

  /**
   * Rebuilds the last queue without loading any audio.
   *
   * The blob is only fetched when the listener presses play, so a cold start never grabs the
   * audio focus from whatever else they are listening to.
   */
  restoreLastSession(): void {
    const { session, resumeOnLaunch, rememberPosition } = this.settings.state
    if (!resumeOnLaunch || session === null) return

    const tracks = this.library.tracksByIds(session.trackIds)
    if (tracks.length === 0) {
      this.settings.saveSession(null)
      return
    }

    let queue = queueSetRepeatMode(emptyQueue(), session.repeatMode)
    if (session.isShuffled) queue = setShuffled(queue, true)
    const index = Math.min(Math.max(session.currentIndex, 0), tracks.length - 1)
    queue = replaceQueue(
      queue,
      tracks.map((track) => track.id),
      index,
    )

    const entry = currentEntry(queue)
    const track = entry === null ? undefined : this.library.track(entry.trackId)
    if (track === undefined) return

    this.pendingStartPosition = rememberPosition ? session.position : 0
    this.progress.setDuration(track.duration)
    this.progress.setTime(this.pendingStartPosition)
    this.update((state) => ({ ...state, queue, currentTrack: track, status: 'paused' }))
    void this.pushNowPlaying(track)
  }

  // -- internals ------------------------------------------------------------

  private async loadCurrent(autoplay: boolean, startAt: number): Promise<void> {
    const entry = currentEntry(this.state.queue)
    const track = entry === null ? undefined : this.library.track(entry.trackId)
    if (track === undefined) {
      await this.stop()
      return
    }

    this.update((state) => ({ ...state, status: 'loading' }))
    try {
      const blob = await this.library.audioBlob(track.id)
      if (blob === undefined) throw new Error('The stored audio for this song is missing.')

      await this.engine.load(blob, startAt, autoplay)
      this.listenedSeconds = 0
      this.lastSampledTime = startAt
      this.consecutiveFailures = 0
      this.pendingStartPosition = 0
      this.progress.setTime(startAt)
      this.progress.setDuration(this.engine.duration || track.duration)
      this.update((state) => ({
        ...state,
        currentTrack: track,
        status: autoplay ? 'playing' : 'paused',
      }))
      await this.pushNowPlaying(track)
      this.saveSession()
    } catch (error) {
      await this.handleLoadFailure(track, error, autoplay)
    }
  }

  /**
   * A broken track must not stop the whole queue: report it once, then move on — unless every
   * remaining track is failing too.
   */
  private async handleLoadFailure(track: Track, error: unknown, autoplay: boolean): Promise<void> {
    log.error('audio', `Load failed: ${errorMessage(error)}`)
    this.consecutiveFailures += 1
    this.update((state) => ({
      ...state,
      error: `“${track.title}” could not be played. ${errorMessage(error)}`,
    }))

    const limit = Math.min(this.state.queue.entries.length, 10)
    if (this.consecutiveFailures >= limit) {
      this.consecutiveFailures = 0
      this.engine.unload()
      this.update((state) => ({ ...state, currentTrack: null, status: 'idle' }))
      this.mediaSession.clear()
      return
    }

    const { state, entry } = advanceQueue(this.state.queue, false)
    if (entry === null) {
      this.engine.unload()
      this.update((current) => ({ ...current, currentTrack: null, status: 'idle' }))
      this.mediaSession.clear()
      return
    }
    this.update((current) => ({ ...current, queue: state }))
    await this.loadCurrent(autoplay, 0)
  }

  private async advance(automatic: boolean): Promise<void> {
    await this.finishCurrentListen()
    const { state, entry } = advanceQueue(this.state.queue, automatic)

    if (entry === null) {
      // End of queue with repeat off: stop on the last track, rewound and paused.
      this.engine.pause()
      this.engine.seek(0)
      this.progress.setTime(0)
      this.update((current) => ({ ...current, status: 'paused' }))
      return
    }

    this.update((current) => ({ ...current, queue: state }))

    if (automatic && state.repeatMode === 'one') {
      this.engine.seek(0)
      this.progress.setTime(0)
      this.listenedSeconds = 0
      this.lastSampledTime = 0
      await this.engine.play()
      return
    }
    await this.loadCurrent(true, 0)
  }

  private async handleEnded(): Promise<void> {
    this.progress.setTime(this.progress.state.duration)
    this.listenedSeconds = Math.max(this.listenedSeconds, this.progress.state.duration * 0.95)

    if (this.sleepTimer.isEndOfTrack) {
      this.endOfTrackStop = true
      this.sleepTimer.trackDidEnd()
      await this.finishCurrentListen()
      this.update((state) => ({ ...state, status: 'paused' }))
      this.endOfTrackStop = false
      return
    }
    await this.advance(true)
  }

  private handleTimeUpdate(time: number): void {
    // Only forward motion counts towards a play, and each sample is clamped, so scrubbing can
    // never inflate the play count.
    const delta = time - this.lastSampledTime
    if (delta > 0 && delta < 2) this.listenedSeconds += delta
    this.lastSampledTime = time
    this.progress.setTime(time)
  }

  private handlePlayingChange(isPlaying: boolean): void {
    if (this.endOfTrackStop) return
    this.update((state) => ({
      ...state,
      status: isPlaying ? 'playing' : state.status === 'loading' ? 'loading' : 'paused',
    }))
    this.mediaSession.setPlaybackState(isPlaying)
    this.pushPosition()
  }

  private async finishCurrentListen(): Promise<void> {
    const track = this.state.currentTrack
    if (track === null) return
    const seconds = this.listenedSeconds
    this.listenedSeconds = 0
    await this.library.registerPlay(track.id, seconds)
    await this.persistResumePosition()
  }

  private async persistResumePosition(): Promise<void> {
    const track = this.state.currentTrack
    if (track === null || !this.settings.state.rememberPosition) return
    const { currentTime, duration } = this.progress.state
    // Near the end there is nothing worth resuming from.
    const position = duration > 0 && currentTime > duration - 5 ? 0 : currentTime
    await this.library.setResumePosition(track.id, position)
  }

  private async pushNowPlaying(track: Track): Promise<void> {
    const url = track.artworkKey === null ? null : await this.artwork.url(track.artworkKey)
    this.mediaSession.setTrack(track, url)
    this.mediaSession.setPlaybackState(this.state.status === 'playing')
    this.pushPosition()
  }

  private pushPosition(): void {
    const { currentTime, duration } = this.progress.state
    this.mediaSession.setPosition(duration, currentTime, this.settings.state.playbackSpeed)
  }

  private saveSession(): void {
    const { queue } = this.state
    if (queue.entries.length === 0 || queue.currentIndex === null) {
      this.settings.saveSession(null)
      return
    }
    this.settings.saveSession({
      trackIds: queue.entries.map((entry) => entry.trackId),
      currentIndex: queue.currentIndex,
      position: this.progress.state.currentTime,
      repeatMode: queue.repeatMode,
      isShuffled: queue.isShuffled,
    })
  }
}
