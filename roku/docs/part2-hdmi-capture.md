# Part 2 — Live screen view (HDMI capture)

Part 1 lets you *control* the TV blind. Part 2 is about *seeing* it remotely, so
you can tell what's actually on screen before acting. This is the main reason to
move from a laptop to a Raspberry Pi.

This doc lays out the options. **The right one depends on one question:**

## First, the deciding question: Roku TV or Roku device?

- **Roku TV** (the Roku is built into the television) — there is **no HDMI output
  to tap**. The signal never leaves the panel. HDMI capture is not possible;
  see the "Roku TV" options below.
- **Roku streaming device** (Stick / Express / Ultra plugged into a normal TV
  via HDMI) — you *can* put a capture device inline on that HDMI cable. This is
  the good case.

## The HDCP catch (applies to all HDMI capture)

Roku outputs an **HDCP-encrypted** HDMI signal. Cheap capture dongles will show
a **black screen** during protected playback (most streaming apps). Capturing
menus/navigation often works; capturing Netflix playback usually doesn't. The
common workaround is an **HDCP-stripping HDMI splitter** placed before the
capture device. (Legal gray area; fine for viewing your own devices, but worth
knowing.)

---

## Options if it's a Roku **streaming device**

### A. USB HDMI capture dongle on the Pi (recommended)
Roku → HDMI splitter (HDCP strip) → cheap USB capture dongle (UVC, MS2109-class,
~$10–15) → Pi USB. The Pi reads it as a webcam and streams it.

- **Stream method:** `ffmpeg`/MJPEG for simplicity, or WebRTC (e.g. via
  `mediamtx`) for low latency. Served over Tailscale, embedded in the web remote.
- **Pros:** cheap, standard, integrates cleanly with the existing Pi + web UI.
- **Cons:** needs the splitter for protected content; ~0.3–1s latency on MJPEG.

### B. Dedicated HDMI-over-IP encoder
A standalone box that encodes HDMI to an RTSP/HTTP stream on the LAN; the Pi just
proxies/links it.

- **Pros:** offloads encoding, often better quality/latency.
- **Cons:** more expensive ($50–120), another device to power and manage.

---

## Options if it's a Roku **TV** (built-in)

No HDMI tap exists, so live *signal* capture is out. Choices:

### C. Camera pointed at the screen
A second Pi (or USB webcam on the same Pi) physically aimed at the TV.

- **Pros:** works regardless of HDCP or device type; also shows whether the TV
  is even on / on the right input.
- **Cons:** placement/lighting/glare; lower fidelity; a camera in the room.

### D. No live view — rely on state queries
Lean on `GET /active-app` and `GET /apps` (already implemented) to know *what's
running* without seeing pixels. Often enough for "is it stuck / what app is up."

- **Pros:** zero extra hardware; already built.
- **Cons:** no actual picture; can't read on-screen menus/errors.

> Note: Roku's ECP has **no reliable screenshot API** on retail devices (the
> developer screenshot only works in dev mode), so there's no pure-software
> "grab the screen" path.

---

## Decision (2026-06-19): Option A — USB HDMI capture on the Pi

The device is a **Roku streaming device on HDMI**, so inline capture is viable.
Chosen: **Option A**, MJPEG first (simplest), WebRTC later if latency annoys.
This is a **Pi-era feature** — it needs hardware at the TV, so it waits for the
on-site Pi install.

### Parts (~$25–35)

| Part | Notes |
| --- | --- |
| USB HDMI capture dongle | UVC / MS2109-class, 1080p30, ~$12. Shows up as `/dev/video0` |
| 1×2 HDMI splitter that strips HDCP | ~$10–18. Outputs 1080p; this is what lets the dongle see protected playback |
| 2× short HDMI cables | Roku→splitter, splitter→dongle |

### Wiring

```
Roku ──HDMI──▶ Splitter ──out 1──▶ TV
                        └─out 2──▶ USB capture dongle ──USB──▶ Pi
```

The splitter strips HDCP so the dongle gets a clean signal; out 1 keeps the TV
working normally.

### Pi software (MJPEG, simplest)

```bash
sudo apt install -y v4l-utils
v4l2-ctl --list-devices            # confirm the dongle is /dev/video0

# Option 1: ffmpeg -> MJPEG over HTTP (or use mjpg-streamer)
sudo apt install -y ffmpeg
ffmpeg -f v4l2 -framerate 15 -video_size 1280x720 -i /dev/video0 \
  -f mpjpeg -q:v 7 http://0.0.0.0:8080/stream   # served on :8080
```

Then point the web remote at it (no code change — the live-view panel and
`/config` endpoint already exist):

```ini
# in /etc/systemd/system/rokupi.service
Environment=STREAM_URL=http://<pi-tailscale-ip>:8080/stream
```

Restart the service and the **Live view** panel appears at the top of the web
remote, streaming over Tailscale.

> **Latency/quality:** MJPEG is ~0.5–1s and totally fine for "what's on screen."
> If you want near-realtime, swap to **WebRTC** via
> [mediamtx](https://github.com/bluenviron/mediamtx) reading `/dev/video0`, and
> set `STREAM_URL` to its WebRTC/HLS endpoint. Same panel, lower latency.

### Software status

The app side is **already built and tested**: `GET /config` exposes
`stream_url`, and `public/index.html` shows a live-view panel when it's set
(hidden otherwise). All that's left is the hardware + the capture command above.

---

## Appendix: options considered

(Retained for reference — Option A above is the chosen path now that the
hardware is confirmed as a streaming device.)
