# FamilyTV — Google TV driver

Remote control + AI support for a **Google TV Streamer (4K)**, reachable over
Tailscale. This is the **v1** driver. It talks to the device over **ADB**, which
(unlike Roku ECP) gives the agent real diagnostics: screenshots, foreground-app
inspection, text input, and app launching.

> Specs/decisions live in Markbase (`streamer-tailscale-remote` workspace).
> Roku ECP lives in the sibling [`../roku`](../roku) project as a future driver.

## What's here

| Path | Role |
| --- | --- |
| `server.js` | FamilyTV Express API (talks to the device via a driver) |
| `drivers/google-tv/` | the google-tv driver (ADB) implementing the `TvDriver` interface |
| `drivers/index.js` | driver registry (`google-tv` now; `roku`/`fire-tv`/… later) |
| `lib/adb.js` | thin `adb` wrapper (binary via `ADB_BIN`, target via `GOOGLE_TV_ADDR`) |
| `public/index.html` | phone web remote — D-pad, apps, **text input**, **live screenshot** |
| `ai/` | `control_tv` AI tool + runner |
| `deploy/familytv.service` | systemd unit |
| `.env.example` | placeholder env file; copy to private `.env` on the host |
| `docs/Deployment-Env.md` | required env vars, Tailscale Serve URL, devpi/systemd notes |
| `docs/ADB-Pairing-Guide.md` | how to pair the controller host with the TV |
| `test/` | fake adb + integration suite (`npm test`) |

## Setup

1. **Pair ADB** with the Google TV — see [docs/ADB-Pairing-Guide.md](docs/ADB-Pairing-Guide.md).
2. Create a private env file from the placeholder:
   ```bash
   cp .env.example .env
   $EDITOR .env
   ```
3. Set `GOOGLE_TV_ADDR` in `.env` to the paired TV target:
   ```bash
   GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port>
   ```
4. Install and run:
   ```bash
   npm install
   scripts/start-familytv.sh --serve
   ```
5. Open <http://localhost:3000> locally. From your phone, use the FamilyTV host
   HTTPS URL shown by `tailscale serve status`; the TV's Tailscale name is only
   the ADB target.

If the wireless-debugging port changes, restart with the new port:

```bash
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<new-adb-connect-port> npm start
```

For a clean parents' install after factory reset, use the short
[docs/Quick-Parents-Setup.md](docs/Quick-Parents-Setup.md) checklist or the
full [docs/Parents-Install-Runbook.md](docs/Parents-Install-Runbook.md).

## Install as a phone app

The web remote is a PWA: it includes a manifest, service worker, standalone
display metadata, home-screen icons, typed commands, and browser voice input
where supported.

For local testing, `http://localhost:3000` is enough. For a phone on Tailscale,
serve the FamilyTV host over tailnet HTTPS so the service worker can run and the
browser treats it as a real installable app:

```bash
tailscale serve --https=8443 --bg localhost:3000
tailscale serve status
```

Then open the HTTPS MagicDNS URL that Tailscale reports for the host running
FamilyTV and use the browser's Add to Home Screen / Install action.

Example URL shape:

```text
https://<familytv-host>.<tailnet>.ts.net:8443/
```

Use port `8443` when port `443` is already occupied on the FamilyTV host. HTTPS
on `8443` is still a secure PWA install URL.

For hands-free control from your iPhone, create the Siri Shortcut in
[docs/Siri-Shortcut.md](docs/Siri-Shortcut.md). It sends dictated commands to
the same `/command` endpoint used by the PWA.

The screenshot panel has an optional auto-refresh selector. `live` polls as
fast as ADB screenshots can complete without overlapping requests; it is useful
for short troubleshooting sessions but is heavier than 2s/3s polling.

## Reaching it from your house (networking)

The Google TV can't run this server — it's *controlled* via ADB. So you need
two things: **(1)** a Tailscale presence on the parents' LAN, and **(2)** a host
running this server with `adb` paired to the TV. Three ways to arrange that:

| Option | Tailscale on… | Server runs on… | ADB path | Best for |
| --- | --- | --- | --- | --- |
| **1. Tailscale on the TV** | the Google TV (Android TV app) | your Mac (at home) | over Tailscale to the TV's tailnet IP | quickest to test — no extra device |
| **2. Host at parents'** ⭐ | a Pi or their PC | that same Pi/PC | local LAN (fast) | permanent set-and-forget deploy |
| **3. Subnet router** | a Pi/PC | your Mac | over Tailscale to the TV's LAN IP | rarely worth it vs. #2 |

```
Option 1:  Phone/Mac ──Tailscale──► Google TV     (server on your Mac; adb → TV tailnet IP)
Option 2:  Phone ──Tailscale──► Pi/PC at parents' (server + adb here) ──LAN──► Google TV
```

**Day one (recommended for testing):** Option 1 — install Tailscale on the
Google TV, run the server on your Mac:

```bash
# on the Google TV: install Tailscale from the Play Store, sign into YOUR account
adb connect <tv-name>.<tailnet>.ts.net:<adb-connect-port>
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port> scripts/start-familytv.sh --serve
```

Keep the actual target in private `.env`, not in Git.

**Permanent deploy (recommended):** Option 2 on a Pi — Tailscale + this server +
ADB all on a small always-on box at the parents'; you reach
`http://<pi-tailnet-ip>:3000` from anywhere. ADB stays on the local LAN, so it's
faster and steadier than ADB-over-Tailscale.

> Whatever carries Tailscale at the parents' (TV, Pi, or PC), **disable key
> expiry** on it in the Tailscale admin console so it doesn't drop off the
> tailnet in ~6 months. The Google TV itself never runs this server.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/config` | driver, app list, key list, optional `stream_url` |
| GET | `/health` | device reachable + model |
| GET | `/current-app` | foreground package/activity (+ friendly name) |
| GET | `/apps` | installed third-party apps |
| GET | `/screenshot` | current screen as PNG |
| POST | `/remote/:key` | a safe key (home, back, up/down/left/right, select, play_pause, rewind, fast_forward, volume_up/down, mute) |
| POST | `/type` | type text — `{ "text": "..." }` |
| POST | `/launch/:appName` | launch a known app (netflix, youtube, youtube_tv, …) |
| POST | `/command` | natural-language command, including Siri/PWA voice and Google TV search queries |
| POST | `/task/wake` | wake the streamer/TV with `KEYCODE_WAKEUP` |
| POST | `/task/reset-home` | recover to the home screen |

App→package mappings live in `drivers/google-tv/index.js` (`APP_PACKAGES`).
They were tuned against the parents' Google TV Streamer on 2026-06-26; re-run
`/apps` if installed apps change.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_TV_ADDR` | (required unless exactly one adb device is connected) | `HOST:PORT` of the paired Google TV — all adb calls target it |
| `ADB_BIN` | `adb` | path to the adb binary (tests point this at a fake) |
| `PORT` | `3000` | API/web-remote port |
| `LISTEN_HOST` | `0.0.0.0` | interface/address the API binds to; set to a Tailscale IP for Tailscale-only Docker deploys |
| `TAILSCALE_SERVE_PORT` | `8443` | Tailscale HTTPS port used by `scripts/start-familytv.sh --serve` |
| `DRIVER` | `google-tv` | which driver to load |
| `STREAM_URL` | (unset) | optional HDMI live-view stream for the web remote |

See [docs/Deployment-Env.md](docs/Deployment-Env.md) for the private env file,
Tailscale Serve URL, and devpi/systemd setup.

For Docker, see [`../deploy/docker`](../deploy/docker).

## Testing (no device needed)

```bash
npm test
```
A fake `adb` (`test/fake-adb.js`) stands in for the device; the suite drives the
real server + AI runner end-to-end, including the screenshot path and the
"TV is stuck" recovery flow.

## Safety

The driver and tool expose **only non-destructive actions**. No purchases,
account/password/payment changes, app deletion, parental-control changes, or
factory reset are reachable. The AI is instructed to confirm before major
actions and escalate to a human for logins/purchases/unclear screens.
