# FamilyTV — Google TV driver

Remote control + AI support for a **Google TV Streamer (4K)**, reachable over
Tailscale. This is the **v1** driver. It talks to the device over **ADB**, which
(unlike Roku ECP) gives the agent real diagnostics: screenshots, foreground-app
inspection, text input, and app launching.

> Specs/decisions live in Markbase (`rokupi` workspace). Roku ECP lives in the
> sibling [`../roku`](../roku) project as a future driver.

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
| `docs/ADB-Pairing-Guide.md` | how to pair the controller host with the TV |
| `test/` | fake adb + integration suite (`npm test`) |

## Setup

1. **Pair ADB** with the Google TV — see [docs/ADB-Pairing-Guide.md](docs/ADB-Pairing-Guide.md).
2. Install and run, pointing at the paired device:
   ```bash
   npm install
   GOOGLE_TV_ADDR=<TV_IP>:<ADB_PORT> npm start
   ```
3. Open <http://localhost:3000> (or `http://<host-tailscale-ip>:3000` from your phone).

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
adb connect <tv-tailnet-ip>:<adb-port>
GOOGLE_TV_ADDR=<tv-tailnet-ip>:<adb-port> npm start
```

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
| POST | `/task/reset-home` | recover to the home screen |

App→package mappings live in `drivers/google-tv/index.js` (`APP_PACKAGES`);
confirm against `/apps` on the real device.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_TV_ADDR` | (none) | `IP:PORT` of the paired Google TV — all adb calls target it |
| `ADB_BIN` | `adb` | path to the adb binary (tests point this at a fake) |
| `PORT` | `3000` | API/web-remote port |
| `DRIVER` | `google-tv` | which driver to load |
| `STREAM_URL` | (unset) | optional HDMI live-view stream for the web remote |

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
