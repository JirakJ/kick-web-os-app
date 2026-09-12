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
- Gzip responses are inflated incrementally and rejected once the decoded text
  exceeds 1 MiB, so a compressed bomb cannot exceed the existing memory bound.
  Unsupported content encodings are rejected before any data is read, and the
  inflater is closed on every completion path.
- The keep-alive agent uses the same TLS verification as before; no host is
  caller-supplied and redirects remain disabled.
- The playlist host and path are split with an anchored regular expression
  after the allowlist check, replacing the deprecated `url.parse`.
- The locale is read only from `webOSSystem.locale`, `PalmSystem.locale` and the
  browser language, each guarded, with values longer than 35 characters ignored.

## Performance changes

| Change | Effect |
| --- | --- |
| `Accept-Encoding: gzip` for Kick responses | Channel document 8.8 KB → 2.4 KB, 30-replay list 64 KB → 7.5 KB on the wire (measured against `kick.com` on 12 September 2026 for one channel) |
| Keep-alive HTTPS agent (six sockets, two idle) | Status polling and channel/replay lookups reuse TLS sessions instead of a handshake per request |
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
