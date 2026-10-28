import { newId } from './types'

/**
 * A 10-band equalizer curve, in dB gain per band.
 *
 * The frequencies match the `BiquadFilterNode` chain in `AudioEngine`, so every slider in the
 * EQ screen changes real audio rather than drawing a decorative control.
 */
export interface EqualizerPreset {
  readonly id: string
  name: string
  gains: number[]
  isBuiltIn: boolean
}

export const EQ_BAND_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_GAIN_MIN = -12
export const EQ_GAIN_MAX = 12

/** Pads or trims an arbitrary gain list to exactly one value per band, clamped to range. */
export function normalizeGains(gains: readonly number[]): number[] {
  const result: number[] = []
  for (let i = 0; i < EQ_BAND_FREQUENCIES.length; i += 1) {
    const value = gains[i] ?? 0
    result.push(Math.min(Math.max(value, EQ_GAIN_MIN), EQ_GAIN_MAX))
  }
  return result
}

export function makePreset(
  name: string,
  gains: readonly number[],
  isBuiltIn = false,
): EqualizerPreset {
  return { id: newId(), name, gains: normalizeGains(gains), isBuiltIn }
}

const builtIn = (id: string, name: string, gains: number[]): EqualizerPreset => ({
  id,
  name,
  gains: normalizeGains(gains),
  isBuiltIn: true,
})

export const FLAT_PRESET_ID = 'builtin-flat'

export const BUILT_IN_PRESETS: readonly EqualizerPreset[] = [
  builtIn(FLAT_PRESET_ID, 'Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  builtIn('builtin-bass', 'Bass Boost', [8, 7, 5.5, 3.5, 1, 0, 0, 0, 0, 0]),
  builtIn('builtin-treble', 'Treble Boost', [0, 0, 0, 0, 0, 1, 3, 5, 6.5, 7.5]),
  builtIn('builtin-vocal', 'Vocal', [-2, -2, -1, 1.5, 4, 4.5, 3.5, 1.5, 0, -1]),
  builtIn('builtin-rock', 'Rock', [5, 4, 2.5, -0.5, -1.5, 0.5, 2.5, 4, 5, 5.5]),
  builtIn('builtin-pop', 'Pop', [-1, 1, 3, 4.5, 4, 2, 0, -0.5, -1, -1.5]),
  builtIn('builtin-jazz', 'Jazz', [3.5, 2.5, 1, 2, -1, -1, 0, 1.5, 3, 4]),
  builtIn('builtin-classical', 'Classical', [4, 3.5, 2.5, 1.5, -1, -1, 0, 2, 3, 4]),
  builtIn('builtin-electronic', 'Electronic', [5.5, 4.5, 1.5, 0, -1.5, 2, 1, 1.5, 4.5, 5.5]),
  builtIn('builtin-loudness', 'Loudness', [6, 4.5, 1, 0, -1, 0, 1, 3, 5.5, 6.5]),
]

export const flatPreset = (): EqualizerPreset => BUILT_IN_PRESETS[0] as EqualizerPreset

export const formatFrequency = (hertz: number): string =>
  hertz >= 1000 ? `${hertz / 1000}k` : `${hertz}`

/** Sleep timer choices offered in the UI. */
export type SleepTimerOption = { kind: 'minutes'; minutes: number } | { kind: 'endOfTrack' }

export const SLEEP_TIMER_PRESETS: readonly SleepTimerOption[] = [
  { kind: 'minutes', minutes: 5 },
  { kind: 'minutes', minutes: 10 },
  { kind: 'minutes', minutes: 15 },
  { kind: 'minutes', minutes: 30 },
  { kind: 'minutes', minutes: 45 },
  { kind: 'minutes', minutes: 60 },
  { kind: 'minutes', minutes: 90 },
  { kind: 'endOfTrack' },
]

export function sleepTimerLabel(option: SleepTimerOption): string {
  if (option.kind === 'endOfTrack') return 'End of current track'
  const { minutes } = option
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${minutes} minutes`
}

export const sleepTimerId = (option: SleepTimerOption): string =>
  option.kind === 'endOfTrack' ? 'endOfTrack' : `m${option.minutes}`
