# Production audit for 0.6.0

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
