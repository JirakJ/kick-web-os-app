# Home UI acceptance for 0.8.1

Checked on 18 October 2026 on the same LG 55NANO863NA / webOS 5.6.2 /
Chromium 68 device. The local candidate IPK SHA256 is
`ee3b309817a5394701a56aaa29455943b0f91b3c7dde303b7a76592b0be4219f`;
all 27 installed app/service payload files matched. CI builds the release package
from the reviewed source; its archive will receive a separate SHA256SUMS after
every main CI job succeeds.

The home header/footer now stay outside the scrollable channel shelves. Version,
About and updates and Accessibility remained visible before/after scrolling and
returning from dialogs. Hearts beside the channel input, each recent channel and
the catalog title add/remove that channel. Seven favorites, unchanged entered
channel/history/recents on row toggles, pressed/accessible labels and directional
heart-column navigation passed. The original three owner storage keys survived
upgrade exactly. After acceptance, the original six recents and twelve history
entries were restored exactly and test-only preferences removed.

The first review found a focus outline clipped by the new scroll boundary.
Failing native/browser reproductions now pass with a focus gutter; a bounded,
cancelled callback handles old TV scrolling without retaining retired controls.
Independent review covered 32 controls and timer cancellation. Eleven native
checkpoints included eight 720p/1080p text/contrast combinations; 720p uses a Web
Inspector viewport override. All 1,144 browser screens across 13 locales passed.

A real replay smoke test decoded at 1920×1080/60 with active unmuted audio and
one native pipeline. Returning home released the decoder. Repeated heart toggles
and About returns retained 579 DOM nodes and 97 listeners at settled samples;
no video nodes remained. This is bounded regression coverage, not a multi-hour
leak guarantee. The longer player/network acceptance below remains applicable;
player and service runtime code did not change in 0.8.1.

[Candidate measurements and payload hashes](validation/tv-0.8.1.json) bind this
acceptance to the tested files. Local evidence is under
`artifacts/tv-0.8.1-20261018/`; owner storage backups are not published. Navigation
used Web Inspector input rather than a physical handset. The physical/audio,
Voice Guide, pre-Grid and long-soak limits below still apply. v0.8.0 remains
available for rollback.

---

# TV acceptance for 0.8.0

Checked on 18 October 2026 on LG 55NANO863NA, firmware 04.64.00 / webOS 5.6.2,
Chromium 68 and service Node.js 8.12.0. The owner authorized this device session
after implementation was complete. The accepted code is
`2bc60b3cd192dbe22f9dc580aba8eb3cec30bf58`; all four jobs in
[main CI 39117493975](https://github.com/JirakJ/kick-web-os-app/actions/runs/39117493975)
passed. Its IPK SHA256 is
`889f37a87f567041234991c88a1a948ec3cfb400e5b02c92f164946c28dc4e1a`.
All 27 installed app/service files matched the IPK. Release publication uses the
existing CI-gated workflow; release documentation changes no runtime payload.
The public package has its own SHA256SUMS.

| Feature | Native observation |
| --- | --- |
| Continue/resume | Actual process restart retained history; resume, start over, history removal, six-row pages, natural replay completion and starting a completed replay over passed. |
| Favorites | Seven saved channels, cross-page reorder, Save/Back cancellation and restart persistence passed. LIVE, offline and unknown states were observed. |
| Quality | Public live and replay streams decoded at 1920×1080/60 fps; fixed 720p decoded at 1280×720/60 fps. Auto/fixed changes kept one pipeline at sampled checkpoints and an active unmuted audio track. |
| Reconnect | A 55-second actual TV-only internet routing outage exhausted bounded retries. The original route table was restored exactly; paused reconnect retained position and required explicit Play. The router and other devices were unchanged. |
| Search | Saved-channel and replay-title queries, empty results, reset/order/filter cancellation, TV native IME text entry and directional focus passed. Search remains limited to loaded public data. |
| Go to time | Preview/cancel/confirm at 2:03:04, fast-key previews and pause/play transport inside the dialog passed. |
| About/updates | Actual official stable-release metadata, offline saved-result copy, process-persistent cache and same-ID upgrades passed. It provides manual installation guidance. |
| Accessibility | App text/contrast persisted/reset. Eight native-browser size/contrast/viewport combinations passed layout and matching 2/3-column directional navigation. 720p used a Web Inspector viewport override; physical output remained 1920×1080. |

Device testing found a defect missed by the original fixtures: webOS can load a
positive native `playTime` while reporting an initial zero HTML media clock in
pause. That reset app position, so a second quality change started at zero.
[PR 25](https://github.com/JirakJ/kick-web-os-app/pull/25) adds a failing-before,
passing-after regression and preserves the native start until the media clock
acknowledges it. Explicit seek-to-zero remains authoritative. Independent review,
all local tests, all 1,144 browser screens and PR/main CI passed. Native retesting
kept 2:03:04 through fixed 720p, Auto and paused reconnect, then continued from the
correct position. Offline Pause while Go to time was open prevented automatic
restart; leaving pending recovery left no decoder. Offline/online event cases
used Web Inspector network emulation, separately from the real routing outage.

| Bounded native stress after forced GC | Observation |
| --- | --- |
| Warm catalog, 50 pagination cycles, then three batches of five playback returns | 665 DOM nodes and 117 listeners at every settled catalog sample |
| JS heap after playback batches 5/10/15 | 2,229,188 bytes at each sample |
| Home after 16 total start/return cycles | 601 nodes, 105 listeners, zero videos/thumbnails and no active app media pipeline |
| Installed minified service on the TV's Node.js 8.12.0 | Legacy and actual-socket resource suites passed |

[Recorded measurements and provenance](validation/tv-0.8.0.json) retain these
observations, CI/source/package binding and local evidence hashes. Screenshots,
raw native pipeline data, pre-upgrade storage backups and test logs are retained
locally under `artifacts/tv-0.8.0-20261018/`; the backups are not published.

Limits: navigation was automated through Web Inspector key/pointer events and
native IME text entry; no physical handset was used. Voice Guide is off and TV-wide
settings were unchanged, so spoken accessibility output is unverified. Native
audio was active/unmuted; audible output was not independently checked. Physical
Wi-Fi association loss/router reboot, naturally expired signed sources,
multi-hour soak and actual 4K/1440p decoding remain unverified. Deleted/private
items, denied storage, malformed metadata and rate-limit extremes have controlled
regressions; those fixtures are not native fault-injection evidence. The 13-locale
browser matrix also uses media/Luna fixtures. An actual pre-Grid engine remains
untested. The older Chromium geometry check counts an 8px collapsed trailing
quality-list margin as scroll overflow; that case was excluded only after every
painted button fit its container and the native screenshot was checked.
Stable v0.7.5 IPK/checksums were retained for rollback; no downgrade was needed.

---

# Playback performance and memory audit for 0.7.5

Checked on 18 October 2026 using the packaged app on LG 55NANO863NA,
firmware 04.64.00 / webOS 5.6.2 (Chromium 68, service Node.js 8.12.0).
The installed app/service matched all 27 files in the candidate IPK.

Native stress exposed a teardown defect: each rapid replay start/return retained
88 DOM nodes and 11 event listeners. Heap retaining paths placed detached videos
under the browser's native pending activities. Removing listeners and a stale
`play()` promise capture fixed those references but did not stop native-node
growth. Detaching the video before the final empty-source `load()` reset stopped
the observed growth; this order is now covered for stop, suspension and recovery.
The precise internal LG engine flag responsible remains unconfirmed.

| Check | Observed result |
| --- | --- |
| Fresh-process native replay stress: one warm-up plus three batches of five starts/returns | 334 DOM nodes and 43 listeners at every settled catalog sample after forced GC |
| 50 next/previous pagination cycles | Same 334 nodes and 43 listeners |
| Return home after stress | 270 nodes, 31 listeners, zero videos and replay thumbnails; no active media pipeline |
| JS heap after pagination versus final playback batch | 1,983,680 to 1,996,520 bytes; warm-up allocations are excluded from this comparison |
| Unresolved native Promise regression | A retired video can be collected while the promise and player remain alive |
| Simulated minute with 240 progress events | Watchdog allocations reduced from 240 to 3; last-progress +20-second stall detection retained |
| Actual socket integration across 25 CDN origins | At most two idle sockets globally; same-origin requests reuse their connection |
| Installed minified service integration on the TV's Node.js 8.12.0 | Legacy and resource suites passed |

New seek regressions preserve a target entered during recovery/suspension and
prevent an obsolete debounce from committing later input early. The watchdog
uses a monotonic clock where available, so wall-clock corrections do not extend
its deadline. Returning home drops unused catalog cards and thumbnail references.

The full regression suite includes failing-before/passing-after cases. CI runs
actual Node.js 0.12.2 and 8.12.0 integration jobs, npm audit, package creation and
a pinned, checksum-verified Gitleaks full-history scan with redacted output.
Publication requires every main-branch CI job to succeed. OSV and Semgrep also
passed locally. The build-dependency fixes below are included; 0.7.4 was tested
as a local candidate but was not published.

Native evidence is retained locally under
`artifacts/performance-0.7.5-20261018/`. Heap snapshots were processed in memory;
only sanitized retaining paths were saved. No cookies, signed media URLs or
viewing history are published here. Bounded stress and forced-GC observations
are not proof against every firmware or decoder leak. Audible sound, multi-hour
playback, actual 4K decoding and webOS 3.5 hardware remain unverified.

---

# Build dependency and TV audit for 0.7.4

Checked on 18 October 2026. The build dependency lockfile now uses
`brace-expansion` 1.1.21 / 5.0.12, `proxy-addr` 2.0.8 and documented,
checksum-pinned [local security backports](../vendor/security/README.md) of
`braces` and `sprintf-js`. Both backports reproduce byte for byte from pinned
public sources. Their original licenses remain in the archives; neither is
represented as an official upstream release.

The installed-dependency regressions reproduced the proxy trust mismatch and
sprintf precision exception before the fixes, then passed after a clean npm 12
installation. They exercise both minimatch generations, bounded parsing and AST
traversal, the sprintf source and minified bundle, and asynchronous hostile
precision inputs under Node's default exception policy. OSV scanned 229 resolved
lockfile packages with no findings; npm audit also reported zero vulnerabilities.

On LG 55NANO863NA, firmware 04.64.00 / webOS 5.6.2:

- The installed 0.7.4 app and service matched all 27 payload files in the IPK.
- The Czech UI and the home, catalog and paused-player geometry checks passed.
- Real live and replay playback advanced without a media error. Native pipeline
  telemetry reported 1920 x 1080 at 60 fps, one active decoder and an unmuted
  audio track.
- Pause held the current position; seeking to 600 seconds while paused and five
  rapid right-arrow inputs reached 650 seconds while remaining paused.
- Play resumed, controls hid automatically, Back returned to the catalog and
  released the decoder. Three-column arrow navigation and replay pagination
  passed on the TV's own browser.
- The service integration script passed on the TV's actual Node.js 8.12.0 with
  the installed minified app/service files. Its loopback transport checks remain
  distinct from the successful real Kick playback checks.
- A one-time transfer preserved the owner's existing channels and replay
  history across the old/new application identity. This is device maintenance,
  not an automatic app migration feature.

Screenshots and detailed native observations are retained locally under
`artifacts/tv-release-0.7.4-20261018/`. No cookies, signed media URLs or viewing
history are included in this public audit. Audible sound, multi-hour playback,
actual 4K decoding, network outages and webOS 3.5 hardware were not verified.

---

# Legacy runtime compatibility audit for 0.7.1

Checked locally on 18 October 2026 (Europe/Prague). Fixes Claire's report in
[issue #2](https://github.com/JirakJ/kick-web-os-app/issues/2).

- Confirmed the 0.7.0 service uses `Array.from` during channel/replay title
  processing and `require('url').URL` during playlist preparation; both are
  absent in the reported Node.js 0.12.2 runtime.
- Removed both dependencies. Titles use an ES5 surrogate-pair-aware loop,
  with NFKC normalization only when available. The UI uses the same counting
  strategy, because webOS 3's Chromium 38 also lacks `Array.from`.
- Playlist origins pass the existing exact HTTPS allowlist before host/path
  splitting. `encodeURI` escapes unsafe request characters while preserving
  existing percent escapes, including signed query values. Invalid surrogate
  sequences return `bad_url` before opening a connection. Redirects remain
  disabled and TLS verification remains enabled.
- Native Node.js 0.12.2 integration checks exposed stale pooled sockets after
  aborted compressed transfers. The one permitted connection-reset retry now
  bypasses the pool (`agent: false`) to guarantee a fresh connection.
- Added a flexbox replay layout for engines without CSS Grid; it retains the
  existing 3/2/1-column keyboard navigation breakpoints. This fallback has been
  reviewed in source but still needs a visual check on the old TV engine.

| Local check | Result |
| --- | --- |
| `npm test` on Node.js 24.19.0 | Passed UI, history, i18n, service and integration regressions |
| `node test-service-legacy.js` on actual Node.js 0.12.2 | Passed |
| Same script on actual Node.js 8.12.0 | Passed |
| JavaScript syntax compilation on Node.js 0.12.2 | Passed service and all three app scripts |
| `npm run package` with official webOS CLI 3.2.6 | Built 0.7.1 IPK |
| `git diff --check` | Passed |

The ES5 integration test uses built-in modules, real loopback HTTP streams,
gzip, and a Luna registration stub. It covers channel data, public replays,
status lookup, HLS metadata, signed URL escaping, emoji truncation, optional
normalization, host rejection, decoded-size limits, malformed gzip/JSON,
HTTP errors, interrupted transfers, and recovery after failures. The existing
UI suite runs with `Array.from` removed from its isolated browser context.
CI adds actual Node.js 0.12.2 and 8.12.0 jobs without build dependencies.

No LG UJ6307 was available. Developer Mode installation, live Kick HTTPS/TLS,
native media playback, seeking and old-engine visual layout remain unverified
on webOS 3.5. Local build used npm 11.9.0 with the engine requirement relaxed
for dependency installation; CI retains the project's npm 12.0.2 setup.
Security scanner results below are historical, not rerun for this patch.

---

# Production audit for 0.7.0

Checked on 12 September 2026 using local regression tests and the packaged IPK.
The LG 55NANO863NA was powered off or unreachable during this release, so the
device-level checks below refer to 0.6.0; the 0.7.0 changes were not yet run on
the TV.

## Security

| Check | Scope | Result |
| --- | --- | --- |
| OSV Scanner | 229 resolved lockfile packages, including build dependencies | No known vulnerabilities reported |
| npm audit | Current lockfile, including build dependencies | No known vulnerabilities reported |
| Gitleaks | Five commits in repository history and the working tree | No secrets reported |
| Semgrep | `p/javascript` and `p/nodejs` rule packs over all four application/service JS files | No findings; all files parsed |

Manual review of the changes:

- Interface strings come from a bundled dictionary and are written with
  `textContent` or attribute setters; no translation is ever used as HTML.
  Placeholders accept only alphabetic names and substitute plain text.
- Service errors now carry a stable code. The app translates a code only if it
  is a known dictionary key; parameters are limited to four short strings or
  finite numbers, and free-text fallbacks are cut to 200 code points.
- Gzip responses are piped into the inflater with stream backpressure and
  rejected once the decoded text exceeds 1 MiB, so a compressed bomb cannot
  exceed the existing memory bound. Unsupported content encodings are rejected
  before any data is read, and the inflater is destroyed on every completion
  path. A pull-request review found that the first draft called `close()` from
  inside the inflater's own data callback, which crashes the TV's Node 8.12
  runtime; the fix was confirmed on a real Node 8.12.0 binary, where the draft
  died with `TypeError: Cannot read property 'write' of null` and the shipped
  code completes oversized, malformed, compressed and plain transfers.
- The keep-alive agent uses the same TLS verification as before; no host is
  caller-supplied and redirects remain disabled. A request that fails with a
  connection reset before any response, which a server-closed idle socket can
  cause on Node 8, is retried once on a fresh connection.
- The playlist host and path come from the WHATWG `URL` parser after the
  allowlist check, replacing the deprecated `url.parse` while still
  percent-encoding unsafe path characters without double-encoding.
- Exceptions that are not deliberate service failures map to a fixed `internal`
  code instead of forwarding engine text, and an internal replay-list failure
  is distinguished from any object Kick could return by a private marker.
- Static labels declare their dictionary key in markup (`data-i18n`,
  `data-i18n-attr`); the test suite checks that every key exists and that the
  English defaults in `index.html` match the dictionary.
- The locale is read only from `webOSSystem.locale`, `PalmSystem.locale` and the
  browser language, each guarded, with values longer than 35 characters ignored.

## Performance changes

| Change | Effect |
| --- | --- |
| `Accept-Encoding: gzip` for Kick responses | Channel document 8.8 KB → 2.4 KB, 30-replay list 64 KB → 7.5 KB on the wire (measured against `kick.com` on 12 September 2026 for one channel) |
| Keep-alive HTTPS agent (six sockets, two idle) | Status polling and channel/replay lookups reuse TLS sessions instead of a handshake per request; one retry covers a socket the server already closed |
| Title symbol expression compiled once | The emoji-isolating regular expression is no longer rebuilt for every catalog card or player title |
| Thumbnails decoded asynchronously | `img.decoding = 'async'` keeps thumbnail decoding off the main thread where the TV browser supports it |

The regression suite keeps the earlier rendering budgets (six thumbnails per
catalog load, at most 60 timeline text writes per simulated minute, no pause
label writes during steady playback).

## Localization checks

`npm test` verifies that all 13 languages define every key with identical
placeholders and no markup, that `app/resources/<language>/appinfo.json` matches
the dictionary titles, that locale tags such as `cs-CZ`, `sk_SK`, `pt-BR` and
`zh-Hans-CN` map correctly, that unsupported or missing locales fall back to
English, and that English, Slovak and French interfaces render expected strings
including translated service errors and player statuses. Launcher title
resources follow LG's documented `resources/<locale>/appinfo.json` layout but
were not confirmed on the TV.

---

# Production audit for 0.6.0 (device-verified)

Checked on 12 September 2026 using local regression tests and the powered-on
LG 55NANO863NA (firmware 04.64.00, webOS 5.6.2, Chrome 68).

## Security

| Check | Scope | Result |
| --- | --- | --- |
| OSV Scanner 2.4.0 | 229 resolved lockfile packages, including build dependencies | No known vulnerabilities reported |
| npm audit | Current lockfile, including build dependencies | No known vulnerabilities reported |
| Gitleaks | Four commits in repository history | No secrets reported |
| Semgrep | 68 JavaScript/Node rules over all three application/service JS files | No findings; all lines parsed |

Manual review found a resource handling weakness in the service: HTTP failures
released the logical request slot while their response bodies could continue
downloading. Failed requests now abort their underlying connection, including
response errors, oversized bodies and timeouts. Oversized chunks are rejected
before being appended to the response buffer. Regression checks assert connection
cleanup and the existing six-request limit.

The UI also rejects bridge messages larger than 1 MiB and recent-channel storage
larger than 2 KiB before JSON parsing. Invalid or implausible frame rates from HLS
metadata are discarded. Remote titles still use plain text; URL allowlists, TLS
verification and the CSP remain in place. No runtime npm dependency was added.
Background channel-status requests use two workers per batch and at most four
connections globally, reserving two slots for foreground channel/video requests.

These scans do not cover the TV firmware, its browser/Node runtime, native media
decoder or Kick's servers. The Node runtime is supplied by the TV, as described
in [LG's service documentation](https://webostv.developer.lge.com/develop/guides/js-service-basics).
The absence of scanner findings is not a guarantee that no vulnerabilities exist.

## Measured rendering work

Baseline: commit `4b143be56aaffa1c8e122d03551863c535e7282f` (0.5.2).
Both versions used identical DOM substitutes, 30 replays with six visible cards,
and 240 time-update events representing one minute of playback at four events per
second. These are operation counts, not measurements of TV frame rate, CPU or
network transfers.

| Operation | 0.5.2 | 0.6.0 |
| --- | ---: | ---: |
| Thumbnail elements created for one catalog load | 12 | 6 |
| Hidden thumbnail elements created during live autoplay | 6 | 0 |
| Elapsed-time text writes per simulated minute | 240 | 60 |
| Unchanged pause-label writes during playback | 240 | 0 |

The UI no longer renders the catalog twice or builds it before live autoplay.
Timeline text updates when its displayed second or playback state changes;
seeking and pause/play transitions still update immediately. Replay progress
updates reuse the current history entry instead of rebuilding the 200-item list
on every event. Saving remains limited to the existing ten-second interval and
lifecycle events. `npm test` enforces these rendering budgets and history behavior.

## Layout changes and verification

Catalog actions now occupy their own column, allowing long channel names to wrap
without colliding with buttons. Home actions and pagination can wrap, replay
metadata and badges truncate inside their bounds, and narrow screens use one
column. Remote navigation uses the same one/two/three-column breakpoints as CSS.
Player status messages and controls share a vertical layout; long messages can
scroll within their bounds instead of covering the controls.

`test-layout.cjs` checks element geometry in the installed app's Web Inspector.
All [18 recorded layout checks](validation/layout-0.6.0.json) passed.
The TV's browser was exercised with 25-character channel names, 200-codepoint
replay titles, repeated/compound symbols and a long unbroken player error.
Logical viewport checks used 1920×1080, 1280×720, 800×600, 560×720 and 360×640;
these are browser viewport overrides, not changes to the TV's physical resolution.
Synthetic metadata was used only for the extreme-text checks, then removed and
the viewer's saved history restored. Public screenshots use real channel data.

Device checks also cover real LIVE status badges, removing a recent channel,
pagination, native replay seeking while paused, rapid seek/pause/play input,
control auto-hide and a single active playback pipeline. The seek control uses
its thumb color to indicate focus without drawing a rectangle around the track.
The launcher icon and footer version match the packaged app.

These checks do not prove arbitrary third-party text can never trigger a layout
bug or that the application cannot crash. Actual 4K/1440p streams, multi-hour
playback, router outages and audible sound were not independently verified.
Native media telemetry reports an active unmuted audio track.
