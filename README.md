# DeepSeek Peak/Off-Peak Indicator for OpenCode Desktop v2

[![CI](https://github.com/m1khal3v/opencode-deepseek-peak-indicator/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/m1khal3v/opencode-deepseek-peak-indicator/actions/workflows/ci.yml)

A GUI-only OpenCode Desktop plugin that shows the current DeepSeek API tariff
period in the session header:

- `● 2 hours 14 minutes`
- `● 1 hour 45 minutes`

The dot is green in Off-Peak and red in Peak. The badge is placed directly to the
left of **Toggle session context**. Hovering shows a two-line tooltip:

```text
Status: Off-Peak
Until: 14 Nov 2026, 05:00
```

Clicking opens the official DeepSeek pricing page in the session's built-in
browser pane, or in the system browser when that pane is unavailable.

Everything is computed locally and deterministically. The plugin makes no
network requests and reads no user configuration.

<img src="doc/screenshot.png" alt="DeepSeek Peak/Off-Peak indicator in the OpenCode session header" width="560">

## Requirements

- OpenCode Desktop v2 with GUI plugin support (`@opencode/plugin/gui`).
- Node.js 20+ and npm for building.

## Build

```bash
npm install
npm run bundle
```

The build writes a single CommonJS bundle:

```text
dist/gui-experimental.cjs
```

`package.json` exposes it as `./gui-experimental`, which is the entry OpenCode
Desktop loads.

The bundle is committed to the repository because OpenCode installs git plugins
without running lifecycle scripts. Rebuild and commit it whenever the source
changes:

```bash
npm run bundle
```

Keep the script named `bundle`, not `build`: npm and pacote treat a `build`
script as a git-dependency preparation trigger, which OpenCode does not support
for plugin installs.

For development, rebuild on every change:

```bash
npm run dev
```

## Install from GitHub

Add the git package to the `plugins` array in
`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-deepseek-peak-indicator@git+https://github.com/m1khal3v/opencode-deepseek-peak-indicator.git"
  ]
}
```

Or let the CLI edit the config:

```bash
opencode plugin add 'opencode-deepseek-peak-indicator@git+https://github.com/m1khal3v/opencode-deepseek-peak-indicator.git'
```

OpenCode installs the package from GitHub into its plugin cache. Restart OpenCode
Desktop, or reload the plugin from **Settings → Extensions → Plugins**. Update a
git install with:

```bash
opencode plugin update
```

To pin a release instead of tracking `master`, append the tag:

```jsonc
"opencode-deepseek-peak-indicator@git+https://github.com/m1khal3v/opencode-deepseek-peak-indicator.git#v1.0.1"
```

### Local development install

For local work, point `plugins` at the absolute path to this directory:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/Users/you/projects/opencode-deepseek-peak-indicator"
  ]
}
```

The GUI reloads automatically after each `npm run bundle`.

## Behavior

### Schedule (UTC)

Peak periods run on Monday–Friday, except Chinese statutory holidays:

| Window | Period |
| --- | --- |
| `01:00–04:00` | Peak |
| `04:00–06:00` | Off-Peak |
| `06:00–10:00` | Peak |
| `00:00–01:00`, `10:00–24:00` | Off-Peak |

All weekends and Chinese statutory holidays are Off-Peak for the full day.

### Chinese holidays without a network

The following holidays are calculated offline:

- New Year: 1 January.
- Labour Day: 1–2 May (the 2025 State Council reform added 2 May).
- National Day: 1–3 October.
- Qingming: the day the Sun's apparent longitude reaches 15°, computed with
  Meeus' low-precision solar coordinates and a bisection between 3 and 6 April.
  The result is converted to the `Asia/Shanghai` calendar date (4 or 5 April,
  and rarely 6 April).
- Spring Festival: New Year's Eve plus lunar 1/1–1/3.
- Dragon Boat Festival: lunar 5/5.
- Mid-Autumn Festival: lunar 8/15.

Lunar dates come from the Chinese calendar built into V8/ICU via
`Intl.DateTimeFormat("en-US-u-ca-chinese", { timeZone: "Asia/Shanghai" })`.
Leap lunar months are rejected by requiring a purely numeric month, so a holiday
is never duplicated in a leap month.

Dynamically announced **调休** make-up workdays and extended breaks are not
computed without a network lookup. Consequently, weekends are always Off-Peak
even when the State Council makes one a working day.

### Countdown

The timer uses only the two largest non-zero units, with the exact rules below:

| Remaining | Display |
| --- | --- |
| days + hours | `2 days 15 hours` |
| days + minutes | `1 day 1 minute` |
| days only | `3 days` |
| hours + minutes | `14 hours 30 minutes` |
| hours only | `3 hours` |
| minutes only | `59 minutes` |
| seconds only | `45 seconds` |

A positive remainder below one second shows `1 second`, never `0 seconds`.
Digits use `font-variant-numeric: tabular-nums`, so the badge does not jitter.

### Appearance

The badge is a host `ctx.ui.Button` with the `ghost-muted` look, so it uses the
app's own typography, hover background and focus outline. In its resting state
it is transparent and has no border. The status dot follows the host's
dark/light appearance through `data-appearance` and keeps muted sage green and
terracotta colors.

The tooltip is `ctx.ui.Tooltip`, the same host component used by **Toggle
session context**, so it shares that button's 600 ms open delay, compact
appearance and animation. It shows the current status and the local date and
time of the next switch on two lines. The stylesheet is imported with `?inline`
and registered through `ctx.add(Style, css)`.

## CI

GitHub Actions runs on every push and pull request to `master`:

- `npm run typecheck`
- `npm test`
- `npm run bundle`
- `git diff --exit-code -- dist`

The last step fails when `src/` changed but the committed
`dist/gui-experimental.cjs` was not rebuilt.

## Tests

```bash
npm test
```

The unit tests cover all UTC boundaries, all seven timer branches, singular and
plural forms, the 2025–2028 fixed holidays, Qingming, the 2026 lunar holidays,
leap-month handling, weekends and the tooltip format.

## Project layout

```text
src/
├── gui.tsx           Plugin.define, one shared clock, Slot("session.header", order 9)
├── indicator.tsx     Solid badge: dot, timer, two-line tooltip, click handler
├── styles.css        Status-dot palette and tooltip layout
├── schedule.ts       Peak/Off-Peak status, next transition, timer formatting
├── holidays.ts       Chinese statutory holidays and the Qingming solar term
└── schedule.test.ts  Unit tests
```

## License

The solar-term calculation follows the published formulas from Jean Meeus,
*Astronomical Algorithms*. The lunar calendar is provided by the host's ICU data.
