import { Store } from '../util/store'
import type { SleepTimerOption } from '../models/equalizer'

export interface SleepTimerState {
  readonly option: SleepTimerOption | null
  readonly remaining: number
}

/**
 * Countdown that pauses playback when it reaches zero.
 *
 * It tracks a wall-clock deadline rather than counting interval ticks, because background tabs
 * get their timers throttled and a tick-counting timer would drift badly.
 */
export class SleepTimer extends Store<SleepTimerState> {
  private handle: number | null = null
  private deadline = 0
  private onFire: (() => void) | null = null

  constructor() {
    super({ option: null, remaining: 0 })
  }

  get isActive(): boolean {
    return this.state.option !== null
  }

  get isEndOfTrack(): boolean {
    return this.state.option?.kind === 'endOfTrack'
  }

  start(option: SleepTimerOption, onFire: () => void): void {
    this.cancel()
    this.onFire = onFire

    if (option.kind === 'endOfTrack') {
      this.update(() => ({ option, remaining: 0 }))
      return
    }

    const seconds = option.minutes * 60
    this.deadline = Date.now() + seconds * 1000
    this.update(() => ({ option, remaining: seconds }))
    this.handle = window.setInterval(() => {
      this.tick()
    }, 1000)
  }

  cancel(): void {
    if (this.handle !== null) {
      window.clearInterval(this.handle)
      this.handle = null
    }
    this.deadline = 0
    this.onFire = null
    this.update(() => ({ option: null, remaining: 0 }))
  }

  /** Called by the player when a track ends, for the "end of current track" option. */
  trackDidEnd(): void {
    if (this.isEndOfTrack) this.fire()
  }

  private tick(): void {
    const remaining = Math.max(0, Math.round((this.deadline - Date.now()) / 1000))
    this.update((state) => ({ ...state, remaining }))
    if (remaining <= 0) this.fire()
  }

  private fire(): void {
    const action = this.onFire
    this.cancel()
    action?.()
  }
}
