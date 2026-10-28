import type { ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import { albumKey, displayArtist } from '../../models/types'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { MiniProgressBar } from './Scrubber'

/** Persistent bar above the tab bar. Visible on every screen while something is loaded. */
export function MiniPlayer({ onOpen }: { readonly onOpen: () => void }): ReactNode {
  const { player } = useServices()
  const { currentTrack, status } = useStore(player)
  if (currentTrack === null) return null
  const isPlaying = status === 'playing'

  return (
    <div className="mini" data-testid="mini-player">
      <MiniProgressBar progress={player.progress} />
      <div className="mini__body">
        <button
          onClick={onOpen}
          aria-label={`Open player. Now playing ${currentTrack.title}`}
          style={{ display: 'contents' }}
        >
          <Artwork artworkKey={currentTrack.artworkKey} seed={albumKey(currentTrack)} size={44} />
          <span className="mini__text">
            <span className="mini__title">{currentTrack.title}</span>
            <span className="mini__subtitle">{displayArtist(currentTrack)}</span>
          </span>
        </button>
        <button
          className="icon-button icon-button--plain"
          onClick={() => {
            void player.togglePlayPause()
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </button>
        <button
          className="icon-button icon-button--plain"
          onClick={() => {
            void player.next()
          }}
          aria-label="Next track"
        >
          <Icon name="next" />
        </button>
      </div>
    </div>
  )
}
