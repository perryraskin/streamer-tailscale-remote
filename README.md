# streamer-tailscale-remote

**FamilyTV** — remote control + AI support for a family member's TV streamer,
reachable privately over [Tailscale](https://tailscale.com). Drop a controller
(a Mac, a Raspberry Pi, or any always-on machine) on their network, and you — or
an AI agent — can fix common TV problems from anywhere: see what's on screen,
navigate, launch apps, type, and recover a stuck TV.

The system is **device-driver based**: one safe control API and AI tool surface,
with a per-streamer driver behind it. Each driver lives in its own folder with
its own guide.

## Drivers

| Folder | Streamer | Status | Control |
| --- | --- | --- | --- |
| [`google/`](google) | **Google TV Streamer (4K)** | **v1 / primary** | ADB (screenshots, app/activity inspection, text input, launch) |
| [`roku/`](roku) | Roku | earlier prototype / future driver | Roku ECP (keypress, launch, query) |

**Google TV is the v1 direction** — ADB gives the agent a real diagnostic
surface (it can *see* the screen via screenshots), which Roku's ECP can't. The
Roku project is a complete, tested prototype kept as a future driver; see
[`roku/README.md`](roku/README.md).

Start with [`google/README.md`](google/README.md).

## Principles (both drivers)

- **Tailscale-only** — never exposed to the public internet.
- **AI talks to the FamilyTV API, not the device directly** — platform details
  stay behind the driver.
- **No destructive actions** — no purchases, account/payment/parental-control
  changes, app deletion, or factory reset are reachable.
- **Confirm on ambiguity; escalate to a human** for logins, purchases, or
  unclear screens.

## Repo layout

```
google/   FamilyTV v1 — Google TV driver, API, web remote, AI tool, tests
roku/     Roku ECP prototype — server, web remote, AI tool, tests (future driver)
.github/  CI (tests both projects on Node 18/20/22)
```

Each project is self-contained: `cd` into it, `npm install`, `npm test`,
`npm start`. Neither needs hardware to test — both ship a mock device.

## License

[MIT](LICENSE).
