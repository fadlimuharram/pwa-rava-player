import { useState, type ReactNode } from 'react'
import { useServices, useStore } from '../app/AppProvider'
import {
  SLEEP_TIMER_PRESETS,
  sleepTimerId,
  sleepTimerLabel,
  type SleepTimerOption,
} from '../models/equalizer'
import { activeLyricIndex, isSynchronized, parseLyrics } from '../models/lyrics'
import { albumKey, displayArtist } from '../models/types'
import { formatDuration } from '../util/format'
import { Artwork } from './components/Artwork'
import { EmptyState } from './components/EmptyState'
import { Icon } from './components/Icon'
import { Scrubber } from './components/Scrubber'
import { Sheet } from './components/Sheet'
import { AddToPlaylistSheet } from './components/TrackActions'
import { TrackRow } from './components/TrackRow'

type Overlay = 'queue' | 'lyrics' | 'sleep' | 'speed' | 'playlist' | null

/**
 * The full-screen player.
 *
 * Every control talks to `PlaybackController`, which keeps running when this sheet is
 * dismissed — closing Now Playing never interrupts audio.
 */
export function NowPlaying({ onClose }: { readonly onClose: () => void }): ReactNode {
  const { player, library, settings } = useServices()
  const playback = useStore(player)
  const prefs = useStore(settings)
  const sleep = useStore(player.sleepTimer)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const track = playback.currentTrack
  const isPlaying = playback.status === 'playing'

  return (
    <>
      <Sheet
        title="Now Playing"
        onClose={onClose}
        full
        trailing={
          <button
            className="icon-button icon-button--plain"
            aria-label="More actions"
            onClick={() => {
              setMenuOpen(true)
            }}
          >
            <Icon name="more" />
          </button>
        }
      >
        {track === null ? (
          <EmptyState
            icon="note"
            title="Nothing playing"
            message="Pick a song from your library to start listening."
          />
        ) : (
          <div className="now">
            <Artwork
              artworkKey={track.artworkKey}
              seed={albumKey(track)}
              size={280}
              className={`now__art${isPlaying ? '' : ' now__art--paused'}`}
            />

            <div className="now__meta">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="now__title">{track.title}</h1>
                <div className="now__artist">{displayArtist(track)}</div>
              </div>
              <button
                aria-label={track.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                style={{ color: track.isFavorite ? 'var(--pink)' : 'var(--text-dim)' }}
                onClick={() => {
                  void library.toggleFavorite(track.id)
                }}
              >
                <Icon name={track.isFavorite ? 'heart-filled' : 'heart'} size={26} />
              </button>
            </div>

            <Scrubber
              progress={player.progress}
              onSeek={(seconds) => {
                player.seek(seconds)
              }}
            />

            <div className="now__transport">
              <button
                aria-label="Previous track"
                onClick={() => {
                  void player.previous()
                }}
              >
                <Icon name="previous" size={30} />
              </button>
              <button
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={() => {
                  void player.togglePlayPause()
                }}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={32} />
              </button>
              <button
                aria-label="Next track"
                onClick={() => {
                  void player.next()
                }}
              >
                <Icon name="next" size={30} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <Icon name="volume-low" size={16} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={playback.volume}
                aria-label="App volume"
                onChange={(event) => {
                  player.setVolume(Number(event.target.value))
                }}
              />
              <Icon name="volume-high" size={16} />
            </div>

            <div className="now__secondary">
              <button
                aria-label={playback.queue.isShuffled ? 'Shuffle on' : 'Shuffle off'}
                data-active={playback.queue.isShuffled}
                onClick={() => {
                  player.toggleShuffle()
                }}
              >
                <Icon name="shuffle" />
              </button>
              <button
                aria-label="Playback speed"
                data-active={prefs.playbackSpeed !== 1}
                onClick={() => {
                  setOverlay('speed')
                }}
                style={{ fontSize: 14, fontWeight: 700 }}
              >
                {prefs.playbackSpeed.toFixed(2).replace(/\.?0+$/, '')}x
              </button>
              <button
                aria-label="Show queue"
                onClick={() => {
                  setOverlay('queue')
                }}
              >
                <Icon name="queue" />
              </button>
              <button
                aria-label={`Repeat ${playback.queue.repeatMode}`}
                data-active={playback.queue.repeatMode !== 'off'}
                onClick={() => {
                  player.cycleRepeatMode()
                }}
              >
                <Icon name={playback.queue.repeatMode === 'one' ? 'repeat-one' : 'repeat'} />
              </button>
            </div>

            {sleep.option !== null && (
              <div className="badge">
                <Icon name="moon" size={12} />{' '}
                {sleep.option.kind === 'endOfTrack'
                  ? 'Stops at end of track'
                  : `Stops in ${formatDuration(sleep.remaining)}`}
              </div>
            )}
          </div>
        )}
      </Sheet>

      {menuOpen && (
        <Sheet
          title={track?.title ?? 'Options'}
          onClose={() => {
            setMenuOpen(false)
          }}
        >
          <div className="list-group">
            <button
              className="list-item"
              disabled={track === null}
              onClick={() => {
                setMenuOpen(false)
                setOverlay('playlist')
              }}
            >
              <Icon name="playlists" size={20} /> Add to playlist…
            </button>
            <button
              className="list-item"
              disabled={track === null || track.lyrics === ''}
              onClick={() => {
                setMenuOpen(false)
                setOverlay('lyrics')
              }}
            >
              <Icon name="quote" size={20} /> Lyrics
            </button>
            <button
              className="list-item"
              onClick={() => {
                setMenuOpen(false)
                setOverlay('sleep')
              }}
            >
              <Icon name="moon" size={20} /> Sleep timer
            </button>
            <button
              className="list-item"
              onClick={() => {
                setMenuOpen(false)
                setOverlay('speed')
              }}
            >
              <Icon name="speed" size={20} /> Playback speed
            </button>
          </div>
          {track !== null && (
            <p className="note">
              {track.fileFormat} • {formatDuration(track.duration)} • {track.fileName}
            </p>
          )}
        </Sheet>
      )}

      {overlay === 'queue' && (
        <QueueSheet
          onClose={() => {
            setOverlay(null)
          }}
        />
      )}
      {overlay === 'lyrics' && (
        <LyricsSheet
          onClose={() => {
            setOverlay(null)
          }}
        />
      )}
      {overlay === 'sleep' && (
        <SleepTimerSheet
          onClose={() => {
            setOverlay(null)
          }}
        />
      )}
      {overlay === 'speed' && (
        <SpeedSheet
          onClose={() => {
            setOverlay(null)
          }}
        />
      )}
      {overlay === 'playlist' && track !== null && (
        <AddToPlaylistSheet
          trackIds={[track.id]}
          onClose={() => {
            setOverlay(null)
          }}
        />
      )}
    </>
  )
}

/** Up Next: what is playing, what comes after, and reordering. */
export function QueueSheet({ onClose }: { readonly onClose: () => void }): ReactNode {
  const { player } = useServices()
  const playback = useStore(player)
  const upcoming = player.upcoming()
  const baseIndex = (playback.queue.currentIndex ?? -1) + 1

  return (
    <Sheet title="Queue" onClose={onClose} full>
      {playback.currentTrack !== null && (
        <>
          <div className="list-group__label">Playing</div>
          <div className="row-list">
            <TrackRow
              track={playback.currentTrack}
              isCurrent
              isPlaying={playback.status === 'playing'}
              onPlay={() => {
                void player.togglePlayPause()
              }}
            />
          </div>
        </>
      )}

      <div className="section__header">
        <span className="list-group__label" style={{ padding: 0 }}>
          Up next
        </span>
        {upcoming.length > 0 && (
          <button
            style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}
            onClick={() => {
              player.clearUpcoming()
            }}
          >
            Clear
          </button>
        )}
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          icon="queue"
          title="Nothing up next"
          message="Play an album, playlist or folder to fill the queue."
        />
      ) : (
        <div className="row-list">
          {upcoming.map((item, offset) => (
            <div key={item.entry.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TrackRow
                  track={item.track}
                  onPlay={() => {
                    void player.playEntry(item.entry.id)
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 2, paddingRight: 8 }}>
                <button
                  aria-label={`Move ${item.track.title} up`}
                  disabled={offset === 0}
                  style={{ opacity: offset === 0 ? 0.3 : 1, padding: 6 }}
                  onClick={() => {
                    player.moveInQueue(baseIndex + offset, baseIndex + offset - 1)
                  }}
                >
                  <Icon name="chevron-down" size={14} />
                </button>
                <button
                  aria-label={`Move ${item.track.title} down`}
                  disabled={offset === upcoming.length - 1}
                  style={{
                    opacity: offset === upcoming.length - 1 ? 0.3 : 1,
                    padding: 6,
                    transform: 'rotate(180deg)',
                  }}
                  onClick={() => {
                    player.moveInQueue(baseIndex + offset, baseIndex + offset + 1)
                  }}
                >
                  <Icon name="chevron-down" size={14} />
                </button>
                <button
                  aria-label={`Remove ${item.track.title} from queue`}
                  style={{ padding: 6 }}
                  onClick={() => {
                    void player.removeFromQueue(item.entry.id)
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/** Lyrics viewer, highlighting the current line when the file carries LRC timestamps. */
export function LyricsSheet({ onClose }: { readonly onClose: () => void }): ReactNode {
  const { player } = useServices()
  const playback = useStore(player)
  const { currentTime } = useStore(player.progress)
  const raw = playback.currentTrack?.lyrics ?? ''
  const lines = parseLyrics(raw)
  const active = isSynchronized(lines) ? activeLyricIndex(lines, currentTime) : null

  return (
    <Sheet title={playback.currentTrack?.title ?? 'Lyrics'} onClose={onClose} full>
      {lines.length === 0 ? (
        <EmptyState
          icon="quote"
          title="No lyrics"
          message="This file has no embedded lyrics, and no .lrc file was picked alongside it."
        />
      ) : (
        <div className="lyrics">
          {lines.map((line, index) => (
            <button
              key={line.id}
              className="lyrics__line"
              data-active={index === active}
              onClick={() => {
                if (line.timestamp !== null) player.seek(line.timestamp)
              }}
            >
              {line.text}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

export function SleepTimerSheet({ onClose }: { readonly onClose: () => void }): ReactNode {
  const { player } = useServices()
  const sleep = useStore(player.sleepTimer)
  const [custom, setCustom] = useState(20)

  const start = (option: SleepTimerOption): void => {
    player.startSleepTimer(option)
    onClose()
  }

  return (
    <Sheet title="Sleep timer" onClose={onClose}>
      {sleep.option !== null && (
        <div className="list-group">
          <div className="list-item">
            <Icon name="moon" size={20} /> Stops in
            <span className="list-item__value">
              {sleep.option.kind === 'endOfTrack'
                ? 'End of track'
                : formatDuration(sleep.remaining)}
            </span>
          </div>
          <button
            className="list-item list-item--danger"
            onClick={() => {
              player.cancelSleepTimer()
              onClose()
            }}
          >
            Turn off sleep timer
          </button>
        </div>
      )}

      <div className="list-group">
        {SLEEP_TIMER_PRESETS.map((option) => (
          <button
            key={sleepTimerId(option)}
            className="list-item"
            onClick={() => {
              start(option)
            }}
          >
            {sleepTimerLabel(option)}
            {sleep.option !== null && sleepTimerId(sleep.option) === sleepTimerId(option) && (
              <span className="list-item__value" style={{ color: 'var(--accent)' }}>
                <Icon name="check" size={18} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="list-group">
        <div className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <strong>{custom} minutes</strong>
          <input
            type="range"
            min={1}
            max={240}
            step={1}
            value={custom}
            aria-label="Custom sleep timer minutes"
            onChange={(event) => {
              setCustom(Number(event.target.value))
            }}
          />
        </div>
        <button
          className="list-item"
          onClick={() => {
            start({ kind: 'minutes', minutes: custom })
          }}
        >
          Start custom timer
        </button>
      </div>

      <p className="note">
        The timer pauses playback when it runs out. It keeps counting while the app is in the
        background, because it tracks a deadline rather than ticking.
      </p>
    </Sheet>
  )
}

export function SpeedSheet({ onClose }: { readonly onClose: () => void }): ReactNode {
  const { player, settings } = useServices()
  const prefs = useStore(settings)
  const presets = [0.75, 1, 1.25, 1.5, 1.75, 2]

  return (
    <Sheet title="Playback speed" onClose={onClose}>
      <div className="list-group">
        <div className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <strong style={{ fontSize: 28 }}>{prefs.playbackSpeed.toFixed(2)}x</strong>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={prefs.playbackSpeed}
            aria-label="Playback speed"
            onChange={(event) => {
              player.setPlaybackSpeed(Number(event.target.value))
            }}
          />
          <span className="row__subtitle">Pitch is preserved at every speed.</span>
        </div>
      </div>
      <div className="list-group">
        {presets.map((value) => (
          <button
            key={value}
            className="list-item"
            onClick={() => {
              player.setPlaybackSpeed(value)
            }}
          >
            {value.toFixed(2)}x
            {Math.abs(prefs.playbackSpeed - value) < 0.001 && (
              <span className="list-item__value" style={{ color: 'var(--accent)' }}>
                <Icon name="check" size={18} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
