# Hardware acceptance protocol

This protocol covers the device checks that browser fixtures and Web Inspector automation cannot replace ([#27](https://github.com/JirakJ/kick-web-os-app/issues/27)). Each pass needs a physical LG TV, its owner and, for some steps, control of the router or TV settings. Nothing here has been run for 0.9.0 yet. Until a pass is recorded, the [device audit](production-audit.md) limits still apply.

## Before every pass

Record in `docs/validation/tv-<version>-hardware.json`:

- TV model, firmware version, webOS version and engine (for example `LG 55NANO863NA, 04.64.00, webOS 5.6.2, Chromium 68`).
- The exact IPK file name and SHA-256 from the release `SHA256SUMS`. If anything other than a release build was installed, also record the hashes of the installed `app/` and `service/` payloads.
- Input method for every step: physical directional remote (model), Magic Remote (model), USB keyboard, or Web Inspector events. Web Inspector or evdev injection does not count as a physical-handset result.
- Source used: channel, live or replay, video ID and the rendition label shown in the app.
- Native measurements where available: decoder resolution/FPS, audio track state and the number of app media pipelines.
- Limitations: anything skipped, changed or uncertain.

Do not change TV-wide settings (Voice Guide, screensaver, network) without the owner's consent, and restore them afterwards. Keep the previous IPK available for rollback.

## A. Physical remotes

Do this once with a directional remote and once with a Magic Remote (pointer and wheel).

| Step | Pass criterion |
| --- | --- |
| Home: move through the channel field, Play live, Replays, Search Kick, Find saved channels, all three shelves, paging and footer | Every control gets a visible focus outline; nothing is skipped or trapped |
| Search Kick: open, type with the on-screen keyboard, confirm with OK/Enter | The query is sent once; focus stays in the field while results arrive |
| Search Kick: press Back while the on-screen keyboard is open | Only the keyboard closes; the dialog stays open with its text |
| Search Kick: press Back again | The dialog closes and focus returns to **Search Kick** |
| Search Kick: move into results, page with ← Previous / Next →, select a channel | The catalog of that channel opens; live channels offer **Play live** |
| Search Kick: change the query while a search is running | The old result never replaces the new one |
| Find saved channels, replay search/filter, Go to time, quality, favorite reorder, resume choice, accessibility | Each dialog takes focus, wraps directional focus and closes with Back |
| Go to time: enter digits with the number keys and the on-screen keyboard | The preview follows the input; Confirm seeks; Back cancels |
| Player: OK, ←/→ seek, Play, Pause and Play/Pause media keys | Matching action; controls reappear |
| Player: rewind/fast-forward keys | The ±10-minute Go to time preview opens |
| Home button during playback, then return to the app | The decoder is released; **Resume** continues from the same position |
| Magic Remote: point and click every button above, scroll lists with the wheel | Same results as the directional remote |

## B. Wi-Fi and router interruption

The owner controls the router or the TV network settings.

| Step | Pass criterion |
| --- | --- |
| During live playback, disconnect the TV from Wi-Fi for 30–60 s, then reconnect | Bounded reconnect (at most two attempts), then playback resumes or **Reconnect** is offered |
| Repeat during replay playback | Same, and the replay position is kept |
| Pause, disconnect and reconnect | Playback stays paused until Play is pressed |
| Disconnect and reconnect three times within one minute (flapping) | No more than the documented attempts; no duplicate video element |
| Disconnect, then leave the player (Back) or hide the app (Home) | Pending recovery is cancelled; no media pipeline is left |
| Restart the router while the home screen shows LIVE badges | Status lookups stop while offline and resume afterwards |

## C. Expired signed media URLs

Open a replay, pause it for longer than the signature lifetime (leave the player paused for several hours, or overnight), then press Play. Pass: the app fetches a fresh source and continues from the saved position without showing a media error. Record the time paused and the observed source refresh.

## D. Voice Guide

Only with the owner switching Voice Guide on and restoring the previous state afterwards.

| Step | Pass criterion |
| --- | --- |
| Move through home, Search Kick results, catalog cards and player controls | Names, LIVE/offline/verified status and page numbers are spoken |
| Trigger a search with no result and an offline error | The status text is announced |
| Play live and a replay; listen with Voice Guide off | Audible sound on both; note the audio track reported by the TV |

## E. Multi-hour playback soak

1. Install the release IPK and start a live stream or long replay.
2. Open the app's Web Inspector, paste [`tv-soak.cjs`](../tv-soak.cjs) and run `var soak = startSoak({ minutes: 180, intervalSeconds: 60 });`.
3. Leave the TV playing. Do not interact unless the protocol says so.
4. At the end, press the Web Inspector garbage collection button, then run `soak.sample()` once more and record `soak.summary()` and `JSON.stringify(soak.samples())`.
5. Record the native app pipeline count and decoder memory from the TV's own tools separately; the page cannot see them.

Pass: `summary().problems` is empty, at most one video element was present throughout, heap and DOM counts return to the start range after GC, and the TV still reports one app pipeline. Repeat once with a 30–60 s Wi-Fi interruption in the middle (section B).

`npm test` runs `test-soak.cjs`, which checks the sampler itself with a simulated three-hour run. That validates the tool, not native playback.

## F. Higher resolutions and older engines

- Play a source whose master playlist really offers 1440p or 2160p on a 4K TV. Record the decoder resolution reported by the TV, not the quality label in the app.
- Install on a pre-Grid engine (webOS 3.x, Chromium 38) and repeat the home, catalog, search and player navigation checks. A narrowed viewport in a modern browser is not evidence for this.

## What is already automated

- `npm test`: service and UI regressions, including Kick search cancellation, stale replies and keyboard-aware Back, and the soak sampler.
- `npm run test:browser`: geometry and focus across 13 locales, two viewports and four size/contrast modes, plus the layout-checker regressions from [#28](https://github.com/JirakJ/kick-web-os-app/issues/28).
- CI runs the ES5 service suite on Node.js 0.12.2 and 8.12.0.

None of these decode real media, use a physical remote or produce speech.
