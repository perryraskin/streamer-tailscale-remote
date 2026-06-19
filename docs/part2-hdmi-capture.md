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

## Recommendation

Decide hardware first:

- **Roku streaming device** → **Option A** (USB capture + HDCP splitter on the
  Pi), streamed via WebRTC/MJPEG into the web remote. Best capability-per-dollar
  and fits the existing architecture.
- **Roku TV** → start with **Option D** (state queries, already shipped) and add
  **Option C** (a camera) only if you really need eyes on the screen.

Either way this is a **Pi-era feature** — it needs hardware at the TV, so it
waits until you're on-site with the Pi. Tracked as a Proposed decision in the
Markbase Decisions log; this doc is the options analysis behind it.
