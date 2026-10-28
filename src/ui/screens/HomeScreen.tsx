import type { ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import { albumKey, displayArtist, type Track } from '../../models/types'
import { formatSongCount } from '../../util/format'
import { Artwork } from '../components/Artwork'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { ImportProgressBanner } from '../components/ImportButton'
import type { Route } from '../routes'

interface Props {
  readonly onNavigate: (route: Route) => void
}

export function HomeScreen({ onNavigate }: Props): ReactNode {
  const { library, player } = useServices()
  const { tracks, playlists, isLoading } = useStore(library)

  if (isLoading) return <p className="note">Opening your library…</p>

  if (tracks.length === 0) {
    return (
      <>
        <ImportProgressBanner />
        <EmptyState
          icon="download"
          title="Your library is empty"
          message="Use the + button to add audio files from this device. Everything stays on your phone — nothing is uploaded."
        />
      </>
    )
  }

  return (
    <>
      <ImportProgressBanner />

      <div className="pill-row">
        <button
          className="pill pill--primary"
          onClick={() => {
            void player.shuffleAll(tracks)
          }}
        >
          <Icon name="shuffle" size={18} /> Shuffle all
        </button>
        <button
          className="pill"
          onClick={() => {
            onNavigate({ kind: 'allSongs' })
          }}
        >
          <Icon name="library" size={18} /> All songs
        </button>
      </div>

      <Carousel
        title="Recently Added"
        tracks={library.recentlyAdded}
        onMore={() => {
          onNavigate({ kind: 'smart', id: 'recentlyAdded' })
        }}
      />
      <Carousel
        title="Recently Played"
        tracks={library.recentlyPlayed}
        onMore={() => {
          onNavigate({ kind: 'smart', id: 'recentlyPlayed' })
        }}
      />
      <Carousel
        title="Favorites"
        tracks={library.favorites}
        onMore={() => {
          onNavigate({ kind: 'smart', id: 'favorites' })
        }}
      />

      {playlists.length > 0 && (
        <section className="section">
          <div className="section__header">
            <h2 className="section__title">Playlists</h2>
          </div>
          <div className="hscroll">
            {playlists.map((playlist) => {
              const members = library.tracksByIds(playlist.trackIds)
              const cover = members.find((track) => track.artworkKey !== null)
              return (
                <button
                  key={playlist.id}
                  className="card"
                  onClick={() => {
                    onNavigate({ kind: 'playlist', id: playlist.id })
                  }}
                >
                  <Artwork artworkKey={cover?.artworkKey ?? null} seed={playlist.name} size={148} />
                  <span className="card__title">{playlist.name}</span>
                  <span className="card__subtitle">
                    {formatSongCount(playlist.trackIds.length)}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

interface CarouselProps {
  readonly title: string
  readonly tracks: readonly Track[]
  readonly onMore: () => void
}

function Carousel({ title, tracks, onMore }: CarouselProps): ReactNode {
  const { player } = useServices()
  if (tracks.length === 0) return null
  const shown = tracks.slice(0, 12)

  return (
    <section className="section">
      <div className="section__header">
        <h2 className="section__title">{title}</h2>
        <button onClick={onMore} className="section__subtitle" style={{ color: 'var(--accent)' }}>
          See all
        </button>
      </div>
      <div className="hscroll">
        {shown.map((track, index) => (
          <button
            key={track.id}
            className="card"
            onClick={() => {
              void player.play(shown, index)
            }}
          >
            <Artwork artworkKey={track.artworkKey} seed={albumKey(track)} size={148} />
            <span className="card__title">{track.title}</span>
            <span className="card__subtitle">{displayArtist(track)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
