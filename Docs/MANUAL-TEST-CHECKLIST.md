# Manual device acceptance checklist

Everything below needs a **physical iPhone, in Safari, installed to the Home Screen**. None of it
has been performed by the author of this repository — verification so far was automated tests
plus a desktop Chrome session. Treat every row as unverified until you tick it yourself.

Why these cannot be automated: the Lock Screen, Control Center, phone calls, headphone jacks,
Bluetooth routing, app switching and storage eviction are not reachable from a test runner.

| # | Step | Expected | Pass? |
|---|---|---|---|
| 1 | Open the URL in Safari, Share → Add to Home Screen | Icon appears; launching it shows no Safari chrome | ☐ |
| 2 | Settings → Library → Storage protected | Says **Yes** after installing | ☐ |
| 3 | **+** → Import songs… → select several audio files | Progress banner runs; a summary toast reports the counts | ☐ |
| 4 | Import an MP3, an M4A, a WAV and a FLAC | All four import and play | ☐ |
| 5 | Import a file twice | Second attempt reports it as already in the library | ☐ |
| 6 | Import a non-audio file renamed `.mp3` | Counted as unsupported; nothing is stored | ☐ |
| 7 | Tap a song | Audio starts; mini player appears above the tab bar | ☐ |
| 8 | Let a track finish | The next track starts by itself | ☐ |
| 9 | **Lock the iPhone while playing** | Audio keeps playing | ☐ |
| 10 | Look at the Lock Screen | Title, artist, artwork and a moving scrubber | ☐ |
| 11 | Use Lock Screen play/pause, next, previous, scrub | Playback reacts; the app's UI matches when reopened | ☐ |
| 12 | Switch to another app | Audio continues | ☐ |
| 13 | Return to the app after several minutes in the background | Still playing, position correct | ☐ |
| 14 | Leave it backgrounded for 30+ minutes | **Expected to be unreliable** — see README; note what happens | ☐ |
| 15 | Squeeze/press headphone or Bluetooth transport buttons | Play/pause and skip work | ☐ |
| 16 | Unplug headphones mid-playback | Behaviour is Safari's, not the app's — note what happens | ☐ |
| 17 | Take a phone call, then end it | Note whether audio pauses and resumes | ☐ |
| 18 | Force-quit the app and reopen | Library, playlists, favorites intact; last queue restored, paused | ☐ |
| 19 | Press play after a cold start | Resumes the last track from where it stopped | ☐ |
| 20 | Enable Airplane Mode and use the app | Everything works; no network is needed | ☐ |
| 21 | Create a playlist, add songs, reorder, rename, delete it | All work; deleting the playlist keeps the songs | ☐ |
| 22 | Favorite a song from Now Playing and from the ⋯ menu | Appears under Favorites | ☐ |
| 23 | Queue → add to queue, play next, reorder, remove, clear | Up Next reflects every change; the current song keeps playing | ☐ |
| 24 | Settings → Equalizer → turn on → drag a band | The sound audibly changes while dragging | ☐ |
| 25 | With the EQ on, lock the screen | **Expect background playback to stop** — this is the documented trade-off | ☐ |
| 26 | Reload the app, leave the EQ off, lock the screen | Background playback works again | ☐ |
| 27 | Now Playing → ⋯ → Playback speed → 1.5× | Faster, pitch unchanged | ☐ |
| 28 | Now Playing → ⋯ → Sleep timer → 5 minutes | Pauses when the countdown ends, including from the background | ☐ |
| 29 | Settings → Theme → Light / Dark | The whole app switches immediately | ☐ |
| 30 | iOS Settings → Display → larger text | Text scales; no row is clipped | ☐ |
| 31 | Turn on VoiceOver and walk Now Playing | Every control is labelled and reachable | ☐ |
| 32 | Import ~500 songs | Progress is visible; the library scrolls smoothly afterwards | ☐ |
| 33 | Remove a song from the library | Gone from the app; nothing else on the phone is affected | ☐ |
| 34 | Rotate to landscape | Layout stays usable (it is portrait-first) | ☐ |

## Expected behaviours that are not bugs

- **Background playback can stop.** A web app is not a native audio app: iOS can suspend or
  reclaim it. Row 14 is the honest test of how far it goes on your device and iOS version.
- **The equalizer costs background playback** (rows 24–26). Documented in the README and in the
  EQ screen itself.
- **No folder import on iPhone.** Safari has no `webkitdirectory`.
- **No haptics.** Safari on iOS does not implement the Vibration API; the Settings toggle has no
  effect there.
- **No interruption handling.** The web has no equivalent of `AVAudioSession` interruption
  notifications, so what happens on a phone call is entirely Safari's behaviour.
