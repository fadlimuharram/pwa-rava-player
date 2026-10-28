import { useEffect, useState, type ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import {
  BUILT_IN_PRESETS,
  EQ_BAND_FREQUENCIES,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  formatFrequency,
  makePreset,
} from '../../models/equalizer'
import { groupArtists } from '../../models/library'
import {
  TRACK_SORT_OPTIONS,
  trackSortLabels,
  type ThemePreference,
  type TrackSortOption,
} from '../../models/types'
import { formatBytes, formatLongDuration, formatRelativeTime } from '../../util/format'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { TrackRow } from '../components/TrackRow'
import type { Route } from '../routes'

const THEMES: readonly { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'Match system' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function SettingsScreen({
  onNavigate,
  onOpenSleepTimer,
  onOpenSpeed,
}: {
  readonly onNavigate: (route: Route) => void
  readonly onOpenSleepTimer: () => void
  readonly onOpenSpeed: () => void
}): ReactNode {
  const { settings, library, player, storage, imports } = useServices()
  const prefs = useStore(settings)
  const { tracks, playlists } = useStore(library)
  const sleep = useStore(player.sleepTimer)
  const [storedBytes, setStoredBytes] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<'history' | 'library' | null>(null)

  useEffect(() => {
    void library.storedBytes().then(setStoredBytes)
  }, [library, tracks.length])

  return (
    <>
      <div className="list-group__label">Appearance</div>
      <div className="list-group">
        <label className="list-item">
          Theme
          <select
            className="list-item__value"
            value={prefs.theme}
            onChange={(event) => {
              settings.patch({ theme: event.target.value as ThemePreference })
            }}
            style={{ background: 'transparent', border: 'none' }}
          >
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        <label className="list-item">
          Haptic feedback
          <input
            type="checkbox"
            className="list-item__value"
            checked={prefs.hapticsEnabled}
            onChange={(event) => {
              settings.patch({ hapticsEnabled: event.target.checked })
            }}
          />
        </label>
      </div>
      <p className="note">
        Haptics use the Vibration API, which Safari on iOS does not implement — the switch has no
        effect there.
      </p>

      <div className="list-group__label">Audio</div>
      <div className="list-group">
        <button
          className="list-item"
          onClick={() => {
            onNavigate({ kind: 'equalizer' })
          }}
        >
          <Icon name="sliders" size={20} /> Equalizer
          <span className="list-item__value">
            {prefs.equalizerEnabled ? settings.activePreset.name : 'Off'}
          </span>
        </button>
        <button className="list-item" onClick={onOpenSpeed}>
          <Icon name="speed" size={20} /> Playback speed
          <span className="list-item__value">{prefs.playbackSpeed.toFixed(2)}x</span>
        </button>
        <button className="list-item" onClick={onOpenSleepTimer}>
          <Icon name="moon" size={20} /> Sleep timer
          <span className="list-item__value">
            {sleep.option === null
              ? 'Off'
              : sleep.option.kind === 'endOfTrack'
                ? 'End of track'
                : `${sleep.remaining}s`}
          </span>
        </button>
        <label className="list-item">
          Resume last queue on launch
          <input
            type="checkbox"
            className="list-item__value"
            checked={prefs.resumeOnLaunch}
            onChange={(event) => {
              settings.patch({ resumeOnLaunch: event.target.checked })
            }}
          />
        </label>
        <label className="list-item">
          Remember position in each track
          <input
            type="checkbox"
            className="list-item__value"
            checked={prefs.rememberPosition}
            onChange={(event) => {
              settings.patch({ rememberPosition: event.target.checked })
            }}
          />
        </label>
      </div>

      <div className="list-group__label">Import</div>
      <div className="list-group">
        <label className="list-item">
          Default sort
          <select
            className="list-item__value"
            value={prefs.defaultSort}
            onChange={(event) => {
              settings.patch({ defaultSort: event.target.value as TrackSortOption })
            }}
            style={{ background: 'transparent', border: 'none' }}
          >
            {TRACK_SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {trackSortLabels[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="note">
        Imported files are copied into this app&rsquo;s storage on your device. Your originals are
        never modified or deleted.
      </p>

      <div className="list-group__label">Library</div>
      <div className="list-group">
        <div className="list-item">
          Songs<span className="list-item__value">{tracks.length}</span>
        </div>
        <div className="list-item">
          Playlists<span className="list-item__value">{playlists.length}</span>
        </div>
        <div className="list-item">
          Audio stored
          <span className="list-item__value">
            {storedBytes === null ? '…' : formatBytes(storedBytes)}
          </span>
        </div>
        <div className="list-item">
          Space used by this app
          <span className="list-item__value">{formatBytes(storage.usage)}</span>
        </div>
        <div className="list-item">
          Storage protected
          <span className="list-item__value">{storage.persisted ? 'Yes' : 'No'}</span>
        </div>
        <button
          className="list-item"
          onClick={() => {
            onNavigate({ kind: 'stats' })
          }}
        >
          <Icon name="chart" size={20} /> Listening statistics
        </button>
        <button
          className="list-item"
          onClick={() => {
            onNavigate({ kind: 'history' })
          }}
        >
          <Icon name="clock" size={20} /> Listening history
        </button>
      </div>
      {!storage.persisted && (
        <p className="note">
          The browser has not marked this site&rsquo;s storage as protected, so it may clear your
          library if the device runs low on space or the app goes unused for a long time. Adding
          Rava Music to your Home Screen usually fixes this.
        </p>
      )}

      <div className="list-group">
        <button
          className="list-item list-item--danger"
          onClick={() => {
            setConfirming('history')
          }}
        >
          Clear listening history
        </button>
        <button
          className="list-item list-item--danger"
          onClick={() => {
            setConfirming('library')
          }}
        >
          Remove all songs
        </button>
      </div>

      <div className="list-group__label">About</div>
      <div className="list-group">
        <div className="list-item">
          Version<span className="list-item__value">{__APP_VERSION__}</span>
        </div>
        <div className="list-item">
          <Icon name="warning" size={20} /> No account, no ads, no tracking
        </div>
      </div>
      <p className="note">
        Rava Music plays only the files you import. It makes no network requests after the first
        load, and works entirely offline.
      </p>

      {confirming !== null && (
        <Sheet
          title={confirming === 'history' ? 'Clear history?' : 'Remove all songs?'}
          onClose={() => {
            setConfirming(null)
          }}
        >
          <p className="note">
            {confirming === 'history'
              ? 'Play counts and recently played lists are reset. Favorites and playlists are kept.'
              : 'This empties your library on this device. Files elsewhere on your phone are untouched.'}
          </p>
          <div className="list-group">
            <button
              className="list-item list-item--danger"
              onClick={() => {
                if (confirming === 'history') void library.clearHistory()
                else {
                  void player.stop().then(() => library.deleteAllTracks())
                }
                setConfirming(null)
              }}
            >
              {confirming === 'history' ? 'Clear history' : 'Remove all songs'}
            </button>
            <button
              className="list-item"
              onClick={() => {
                setConfirming(null)
              }}
            >
              Cancel
            </button>
          </div>
        </Sheet>
      )}

      {imports.state.progress !== null && <p className="note">An import is still running…</p>}
    </>
  )
}

/** 10-band equalizer. Every slider is wired to a real `BiquadFilterNode`. */
export function EqualizerScreen(): ReactNode {
  const { settings, player } = useServices()
  const prefs = useStore(settings)
  const [gains, setGains] = useState<number[]>(() => [...settings.activePreset.gains])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const apply = (next: number[]): void => {
    setGains(next)
    player.applyEqualizer(next)
  }

  return (
    <>
      <div className="list-group">
        <label className="list-item">
          Equalizer
          <input
            type="checkbox"
            className="list-item__value"
            checked={prefs.equalizerEnabled}
            onChange={(event) => {
              settings.patch({ equalizerEnabled: event.target.checked })
              player.applyEqualizer(gains)
            }}
          />
        </label>
      </div>

      <div className="banner banner--warning">
        <strong>Turning this on changes how playback works</strong>
        <span className="row__subtitle" style={{ whiteSpace: 'normal' }}>
          The equalizer routes audio through the Web Audio API. On iOS that path is suspended when
          the screen locks or you switch apps, so background playback becomes unreliable. Leave the
          equalizer off if uninterrupted lock-screen playback matters more. Reload the page to
          return to the plain audio path.
        </span>
      </div>

      <div className="eq">
        {EQ_BAND_FREQUENCIES.map((frequency, index) => (
          <label className="eq__band" key={frequency}>
            <span>
              {(gains[index] ?? 0) >= 0 ? '+' : ''}
              {Math.round(gains[index] ?? 0)}
            </span>
            <input
              type="range"
              min={EQ_GAIN_MIN}
              max={EQ_GAIN_MAX}
              step={0.5}
              value={gains[index] ?? 0}
              disabled={!prefs.equalizerEnabled}
              aria-label={`${formatFrequency(frequency)} hertz`}
              onChange={(event) => {
                const next = [...gains]
                next[index] = Number(event.target.value)
                apply(next)
              }}
            />
            <span>{formatFrequency(frequency)}</span>
          </label>
        ))}
      </div>

      <div className="list-group__label">Presets</div>
      <div className="list-group">
        {settings.allPresets.map((preset) => (
          <button
            key={preset.id}
            className="list-item"
            onClick={() => {
              settings.patch({ equalizerPresetId: preset.id })
              apply([...preset.gains])
            }}
          >
            {preset.name}
            {!preset.isBuiltIn && <span className="badge">Custom</span>}
            {prefs.equalizerPresetId === preset.id && (
              <span className="list-item__value" style={{ color: 'var(--accent)' }}>
                <Icon name="check" size={18} />
              </span>
            )}
          </button>
        ))}
        <button
          className="list-item"
          onClick={() => {
            setName('')
            setNaming(true)
          }}
        >
          <Icon name="plus" size={20} /> Save current curve as preset…
        </button>
      </div>

      {prefs.customPresets.length > 0 && (
        <div className="list-group">
          {prefs.customPresets.map((preset) => (
            <button
              key={preset.id}
              className="list-item list-item--danger"
              onClick={() => {
                settings.removeCustomPreset(preset.id)
              }}
            >
              <Icon name="trash" size={20} /> Delete “{preset.name}”
            </button>
          ))}
        </div>
      )}

      {naming && (
        <Sheet
          title="Save preset"
          onClose={() => {
            setNaming(false)
          }}
        >
          <div className="list-group">
            <div className="list-item">
              <input
                autoFocus
                value={name}
                placeholder="Preset name"
                aria-label="Preset name"
                onChange={(event) => {
                  setName(event.target.value)
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                disabled={name.trim() === ''}
                style={{ color: 'var(--accent)', fontWeight: 600 }}
                onClick={() => {
                  settings.addCustomPreset(makePreset(name.trim(), gains))
                  player.applyEqualizer(gains)
                  setNaming(false)
                }}
              >
                Save
              </button>
            </div>
          </div>
          <p className="note">
            {BUILT_IN_PRESETS.length} built-in presets ship with the app; custom ones live in this
            browser&rsquo;s local storage.
          </p>
        </Sheet>
      )}
    </>
  )
}

export function HistoryScreen(): ReactNode {
  const { library, player } = useServices()
  const state = useStore(library)
  const entries = library.history()

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="Nothing played yet"
        message="Your listening history appears here once you finish a song."
      />
    )
  }

  return (
    <>
      <div className="pill-row">
        <button
          className="pill"
          onClick={() => {
            void library.clearHistory()
          }}
        >
          <Icon name="trash" size={18} /> Clear history
        </button>
      </div>
      <div className="row-list">
        {entries.map((entry) => (
          <TrackRow
            key={entry.id}
            track={entry.track}
            subtitle={`${entry.track.artist} • ${formatRelativeTime(entry.playedAt)}`}
            isCurrent={state.tracks.length > 0 && player.state.currentTrack?.id === entry.track.id}
            onPlay={() => {
              void player.play([entry.track])
            }}
          />
        ))}
      </div>
    </>
  )
}

export function StatsScreen(): ReactNode {
  const { library } = useServices()
  const { tracks } = useStore(library)

  const topArtists = groupArtists(tracks)
    .map((group) => ({
      name: group.name,
      plays: group.tracks.reduce((total, track) => total + track.playCount, 0),
    }))
    .filter((entry) => entry.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 10)

  return (
    <>
      <div className="list-group__label">Totals</div>
      <div className="list-group">
        <div className="list-item">
          Songs in library<span className="list-item__value">{tracks.length}</span>
        </div>
        <div className="list-item">
          Songs played
          <span className="list-item__value">
            {tracks.filter((track) => track.playCount > 0).length}
          </span>
        </div>
        <div className="list-item">
          Total plays
          <span className="list-item__value">
            {tracks.reduce((total, track) => total + track.playCount, 0)}
          </span>
        </div>
        <div className="list-item">
          Listening time
          <span className="list-item__value">{formatLongDuration(library.totalListeningTime)}</span>
        </div>
        <div className="list-item">
          Library duration
          <span className="list-item__value">
            {formatLongDuration(tracks.reduce((total, track) => total + track.duration, 0))}
          </span>
        </div>
      </div>

      <div className="list-group__label">Most played</div>
      <div className="row-list">
        {library.mostPlayed.length === 0 && (
          <p className="note">Play something to build your statistics.</p>
        )}
        {library.mostPlayed.slice(0, 20).map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            subtitle={`${track.playCount} play${track.playCount === 1 ? '' : 's'}`}
            onPlay={() => {
              /* Statistics rows are informational; tapping is handled by the list above. */
            }}
          />
        ))}
      </div>

      <div className="list-group__label">Top artists</div>
      <div className="list-group">
        {topArtists.length === 0 && <div className="list-item">No plays recorded yet.</div>}
        {topArtists.map((entry) => (
          <div className="list-item" key={entry.name}>
            {entry.name}
            <span className="list-item__value">{entry.plays}</span>
          </div>
        ))}
      </div>
    </>
  )
}
