import { Store } from '../util/store'
import {
  BUILT_IN_PRESETS,
  FLAT_PRESET_ID,
  flatPreset,
  type EqualizerPreset,
} from '../models/equalizer'
import type { RepeatMode, ThemePreference, TrackSortOption } from '../models/types'
import { log } from '../util/log'

export interface SavedPlaybackSession {
  readonly trackIds: readonly string[]
  readonly currentIndex: number
  readonly position: number
  readonly repeatMode: RepeatMode
  readonly isShuffled: boolean
}

export interface SettingsState {
  readonly theme: ThemePreference
  readonly resumeOnLaunch: boolean
  readonly rememberPosition: boolean
  readonly playbackSpeed: number
  readonly volume: number
  readonly equalizerEnabled: boolean
  readonly equalizerPresetId: string
  readonly customPresets: readonly EqualizerPreset[]
  readonly defaultSort: TrackSortOption
  readonly hapticsEnabled: boolean
  readonly session: SavedPlaybackSession | null
}

const STORAGE_KEY = 'rava.settings.v1'

const DEFAULTS: SettingsState = {
  theme: 'system',
  resumeOnLaunch: true,
  rememberPosition: true,
  playbackSpeed: 1,
  volume: 1,
  equalizerEnabled: false,
  equalizerPresetId: FLAT_PRESET_ID,
  customPresets: [],
  defaultSort: 'recentlyAdded',
  hapticsEnabled: true,
  session: null,
}

/**
 * User preferences.
 *
 * Backed by `localStorage` rather than IndexedDB because these are small scalars that the audio
 * layer needs synchronously, before the database has finished opening.
 */
export class SettingsStore extends Store<SettingsState> {
  constructor(private readonly storage: Storage | null = safeLocalStorage()) {
    super(readSettings(storage))
  }

  patch(changes: Partial<SettingsState>): void {
    this.update((state) => {
      const next = { ...state, ...changes }
      this.persist(next)
      return next
    })
  }

  get allPresets(): EqualizerPreset[] {
    return [...BUILT_IN_PRESETS, ...this.state.customPresets]
  }

  get activePreset(): EqualizerPreset {
    return (
      this.allPresets.find((preset) => preset.id === this.state.equalizerPresetId) ?? flatPreset()
    )
  }

  addCustomPreset(preset: EqualizerPreset): void {
    this.patch({
      customPresets: [...this.state.customPresets, preset],
      equalizerPresetId: preset.id,
    })
  }

  removeCustomPreset(id: string): void {
    const customPresets = this.state.customPresets.filter((preset) => preset.id !== id)
    const equalizerPresetId =
      this.state.equalizerPresetId === id ? FLAT_PRESET_ID : this.state.equalizerPresetId
    this.patch({ customPresets, equalizerPresetId })
  }

  saveSession(session: SavedPlaybackSession | null): void {
    this.patch({ session })
  }

  private persist(state: SettingsState): void {
    if (this.storage === null) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      // Private browsing and a full quota both land here; losing preferences is survivable.
      log.warn('storage', `Could not persist settings: ${String(error)}`)
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    const probe = '__rava__'
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

function readSettings(storage: Storage | null): SettingsState {
  if (storage === null) return DEFAULTS
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULTS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS
    // Merging over the defaults means a settings file written by an older build never produces
    // an undefined field at runtime.
    return { ...DEFAULTS, ...(parsed as Partial<SettingsState>) }
  } catch {
    return DEFAULTS
  }
}
