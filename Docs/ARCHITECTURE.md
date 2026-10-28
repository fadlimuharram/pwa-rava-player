# Architecture

## The one rule

**Playback never depends on the view tree.** The services are created once, outside React, and
live for the whole page. Components read them; they never construct one. Switching tabs,
dismissing Now Playing or backgrounding the browser changes nothing about the audio path.

```
                     ┌────────────────────────────────┐
                     │        createServices()        │   once, in dependency order
                     └───────────────┬────────────────┘
        ┌──────────────┬─────────────┼───────────────┬───────────────┐
        ▼              ▼             ▼               ▼               ▼
   Database       ArtworkCache  LibraryStore   ImportService   PlaybackController
  (IndexedDB)     (object URLs)  (snapshot)    (files→tracks)  (queue + engine + Lock Screen)
                                      ▲                                │
                                      └─────────── reads tracks ───────┘
```

React subscribes through `useSyncExternalStore`, so a store update re-renders exactly the
components that read it.

## Layers

### `src/models` — pure logic, no I/O
`types.ts` (Track, Playlist, the play-count rule), `queue.ts`, `library.ts` (sorting, search,
grouping, folder tree), `equalizer.ts`, `lyrics.ts`.

Every function is a pure value transform, which is why the queue rules, the sort orders and the
LRC parser are directly unit-testable without a browser. `QueueState` is immutable: each
operation returns a new object, which both keeps the rules easy to reason about and gives React
a fresh identity to re-render on.

### `src/audio`
| Module | Responsibility |
|---|---|
| `audioEngine.ts` | One long-lived `<audio>` element; optional Web Audio EQ graph; rate, volume, seek |
| `mediaSession.ts` | Lock Screen / Control Center metadata and transport handlers |
| `sleepTimer.ts` | Deadline-based countdown that pauses playback |
| `settings.ts` | Preferences and the saved session, in `localStorage` |
| `playbackController.ts` | The brain: queue, engine, history, session restore |

### `src/library`
| Module | Responsibility |
|---|---|
| `db.ts` | IndexedDB schema and typed transactions |
| `metadata.ts` | ID3v2 / MP4 / FLAC / RIFF / AIFF tag parsing |
| `bytes.ts` | `ByteReader` and the text decoders the parsers read through |
| `probe.ts` | Decode check + authoritative duration, using the playback decoder |
| `fingerprint.ts` | SHA-256 over size + head + tail, for duplicate detection |
| `artwork.ts` | Object-URL cache with an LRU bound |
| `libraryStore.ts` | Single source of truth: IndexedDB for durability, memory for speed |
| `importService.ts` | Orchestrates the above into an `ImportSummary` |

### `src/ui`
`App.tsx` owns the five tabs and a navigation stack per tab. `screens/TrackListScreen.tsx` is the
one "list of songs" screen used by Library, Album, Artist, Folder, Genre, Favorites and every
smart list, so search, sorting, the play header and the action sheet behave identically
everywhere. `styles.css` holds every design token.

## Three iOS constraints that shaped the design

### 1. One `<audio>` element, parked in the DOM

Safari only lets `play()` run without a user gesture on an element that a gesture has already
started. Creating a fresh element per track would mean every track after the first needs its own
tap. So there is exactly one element, reused for the whole session, and it is appended to
`document.body` (hidden) because iOS ties its Now Playing handling to elements that are in the
document.

### 2. The equalizer and reliable background playback are mutually exclusive

`createMediaElementSource()` permanently reroutes the element's output through an `AudioContext`,
and **there is no way to undo it** for the lifetime of the page. iOS suspends an `AudioContext`
when the app goes to the background, which a plain media element survives.

So: the EQ graph is built **only when the listener first turns the equalizer on**, the equalizer
is off by default, and the EQ screen says plainly that enabling it weakens background playback
and that a reload restores the plain path. Turning the equalizer back off flattens every band
rather than pretending it can detach the graph.

### 3. Storage can be taken away

IndexedDB is the only place large audio can live, and Safari evicts it from sites that go unused.
`requestPersistentStorage()` runs at startup and Settings reports whether the grant succeeded;
installing to the Home Screen is what usually makes it succeed. The app says so rather than
quietly losing a library.

## Other decisions worth knowing

**Decode before import.** `probeAudio` loads every candidate file into a media element before
anything is written. A file that the browser cannot decode never reaches the library, so the
library cannot contain a track that silently fails. It also yields a true duration, which matters
for VBR MP3s whose headers lie.

**Position lives in its own store.** `ProgressStore` is separate from `PlaybackController`
because the position changes several times a second. If it were on the controller, every screen
observing the player — including a song list filtering thousands of tracks — would re-render on
each tick. Only the scrubber and the mini bar subscribe to it.

**Play counts are earned.** Half the track or 60 seconds, whichever comes first; ~90 % for
anything under 30 seconds. The accumulator only counts forward motion and clamps each sample, so
scrubbing cannot inflate a count.

**Session restore opens nothing.** A cold start reinstates the queue, the current track and the
Lock Screen metadata without touching the audio blob. The file is opened the moment the listener
presses play, so relaunching never grabs audio focus from whatever else they are listening to.

**Duplicates are caught inside one run too.** `ImportService` keeps a `seen` set alongside the
library's fingerprint index, because the library only learns about a track once it has been
written.

## Persistence

| Data | Where | Why |
|---|---|---|
| Audio blobs | IndexedDB `audio` store, keyed by track id | Only store that holds large binaries |
| Track metadata | IndexedDB `tracks`, indexed on fingerprint and date | Read in one transaction at startup |
| Artwork | IndexedDB `artwork`, keyed by album+artist hash | Shared by every track of an album |
| Playlists, play history | IndexedDB `playlists`, `events` | Queryable, survives reload |
| Settings, EQ presets, last queue | `localStorage` | Small scalars the audio layer needs synchronously, before the database opens |

## Service worker

Hand-written, ~90 lines. Navigation requests are network-first with the cached shell as fallback,
so a cold offline launch boots and a fresh deploy is picked up when online. `/assets/*` is
cache-first because Vite hashes those filenames. **The user's audio is never put in the HTTP
cache** — it belongs to IndexedDB.
