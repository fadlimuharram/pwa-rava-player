import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useServices, useStore } from '../app/AppProvider'
import type { Playlist, Track } from '../models/types'
import { groupAlbums, groupArtists, groupGenres } from '../models/library'
import { formatSongCount } from '../util/format'
import { Icon, type IconName } from './components/Icon'
import { ImportButton } from './components/ImportButton'
import { MiniPlayer } from './components/MiniPlayer'
import { NowPlaying, SleepTimerSheet, SpeedSheet } from './NowPlaying'
import { TABS, type Route, type SmartListId, type TabId } from './routes'
import {
  AlbumsScreen,
  ArtistsScreen,
  FoldersScreen,
  GenresScreen,
  LibraryScreen,
} from './screens/BrowseScreens'
import { HomeScreen } from './screens/HomeScreen'
import { PlaylistDetailScreen, PlaylistsScreen, smartList } from './screens/PlaylistScreens'
import {
  EqualizerScreen,
  HistoryScreen,
  SettingsScreen,
  StatsScreen,
} from './screens/SettingsScreens'
import { TrackListScreen } from './screens/TrackListScreen'
import { findNode } from './screens/BrowseScreens'
import { buildFolderTree } from '../models/library'

const TAB_ICONS: Record<TabId, IconName> = {
  home: 'home',
  library: 'library',
  playlists: 'playlists',
  favorites: 'heart',
  settings: 'settings',
}

type Stacks = Record<TabId, Route[]>

const emptyStacks = (): Stacks => ({
  home: [],
  library: [],
  playlists: [],
  favorites: [],
  settings: [],
})

export function App(): ReactNode {
  const { player, settings, library } = useServices()
  const playback = useStore(player)
  const prefs = useStore(settings)
  const libraryState = useStore(library)

  const [tab, setTab] = useState<TabId>('home')
  const [stacks, setStacks] = useState<Stacks>(emptyStacks)
  const [showPlayer, setShowPlayer] = useState(false)
  const [globalSheet, setGlobalSheet] = useState<'sleep' | 'speed' | null>(null)

  // The theme is applied to <html> so the token overrides in the stylesheet take effect, and
  // so the browser chrome (status bar, form controls) follows the choice too.
  useEffect(() => {
    const root = document.documentElement
    if (prefs.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', prefs.theme)
  }, [prefs.theme])

  const stack = stacks[tab]
  const route = stack[stack.length - 1] ?? null

  const push = useCallback(
    (next: Route) => {
      setStacks((current) => ({ ...current, [tab]: [...current[tab], next] }))
    },
    [tab],
  )

  const pop = useCallback(() => {
    setStacks((current) => ({ ...current, [tab]: current[tab].slice(0, -1) }))
  }, [tab])

  const title = useMemo(
    () =>
      route === null
        ? rootTitle(tab)
        : routeTitle(route, libraryState.tracks, libraryState.playlists),
    [route, tab, libraryState],
  )

  return (
    <div className="app">
      <div className={`screen${playback.currentTrack === null ? ' screen--no-mini' : ''}`}>
        <header className="screen__header">
          {route !== null && (
            <button className="icon-button icon-button--plain" onClick={pop} aria-label="Back">
              <Icon name="chevron-left" />
            </button>
          )}
          <h1 className={`screen__title${route === null ? '' : ' screen__title--inline'}`}>
            {title}
          </h1>
          {(tab === 'home' || tab === 'library') && route === null && <ImportButton />}
        </header>

        {route === null ? (
          <RootScreen
            tab={tab}
            onNavigate={push}
            onOpenSleepTimer={() => {
              setGlobalSheet('sleep')
            }}
            onOpenSpeed={() => {
              setGlobalSheet('speed')
            }}
          />
        ) : (
          <PushedScreen route={route} onNavigate={push} />
        )}
      </div>

      <MiniPlayer
        onOpen={() => {
          setShowPlayer(true)
        }}
      />

      <nav className="tabbar" aria-label="Main">
        {TABS.map((item) => (
          <button
            key={item.id}
            className="tabbar__item"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => {
              if (tab === item.id) setStacks((current) => ({ ...current, [item.id]: [] }))
              else setTab(item.id)
            }}
          >
            <span className="tabbar__icon">
              <Icon name={TAB_ICONS[item.id]} size={20} />
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {showPlayer && (
        <NowPlaying
          onClose={() => {
            setShowPlayer(false)
          }}
        />
      )}
      {globalSheet === 'sleep' && (
        <SleepTimerSheet
          onClose={() => {
            setGlobalSheet(null)
          }}
        />
      )}
      {globalSheet === 'speed' && (
        <SpeedSheet
          onClose={() => {
            setGlobalSheet(null)
          }}
        />
      )}

      {playback.error !== null && (
        <div
          className="toast"
          role="alert"
          onClick={() => {
            player.clearError()
          }}
        >
          {playback.error}
        </div>
      )}
    </div>
  )
}

function RootScreen({
  tab,
  onNavigate,
  onOpenSleepTimer,
  onOpenSpeed,
}: {
  readonly tab: TabId
  readonly onNavigate: (route: Route) => void
  readonly onOpenSleepTimer: () => void
  readonly onOpenSpeed: () => void
}): ReactNode {
  const { library } = useServices()
  useStore(library)

  switch (tab) {
    case 'home':
      return <HomeScreen onNavigate={onNavigate} />
    case 'library':
      return <LibraryScreen onNavigate={onNavigate} />
    case 'playlists':
      return <PlaylistsScreen onNavigate={onNavigate} />
    case 'favorites':
      return (
        <TrackListScreen
          title="Favorites"
          tracks={library.favorites}
          emptyMessage="Tap the heart on any song to keep it here."
        />
      )
    case 'settings':
      return (
        <SettingsScreen
          onNavigate={onNavigate}
          onOpenSleepTimer={onOpenSleepTimer}
          onOpenSpeed={onOpenSpeed}
        />
      )
  }
}

function PushedScreen({
  route,
  onNavigate,
}: {
  readonly route: Route
  readonly onNavigate: (route: Route) => void
}): ReactNode {
  const { library } = useServices()
  const { tracks } = useStore(library)

  switch (route.kind) {
    case 'allSongs':
      return <TrackListScreen title="All Songs" tracks={tracks} />
    case 'albums':
      return <AlbumsScreen onNavigate={onNavigate} />
    case 'album': {
      const album = groupAlbums(tracks).find((candidate) => candidate.id === route.id)
      if (album === undefined) return <TrackListScreen title="Album" tracks={[]} />
      return (
        <TrackListScreen
          title={album.title}
          tracks={album.tracks}
          subtitle={`${album.artist} • ${formatSongCount(album.tracks.length)}`}
          headerArtworkKey={album.artworkKey}
          headerSeed={album.id}
          allowSorting={false}
        />
      )
    }
    case 'artists':
      return <ArtistsScreen onNavigate={onNavigate} />
    case 'artist': {
      const artist = groupArtists(tracks).find((candidate) => candidate.id === route.id)
      if (artist === undefined) return <TrackListScreen title="Artist" tracks={[]} />
      return (
        <TrackListScreen
          title={artist.name}
          tracks={artist.tracks}
          subtitle={`${formatSongCount(artist.tracks.length)} • ${artist.albumCount} album${
            artist.albumCount === 1 ? '' : 's'
          }`}
          headerArtworkKey={artist.artworkKey}
          headerSeed={artist.id}
          allowSorting={false}
        />
      )
    }
    case 'genres':
      return <GenresScreen onNavigate={onNavigate} />
    case 'genre': {
      const genre = groupGenres(tracks).find((candidate) => candidate.name === route.name)
      return (
        <TrackListScreen title={route.name} tracks={genre?.tracks ?? []} allowSorting={false} />
      )
    }
    case 'folders':
      return <FoldersScreen path={route.path} onNavigate={onNavigate} />
    case 'format':
      return (
        <TrackListScreen
          title={route.name}
          tracks={tracks.filter((track) => track.fileFormat === route.name)}
        />
      )
    case 'smart':
      return (
        <TrackListScreen
          title={smartTitle(route.id)}
          tracks={smartList(library, route.id)}
          emptyMessage="This list fills up as you use the app."
        />
      )
    case 'playlist':
      return <PlaylistDetailScreen id={route.id} />
    case 'equalizer':
      return <EqualizerScreen />
    case 'history':
      return <HistoryScreen />
    case 'stats':
      return <StatsScreen />
  }
}

const rootTitle = (tab: TabId): string =>
  tab === 'home' ? 'Rava Music' : (TABS.find((item) => item.id === tab)?.label ?? '')

const smartTitle = (id: SmartListId): string =>
  ({
    recentlyAdded: 'Recently Added',
    recentlyPlayed: 'Recently Played',
    mostPlayed: 'Most Played',
    favorites: 'Favorites',
    neverPlayed: 'Never Played',
  })[id]

function routeTitle(
  route: Route,
  tracks: readonly Track[],
  playlists: readonly Playlist[],
): string {
  switch (route.kind) {
    case 'allSongs':
      return 'All Songs'
    case 'albums':
      return 'Albums'
    case 'album':
      return groupAlbums(tracks).find((a) => a.id === route.id)?.title ?? 'Album'
    case 'artists':
      return 'Artists'
    case 'artist':
      return groupArtists(tracks).find((a) => a.id === route.id)?.name ?? 'Artist'
    case 'genres':
      return 'Genres'
    case 'genre':
      return route.name
    case 'folders': {
      if (route.path === '/') return 'Folders'
      const node = findNode(buildFolderTree(tracks), route.path)
      return node?.name ?? 'Folder'
    }
    case 'format':
      return route.name
    case 'smart':
      return smartTitle(route.id)
    case 'playlist':
      return playlists.find((playlist) => playlist.id === route.id)?.name ?? 'Playlist'
    case 'equalizer':
      return 'Equalizer'
    case 'history':
      return 'History'
    case 'stats':
      return 'Statistics'
  }
}
