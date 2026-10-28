import { EQ_BAND_FREQUENCIES, normalizeGains } from '../models/equalizer'
import { errorMessage, log } from '../util/log'

export interface AudioEngineCallbacks {
  onEnded: () => void
  onTimeUpdate: (currentTime: number) => void
  onDurationChange: (duration: number) => void
  onPlayingChange: (isPlaying: boolean) => void
  onError: (message: string) => void
}

/**
 * The playback engine: one long-lived `<audio>` element, plus an optional Web Audio graph for
 * the equalizer.
 *
 * Three things drive the design, all of them iOS constraints:
 *
 * 1. **One element for the whole session.** Safari only honours `play()` without a user gesture
 *    on an element that has already been started by one. Reusing a single element is what lets
 *    track 2 onwards start by themselves.
 * 2. **The element, not Web Audio, is the default path.** A plain media element keeps playing
 *    when the screen locks; an `AudioContext` is suspended by iOS when the app backgrounds. So
 *    the EQ graph is only built if the listener actually turns the equalizer on.
 * 3. **Blob URLs, not streams.** The audio lives in IndexedDB; each track is handed to the
 *    element as an object URL that is revoked when the next one loads.
 *
 * It knows nothing about libraries or queues: it plays one blob and reports when it ends.
 */
export class AudioEngine {
  readonly element: HTMLAudioElement
  private objectUrl: string | null = null
  private callbacks: AudioEngineCallbacks | null = null

  private context: AudioContext | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private filters: BiquadFilterNode[] = []
  private equalizerActive = false

  private desiredRate = 1
  private desiredVolume = 1

  constructor(element: HTMLAudioElement = new Audio()) {
    this.element = element
    this.element.preload = 'auto'
    this.element.crossOrigin = 'anonymous'
    // iOS ties its Now Playing / background-audio handling to a media element that is in the
    // document. A detached `new Audio()` plays, but is a weaker citizen there, so the element
    // is parked in the DOM — hidden, and never styled or re-parented by React.
    if (typeof document !== 'undefined' && element.parentNode === null) {
      element.setAttribute('aria-hidden', 'true')
      element.style.display = 'none'
      document.body.append(element)
    }
    this.attachListeners()
  }

  setCallbacks(callbacks: AudioEngineCallbacks): void {
    this.callbacks = callbacks
  }

  private attachListeners(): void {
    this.element.addEventListener('ended', () => {
      this.callbacks?.onEnded()
    })
    this.element.addEventListener('timeupdate', () => {
      this.callbacks?.onTimeUpdate(this.element.currentTime)
    })
    this.element.addEventListener('durationchange', () => {
      const duration = this.element.duration
      if (Number.isFinite(duration) && duration > 0) this.callbacks?.onDurationChange(duration)
    })
    this.element.addEventListener('play', () => {
      this.callbacks?.onPlayingChange(true)
    })
    this.element.addEventListener('pause', () => {
      this.callbacks?.onPlayingChange(false)
    })
    this.element.addEventListener('error', () => {
      const code = this.element.error?.code
      this.callbacks?.onError(
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? 'This browser cannot decode that file.'
          : 'Playback failed. The file may be damaged.',
      )
    })
  }

  // -- loading --------------------------------------------------------------

  get isLoaded(): boolean {
    return this.objectUrl !== null
  }

  get isPlaying(): boolean {
    return !this.element.paused && !this.element.ended
  }

  get currentTime(): number {
    return this.element.currentTime
  }

  get duration(): number {
    const duration = this.element.duration
    return Number.isFinite(duration) && duration > 0 ? duration : 0
  }

  /** Points the element at a new blob. `autoplay` must originate from a user gesture the first time. */
  async load(blob: Blob, startAt: number, autoplay: boolean): Promise<void> {
    this.releaseUrl()
    const url = URL.createObjectURL(blob)
    this.objectUrl = url
    this.element.src = url
    this.element.load()

    if (startAt > 0) {
      await this.waitForSeekable()
      try {
        this.element.currentTime = startAt
      } catch {
        // Some browsers refuse a seek until more of the blob is buffered; starting from zero
        // is better than failing the load.
      }
    }
    this.applyRate()
    this.element.volume = this.desiredVolume
    if (autoplay) await this.play()
  }

  private waitForSeekable(): Promise<void> {
    if (this.element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()
    return new Promise((resolve) => {
      const done = (): void => {
        this.element.removeEventListener('loadedmetadata', done)
        this.element.removeEventListener('error', done)
        resolve()
      }
      this.element.addEventListener('loadedmetadata', done)
      this.element.addEventListener('error', done)
    })
  }

  unload(): void {
    this.element.pause()
    this.element.removeAttribute('src')
    this.element.load()
    this.releaseUrl()
  }

  private releaseUrl(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  // -- transport ------------------------------------------------------------

  async play(): Promise<void> {
    try {
      await this.resumeContext()
      await this.element.play()
    } catch (error) {
      // A rejected play() is almost always "no user gesture yet", which is not an error the
      // listener needs to see as a failure — the UI simply stays paused.
      log.debug('audio', `play() rejected: ${errorMessage(error)}`)
      this.callbacks?.onPlayingChange(false)
    }
  }

  pause(): void {
    this.element.pause()
  }

  seek(seconds: number): void {
    if (!this.isLoaded) return
    const clamped = Math.min(Math.max(seconds, 0), this.duration || seconds)
    try {
      this.element.currentTime = clamped
    } catch (error) {
      log.debug('audio', `seek rejected: ${errorMessage(error)}`)
    }
  }

  // -- audio parameters -----------------------------------------------------

  get volume(): number {
    return this.desiredVolume
  }

  set volume(value: number) {
    this.desiredVolume = Math.min(Math.max(value, 0), 1)
    this.element.volume = this.desiredVolume
  }

  get playbackRate(): number {
    return this.desiredRate
  }

  set playbackRate(value: number) {
    this.desiredRate = Math.min(Math.max(value, 0.5), 2)
    this.applyRate()
  }

  private applyRate(): void {
    this.element.playbackRate = this.desiredRate
    // Standard name first, then the WebKit-prefixed one older Safari still uses.
    const element = this.element as HTMLAudioElement & {
      preservesPitch?: boolean
      webkitPreservesPitch?: boolean
    }
    if ('preservesPitch' in element) element.preservesPitch = true
    if ('webkitPreservesPitch' in element) element.webkitPreservesPitch = true
  }

  // -- equalizer ------------------------------------------------------------

  get isEqualizerGraphBuilt(): boolean {
    return this.context !== null
  }

  /**
   * Applies an EQ curve, building the Web Audio graph the first time it is actually needed.
   *
   * Building it is a one-way step for the session: `createMediaElementSource` permanently
   * reroutes the element through the AudioContext and there is no way to undo it. Disabling
   * the equalizer therefore flattens every band rather than detaching the graph, and the UI
   * warns that a reload is needed to get the plain element path (and its more reliable
   * background playback on iOS) back.
   */
  setEqualizer(gains: readonly number[], enabled: boolean): void {
    if (!enabled && this.context === null) {
      this.equalizerActive = false
      return
    }
    if (this.context === null) {
      if (!this.buildEqualizerGraph()) return
    }
    this.equalizerActive = enabled
    const values = normalizeGains(gains)
    this.filters.forEach((filter, index) => {
      filter.gain.value = enabled ? (values[index] ?? 0) : 0
    })
    void this.resumeContext()
  }

  private buildEqualizerGraph(): boolean {
    type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext
    if (Ctor === undefined) {
      log.warn('audio', 'Web Audio is unavailable; the equalizer cannot run here.')
      return false
    }
    try {
      const context = new Ctor()
      const source = context.createMediaElementSource(this.element)
      let node: AudioNode = source
      this.filters = EQ_BAND_FREQUENCIES.map((frequency, index) => {
        const filter = context.createBiquadFilter()
        // Shelves at the ends and peaking in between is the usual graphic-EQ shape; a peaking
        // filter at 32 Hz would leave the lowest octave untouched.
        filter.type =
          index === 0
            ? 'lowshelf'
            : index === EQ_BAND_FREQUENCIES.length - 1
              ? 'highshelf'
              : 'peaking'
        filter.frequency.value = frequency
        filter.Q.value = 1.1
        filter.gain.value = 0
        node.connect(filter)
        node = filter
        return filter
      })
      node.connect(context.destination)
      this.context = context
      this.sourceNode = source
      return true
    } catch (error) {
      log.error('audio', `Could not build the equalizer graph: ${errorMessage(error)}`)
      return false
    }
  }

  /** iOS suspends the AudioContext whenever the app backgrounds; this is called on every resume. */
  async resumeContext(): Promise<void> {
    if (this.context === null) return
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume()
      } catch (error) {
        log.debug('audio', `AudioContext resume failed: ${errorMessage(error)}`)
      }
    }
  }

  get equalizerEngaged(): boolean {
    return this.equalizerActive
  }

  dispose(): void {
    this.unload()
    this.sourceNode?.disconnect()
    for (const filter of this.filters) filter.disconnect()
    void this.context?.close()
    this.context = null
    this.sourceNode = null
    this.filters = []
  }
}
