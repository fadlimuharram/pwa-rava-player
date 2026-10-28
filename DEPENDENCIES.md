# Dependencies

Runtime dependencies: **React and React DOM.** Nothing else ships to the browser.

Everything else this app needs — audio decoding, tag parsing, storage, hashing, the Lock Screen
integration, offline caching — is a browser API used directly. That is a deliberate choice: each
candidate library would have added weight and a maintenance burden without doing anything the
platform does not already do.

## Runtime

| Package | Why |
|---|---|
| `react`, `react-dom` | ~20 screens with shared state. A framework earns its place here; the alternative is hand-rolled DOM diffing. Pinned to React 19. |

## Browser APIs used instead of packages

| API | Used for | Why not a library |
|---|---|---|
| `HTMLAudioElement` | Playback, seeking, rate, volume | It is the only path that keeps playing when iOS backgrounds the app. Any player library wraps this same element. |
| **Web Audio** (`BiquadFilterNode`) | The 10-band equalizer | Real DSP in the signal chain. The trade-off it forces on iOS is documented in the README rather than hidden behind a wrapper. |
| **Media Session** | Lock Screen / Control Center metadata and transport controls | The web counterpart of `MPNowPlayingInfoCenter`. No polyfill exists or is needed. |
| **IndexedDB** | Audio blobs, track metadata, playlists, history | The only browser store that holds large binaries. `idb` / `dexie` would add 5–15 kB to wrap ~150 lines of transactions. |
| **File API** (`<input type="file">`, `Blob.slice`) | Import, partial reads for tag parsing and hashing | File System Access API does not exist on iOS Safari, so the plain input is the portable path. |
| **Web Crypto** (`crypto.subtle.digest`) | SHA-256 fingerprints for duplicate detection | Native, hardware-accelerated. A JS SHA-256 would be slower and larger. |
| **Cache Storage / Service Worker** | Offline app shell | Hand-written: 90 lines, versus Workbox's build pipeline and runtime. The caching rules here are simple enough to read in one sitting. |
| `Intl.Collator`, `Intl.RelativeTimeFormat`, `Intl.NumberFormat` | Natural-order sorting, relative dates | Built in and locale-aware. |

## Audio tag parsing — written, not installed

`src/library/metadata.ts` parses ID3v2.2/2.3/2.4, MP4/M4A atoms, FLAC (STREAMINFO, Vorbis
comments, embedded pictures), RIFF/WAVE and AIFF by hand.

`music-metadata` is the obvious alternative and is a good library, but it is ~200 kB minified and
pulls in Node stream shims for the browser build. The subset this app needs — about a dozen tags
and a cover image — is ~450 lines with 21 tests that run against synthetic containers built
byte-for-byte from the specs. That is a better trade than tripling the bundle.

## Development

| Package | Why |
|---|---|
| `vite`, `@vitejs/plugin-react` | Build and dev server |
| `typescript` | Strict mode, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| `vitest` | Test runner; shares Vite's transform pipeline so there is no second build config |
| `fake-indexeddb` | Lets the storage layer be tested in Node instead of only in a browser |
| `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint/js` | Type-aware linting (`strictTypeChecked`) |
| `prettier` | Formatting |
| `@types/node`, `@types/react`, `@types/react-dom` | Types only |

## Rejected

- **State libraries** (zustand, jotai, redux) — `src/util/store.ts` is 35 lines and feeds
  `useSyncExternalStore` directly. The stores must outlive React anyway, because playback does.
- **Routers** (react-router) — five tabs with a push/pop stack each; `src/ui/routes.ts` plus 40
  lines in `App.tsx` covers it, and a URL-driven router would fight the standalone display mode.
- **Icon packages** — `src/ui/components/Icon.tsx` holds the ~35 paths the app uses.
- **`vite-plugin-pwa` / Workbox** — see above.
- **Virtual-list libraries** — `content-visibility: auto` on list rows gets the same win in CSS.
