# Installing on an iPhone

No Xcode, no Apple ID, no signing, no 7-day expiry, no Developer Mode. The trade is that a PWA
cannot do everything a native app can — see **Limitations** in the README before you commit to
this route.

## 1. Serve it over HTTPS

Service workers, IndexedDB persistence and Media Session all require a **secure context**.
`http://localhost` counts as one; any other plain-HTTP origin does not, and the app will load but
refuse to install or go offline.

```bash
npm install
npm run build        # outputs dist/
```

`dist/` is a folder of static files. Any of these will do:

| Host | Command / step |
|---|---|
| Local test on the same Wi-Fi | `npm run preview -- --host` then open the printed `http://<your-ip>:4173` — **installs will not work**, it is not HTTPS |
| Netlify | `npx netlify deploy --dir=dist --prod` |
| Vercel | `npx vercel deploy dist --prod` |
| Cloudflare Pages | `npx wrangler pages deploy dist` |
| GitHub Pages | Push `dist/` to a `gh-pages` branch |
| Your own server | Copy `dist/` behind nginx/Caddy with TLS |

**Single requirement for any host:** unknown paths must fall back to `/index.html` (SPA routing).
Netlify, Vercel and Cloudflare Pages do this for a static SPA by default.

Do not set a long `Cache-Control` on `/index.html` or `/sw.js`; the hashed files under `/assets/`
can be cached forever.

## 2. Add it to the Home Screen

On the iPhone, in **Safari** (Chrome and Firefox on iOS cannot install web apps):

1. Open your URL.
2. Tap the **Share** button.
3. Scroll down, tap **Add to Home Screen**.
4. Tap **Add**.

It now has its own icon, launches without Safari's chrome, and keeps its own storage.

**Install it rather than using it in a tab.** An installed web app is what makes iOS likely to
grant persistent storage, which is what stops Safari evicting your library after a period of
disuse. Settings → Library shows whether the grant succeeded.

## 3. Add music

Tap **+** on Home or Library → **Import songs…** → pick files from Files, iCloud Drive or any
Files provider. You can select many at once.

Files are copied into the app's own storage. Your originals are never changed or deleted — so
after importing you can delete the originals from Files if you want the space back.

There is no folder import on iOS: Safari does not implement `webkitdirectory`. The folder picker
appears only on desktop browsers and Chrome on Android. On iPhone, select the files instead.

To get lyrics, select a `.lrc` file together with the audio file of the same name in the same
import.

## 4. Afterwards

Everything works offline. The app makes no network requests at all once loaded.

| Want to | Do this |
|---|---|
| Update to a newer deploy | Open the app while online; it picks up the new build on the next launch |
| Free up space | Settings → Remove all songs, or remove individual songs from the ⋯ menu |
| Check storage | Settings → Library |
| Move your library to another phone | Not supported — re-import there. Browser storage is per-device and per-origin. |

## Troubleshooting

| Symptom | Cause |
|---|---|
| No **Add to Home Screen** option | Not Safari, or the site is not HTTPS |
| Library empty after not opening it for weeks | Safari evicted the storage. Install to the Home Screen so persistence is granted. |
| A file will not import | Safari cannot decode it. Ogg Vorbis, Opus and WMA have no iOS decoder. |
| Audio stops when switching apps | See **Background playback** in the README — and check whether the equalizer is on. |
| Lock Screen shows nothing | Media Session needs iOS 15+. |
| Import of a big selection is slow | Every file is decode-checked and hashed before it is stored. The progress banner can be cancelled. |
