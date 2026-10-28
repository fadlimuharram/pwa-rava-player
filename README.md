# Rava Music — PWA

An offline, local-file music player that installs to the iPhone Home Screen from Safari. No
account, no backend, no ads, no App Store, no Xcode, no signing, no 7-day expiry.

TypeScript + React 19 + Vite. **React and React DOM are the only runtime dependencies** —
audio, tag parsing, storage, hashing, Lock Screen integration and offline caching are all
browser APIs used directly.

This is a port of the native Swift app in `../../iphone/RavaMusicPlayer`. Most of it carries over
intact. Some of it cannot, and the parts that cannot are listed below rather than glossed over.

---

## What you gain and what you give up versus the native app

| | Native (Swift) | This PWA |
|---|---|---|
| Install | Xcode + Apple ID, re-sign every 7 days | Share → Add to Home Screen |
| Developer Mode | Required | Not required |
| Share with others | TestFlight/Ad Hoc, $99/yr | Send them the URL |
| Background audio | Reliable, OS-guaranteed | Works, but iOS can suspend a web app — see below |
| Lock Screen controls | Full | Full (Media Session) |
| Folder import | Yes, recursive | **No on iOS** — multi-file select only |
| Play from original location | Yes (security-scoped bookmarks) | **No** — files are copied into app storage |
| Equalizer | Real, always on | Real, but costs background playback on iOS |
| Storage safety | Permanent | Browser may evict if the app is not installed |
| Headphone-unplug / call handling | Explicit | Whatever Safari does |
| Formats | Core Audio set | The same set, minus anything Safari cannot decode |

Pick the PWA if you want it on your phone today, on more than one phone, without touching Xcode.
Pick the native app if uninterrupted lock-screen playback is non-negotiable.

---

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static files in dist/
npm run preview   # serve the production build
npm test          # 113 tests
npm run lint
```

Deploying it and installing it on an iPhone:
[`Docs/IOS-INSTALL.md`](Docs/IOS-INSTALL.md). HTTPS is required for anything except `localhost`.

---

## What is implemented

**Import.** Multi-file picker; folder picker where the browser actually supports it. Every file
is decode-checked by the browser before it is stored, so the library cannot contain a track that
silently fails. Duplicate detection by content hash (SHA-256 over size + head + tail), catching
the same file under a different name and the same file twice inside one selection. Live progress
with a Cancel button and a summary of imported / duplicate / unsupported / failed. `.lrc` files
selected alongside a song become its lyrics.

**Formats.** Whatever the browser decodes — on iOS that is MP3, AAC/M4A, ALAC, WAV, AIFF, CAF and
FLAC. Ogg Vorbis, Opus and WMA are deliberately excluded: Safari has no decoder, so offering them
would only produce failures.

**Tags.** ID3v2.2/2.3/2.4, MP4/M4A atoms, FLAC Vorbis comments, RIFF/WAVE `LIST INFO` and AIFF —
title, artist, album, album artist, genre, composer, year, track and disc number, embedded
artwork, embedded lyrics. Falls back to the filename, splitting `Artist - Title`. Unlike the
native app, **FLAC tags read properly here**, because the parser is ours rather than
AVFoundation's.

**Library.** All Songs · Artists · Albums · Genres · Folders · Favorites · Recently Added ·
Recently Played · Most Played · Never Played · per-format lists. Search across title, artist,
album and filename. Nine sort orders. Artwork cached once per album and handed out as object URLs
behind an LRU.

**Playback.** Play/pause · next · previous (restarts if more than 3 s in) · scrubbing · ±15 s
skip · in-app volume · shuffle · repeat off/all/one · play next · add to queue · remove · reorder
· clear up next · play album/artist/playlist/folder · continuous playback · resume where you left
off · per-track remembered position. A track that fails to load is reported once and skipped
rather than stopping the queue.

**Lock Screen.** Title, artist, artwork, position, play/pause, next, previous, seek and ±15 s,
through the Media Session API.

**Playlists, favorites, history.** Create, rename, delete (never deleting songs), add, remove,
reorder, multi-select add, a song in many playlists. Smart playlists driven by real local data.
Play counts that have to be earned: half the track or 60 seconds, whichever comes first.
Clearable history and a statistics screen.

**Extras.** 10-band equalizer with 10 presets and savable custom curves (real `BiquadFilterNode`
DSP). Playback speed 0.5×–2× with pitch preserved. Sleep timer with presets, a custom duration
and an end-of-track option. Lyrics viewer with LRC line highlighting and tap-to-seek.

**Interface.** Five tabs, persistent mini player, full-screen Now Playing, light/dark themes,
safe-area insets, reduced-motion support, labelled controls throughout.

**Offline.** A service worker caches the app shell. After the first load the app makes no network
requests at all. Your audio is never put in the HTTP cache — it lives in IndexedDB.

---

## Limitations — read this part

### Background playback is best-effort

Audio keeps playing when you switch apps or lock the screen, and the Lock Screen controls work.
But a web app is not a native audio app: **iOS can suspend or reclaim it**, and when it does,
playback stops. In practice short backgrounding is fine and long backgrounding is a gamble that
depends on your iOS version, memory pressure and whether the app is installed to the Home Screen.

There is no way to fix this from inside a PWA. If background playback must be guaranteed, the
native app is the only answer.

### The equalizer and background playback cannot both be reliable

Turning the EQ on routes audio through an `AudioContext`, which iOS suspends in the background;
a plain media element survives it. Worse, `createMediaElementSource()` **cannot be undone** for
the lifetime of the page.

So the equalizer is **off by default**, the EQ screen states the trade-off, and turning it back
off flattens the bands rather than pretending to detach the graph. Reload the app to get the
plain audio path back.

### No folder import on iPhone

Safari does not implement `webkitdirectory`. The folder button only appears on desktop browsers
and Chrome on Android — showing it on iOS would be a dead control. On iPhone you select files
(many at once) instead. The Folders screen therefore only shows structure for libraries imported
on a device that supports it.

### Files are copied, never referenced

The native app can play a file in place through a security-scoped bookmark. The web has no
equivalent on iOS, so every imported file is copied into IndexedDB. Your originals are untouched
— but until you delete them you are using the space twice.

### Storage can be evicted

Safari clears IndexedDB for sites that go unused. The app requests persistent storage at startup
and Settings → Library reports whether the grant succeeded. **Installing to the Home Screen is
what usually makes it succeed.** Used in a plain tab, assume the library is temporary.

### Also not available

| | Why |
|---|---|
| Haptics | Safari on iOS has no Vibration API. The Settings toggle has no effect there. |
| Interruption handling (calls, Siri, headphone unplug) | The web has no `AVAudioSession` equivalent; the behaviour is Safari's. |
| AirPlay / Bluetooth route control | Not exposed to web apps. |
| Gapless playback, crossfade | Would need Web Audio scheduling, which costs background playback (see above). |
| ReplayGain, waveforms | Would need a full decode pass per track. |
| Live Activities / Dynamic Island | Native-only. |
| Importing from other apps' share sheets | iOS does not route share targets to web apps. |
| Syncing a library between devices | Browser storage is per-device and per-origin. Re-import. |

---

## Test results — reported honestly

```
npm test        # 113 tests, all passing
npm run lint    # clean
npm run build   # clean; 324 kB JS (97 kB gzipped) + 12 kB CSS
```

`tsc` runs in strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`;
ESLint runs `strictTypeChecked` with type information.

| Area | Tests | What they cover |
|---|---|---|
| Queue | 25 | Repeat off/all/one, repeat-one looping only on an automatic advance, shuffle keeping the current song playing, un-shuffle restoring order and position, deterministic shuffle under a seeded RNG, removal/move/clear index bookkeeping, duplicate tracks getting distinct entry identities |
| Tag parsing | 21 | ID3v2 text frames, all four text encodings, synchsafe sizes, numeric genre references, APIC pictures, USLT lyrics past the language code, truncated-tag safety; FLAC Vorbis comments + STREAMINFO duration; MP4 ilst atoms + `mvhd` duration; WAV `LIST INFO` + duration; format dispatch; filename fallback. Built against synthetic containers assembled byte-for-byte from the specs. |
| Library logic | 36 | Natural-order sorting, stability, search, album/artist/genre grouping, folder tree, play-count rule, formatters, LRC parsing, EQ preset normalisation |
| Storage | 31 | IndexedDB round-trips, favorites and playlists surviving a reload, play history, deleting a track clearing its blob + history + playlist membership, artwork pruning and key derivation, content fingerprints (including files differing only in the last byte), settings persistence and corrupt-JSON recovery |

**Verified by hand in desktop Chrome, driving the production build:**

- Imported three real files (two WAV, one AAC/M4A) through the actual file input — all three
  imported, with the `Artist - Title` filename fallback applied correctly.
- Shuffle-all started playback; the progress bar advanced; the queue **auto-advanced** from one
  track to the next with no intervention.
- Media Session reported `playbackState: "playing"` with the right track title.
- Mini player, full Now Playing, Settings and Equalizer screens rendered and were operable.
- Reloading restored the previous session — right track, paused, **not** auto-playing.
- **The equalizer is real DSP.** With the `AudioContext` constructor instrumented, enabling the
  EQ produced exactly `1` AudioContext, `1` `createMediaElementSource` and **`10`
  `createBiquadFilter`** calls — one filter per band, wired into the element's output.
- Service worker activated; app shell cached (6 URLs); assets cache created; `rava-music`
  IndexedDB present; the `<audio>` element confirmed present in the DOM.
- **Offline verified for real:** the preview server was killed, then the page was reloaded. The
  app booted from the service-worker cache with the full library and restored session, and
  pressing play produced audio — `paused: false`, `currentTime: 2.99 / 6.00`, source a `blob:`
  URL out of IndexedDB — while a probe fetch to the origin failed. No network involved.
- Console clean apart from the expected "storage is not marked persistent" warning.

**Not verified.** Everything in
[`Docs/MANUAL-TEST-CHECKLIST.md`](Docs/MANUAL-TEST-CHECKLIST.md) — that is, every iOS-specific
behaviour: Home Screen install, background playback with the screen locked, Lock Screen controls,
storage persistence, headphone and Bluetooth behaviour, VoiceOver and Dynamic Type. A desktop
Chrome session cannot stand in for any of it, and **no claim is made that any of those steps has
passed on a device.**

---

## Project layout

```
RavaMusicPWA/
├── index.html
├── public/
│   ├── manifest.webmanifest      Installability, icons, standalone display
│   ├── sw.js                     Hand-written service worker (~90 lines)
│   └── icons/
├── src/
│   ├── app/                      Service container + React provider
│   ├── models/                   Pure logic: queue, sorting, search, rules, lyrics
│   ├── audio/                    Engine, Media Session, sleep timer, settings, controller
│   ├── library/                  IndexedDB, tag parsers, probe, fingerprint, artwork, import
│   ├── ui/                       Screens, components, design tokens
│   └── util/                     Store base, formatters, logging
├── tests/                        113 tests (vitest + fake-indexeddb)
└── Docs/                         Architecture, iOS install, manual checklist
```

Design notes — why one `<audio>` element, why the EQ graph is lazy, why position lives in its own
store — are in [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md). Every dependency and every
rejected library is justified in [`DEPENDENCIES.md`](DEPENDENCIES.md).

There is no `.env.example`: the app has no environment variables, because it has no backend.

## Privacy

No account, no analytics, no ads, no telemetry. The app makes no network requests after the first
load. Your audio never leaves the device. Logging records counts and error messages only — never
a filename, a track title or a path.

## Licence

No licence chosen. Add one before distributing.
