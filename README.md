# RokuPi

A Raspberry Pi that sits at a family member's house and lets you remotely
control their Roku TV — from a phone or an AI agent — over a private Tailscale
network. Plug it in once; fix common TV problems from anywhere.

> **Specs live in Markbase** (`rokupi` workspace): PRD, Architecture,
> Setup-Guide, Tasks, and the Decisions log. This repo is the implementation
> of "Part 1" — the on-Pi Express app and web remote.

## What's here

| Path | Role |
| --- | --- |
| `server.js` | Express API that bridges clients to the Roku ECP API (port 8060) |
| `public/index.html` | Phone-optimized web remote (D-pad + app launch buttons) |
| `deploy/rokupi.service` | systemd unit for auto-start on the Pi |

## Roku discovery

The server resolves the Roku's IP in this order:

1. `ROKU_IP` env var, if set — manual override / local dev.
2. Otherwise, **SSDP discovery** on startup (the same mechanism the Roku app
   uses) — no hardcoded IP needed.
3. On a failed request, it re-discovers once — so a DHCP-driven IP change
   self-heals without an SSH visit.

A DHCP reservation on the router is still recommended as belt-and-suspenders.

## Local development

```bash
npm install
# With a real Roku on your LAN, let discovery find it:
npm start
# Or pin one explicitly (also useful when no Roku is present):
ROKU_IP=192.168.1.50 npm start
```

Then open <http://localhost:3000>.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Roku reachability + resolved IP |
| GET | `/active-app` | Currently running app (XML) |
| GET | `/apps` | All installed apps (XML) |
| POST | `/remote/:key` | Send a keypress (Home, Back, Up, Select, Play, …) |
| POST | `/launch/:appId` | Launch app by Roku channel ID |
| POST | `/task/reset-home` | Double-Home press to recover a stuck TV |
| POST | `/task/open/:appName` | Launch by friendly name (netflix, youtube, plex, youtube_tv) |

## Deploy on the Pi

See the **Setup-Guide** in Markbase for full provisioning steps. In short:
copy this directory to `/home/pi/rokupi`, run `npm install`, install
`deploy/rokupi.service` to `/etc/systemd/system/`, then
`sudo systemctl enable --now rokupi`.
