# RokuPi

Control a family member's Roku TV remotely — from your phone or an AI agent —
over a private [Tailscale](https://tailscale.com) network. Drop a Raspberry Pi
at their house, plug it in once, and from then on you can fix the common stuff
("it's stuck," "I can't find Netflix") without being in the room.

It's a small Express server that bridges remote clients to the Roku's local
[ECP API](https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md),
plus a phone-friendly web remote and an optional AI tool.

## Why Tailscale?

The Roku's control API only works on the local network and has no auth, so it
must never be exposed to the public internet. Tailscale puts the Pi, your
phone, and any AI client on the same private WireGuard mesh — so you reach the
Pi from anywhere as if you were on the couch, with nothing open to the world.

## What you need

- A Raspberry Pi (4 or 5 recommended) + microSD card, that will live at the TV's location
- A Roku TV / device on the same LAN as the Pi
- A free [Tailscale](https://tailscale.com) account
- 15 minutes at home to provision, ~5 minutes on-site

## How Roku discovery works

You don't have to hardcode the Roku's IP. On startup the server finds the Roku
via **SSDP** (the same discovery the official Roku app uses) and caches it; if a
request later fails, it re-discovers — so a DHCP address change self-heals
without you SSHing in. Set the `ROKU_IP` env var only if you want to pin a
specific device or skip discovery (handy for local dev). A DHCP reservation on
the router is a nice belt-and-suspenders.

---

## Setup

> **No Pi yet?** You can run RokuPi on any always-on machine on the Roku's LAN —
> a spare Windows laptop works great as an interim host for control + the AI
> agent (just not Part 2's HDMI capture). See
> [docs/windows-host.md](docs/windows-host.md).

### Part A — at home (before you deliver the Pi)

**1. Flash the SD card.** Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/),
choose **Raspberry Pi OS Lite (64-bit)**, and click the ⚙️ gear to pre-configure:
- Hostname: `rokupi`
- Enable SSH (password or your public key)
- Username `pi` + a password
- WiFi SSID + password — **the destination network's** credentials
- Locale / timezone

**2. Boot and SSH in.**
```bash
ping rokupi.local
ssh pi@rokupi.local
```

**3. Update and install Node.js** (v18+):
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm
node -v
```

**4. Install Tailscale and join your tailnet:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up        # follow the auth link
tailscale ip -4          # note this IP — you'll use it from your phone
```

**5. Install RokuPi:**
```bash
git clone https://github.com/perryraskin/roku-tailscale-remote.git ~/rokupi
cd ~/rokupi
npm install
```

**6. Run it as a service** (auto-starts on boot):
```bash
sudo cp deploy/rokupi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rokupi
sudo systemctl status rokupi      # should show: active (running)
```

**7. Make logs survive reboots** (optional but recommended):
```bash
sudo cp deploy/journald-rokupi.conf /etc/systemd/journald.conf.d/rokupi.conf
sudo mkdir -p /var/log/journal
sudo systemctl restart systemd-journald
```

**8. Smoke test.** If a Roku is on your home LAN it'll be discovered; otherwise
just confirm the server is up and the web remote loads:
```bash
curl http://localhost:3000/health
# Then from your phone (on Tailscale): http://<PI_TAILSCALE_IP>:3000
```

### Part B — on-site (where the TV lives)

**1. Plug in the Pi** (ethernet preferred, else the WiFi you baked in). Give it
~30s; it auto-joins Tailscale, starts the service, and discovers the Roku.

**2. Enable Roku network control** (one time, on the Roku):
`Settings → System → Advanced System Settings → Control by Mobile Apps → Network Access → Permissive`

**3. Confirm it found the Roku:**
```bash
curl http://<PI_TAILSCALE_IP>:3000/health   # returns the discovered roku_ip
```

**4. Test from your phone** over Tailscale: open `http://<PI_TAILSCALE_IP>:3000`,
press **Home**, watch the TV respond. Done.

> **If SSDP is blocked** on that network (rare, but some routers isolate
> devices): SSH to the Pi, find the Roku with
> `sudo apt install -y nmap && nmap -sn 192.168.1.0/24` (confirm with
> `curl http://<ip>:8060/query/device-info`), then set `ROKU_IP=<ip>` in
> `/etc/systemd/system/rokupi.service` and `sudo systemctl daemon-reload && sudo systemctl restart rokupi`.

---

## Configuration

All optional — set as `Environment=` lines in the systemd unit, or inline for local dev.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the API/web remote listens on |
| `ROKU_IP` | (auto via SSDP) | Pin a specific Roku IP and skip discovery |
| `LOG_FILE` | (unset) | Also append structured logs to this file (see Logging) |
| `ROKUPI_BASE_URL` | `http://localhost:3000` | Base URL the AI runner targets |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Roku reachability + resolved IP |
| GET | `/active-app` | Currently running app (XML) |
| GET | `/apps` | All installed apps (XML) |
| POST | `/remote/:key` | Send a keypress (Home, Back, Up, Select, Play, …) |
| POST | `/launch/:appId` | Launch app by Roku channel ID |
| POST | `/task/reset-home` | Double-Home press to recover a stuck TV |
| POST | `/task/open/:appName` | Launch by friendly name (netflix, youtube, plex, youtube_tv) |

App IDs live in `APP_MAP` in `server.js`. The Plex / YouTube TV IDs are
best-effort — confirm against `GET /apps` on your Roku and adjust if needed.

## Logging

Every action logs one JSON line to stdout, which `systemd`/journald captures:
```bash
journalctl -u rokupi -f
```
Step 7 above makes that history persistent and size-capped. If you'd rather
have a portable flat file, set `LOG_FILE=/var/log/rokupi/rokupi.log` and install
the included rotation config:
```bash
sudo cp deploy/rokupi.logrotate /etc/logrotate.d/rokupi
```

## AI agent

`ai/` contains a `control_roku` tool definition (JSON Schema) and a runner that
maps tool calls to the API above — so an LLM can drive the TV through the same
clean endpoints, never raw ECP, and only via non-destructive actions. See
[`ai/README.md`](ai/README.md) for a drop-in Claude API example.

## Local development

```bash
npm install
npm start                          # let SSDP discover a Roku on your LAN
ROKU_IP=192.168.1.50 npm start     # or pin one (also works with no Roku present)
```
Then open <http://localhost:3000>.

## Repo layout

| Path | Role |
| --- | --- |
| `server.js` | Express API: Roku ECP bridge + SSDP discovery + logging |
| `public/index.html` | Phone web remote (D-pad, playback, app launchers, health) |
| `ai/` | `control_roku` tool definition + runner |
| `deploy/` | systemd unit, journald + logrotate configs |

## License

[MIT](LICENSE) — do what you like; no warranty.

---

<sub>Project docs and decision history are organized in
[Markbase](https://markbase.cloud). 🙏</sub>
