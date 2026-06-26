# ADB Pairing Guide (Google TV)

Pair a trusted controller host (your Mac for v1, or the Pi appliance later) with
the Google TV Streamer so FamilyTV can inspect and control it.

## 1. Install ADB

macOS:
```bash
brew install android-platform-tools
```

Raspberry Pi OS / Debian:
```bash
sudo apt update && sudo apt install -y android-tools-adb
```

## 2. Enable Wireless Debugging on the Google TV

1. `Settings → System → About` → click **Android TV OS build** ~7×
   until "You are now a developer".
2. `Settings → System → Developer options → Wireless debugging` → **On**.

## 3. Pair

On the TV: **Wireless debugging → Pair device with pairing code** (shows an
`IP:PORT` and a 6-digit code). On the host:
```bash
adb pair <tv-name>.<tailnet>.ts.net:<pairing-port>     # enter the code when prompted
```

## 4. Connect

The connect port is different from the pairing port (shown on the main Wireless
debugging screen):
```bash
adb connect <tv-name>.<tailnet>.ts.net:<adb-connect-port>
adb devices            # should list <tv-name>.<tailnet>.ts.net:<adb-connect-port>  device
```

Use that `IP:PORT` as `GOOGLE_TV_ADDR` for the server:
```bash
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port> npm start
```

## Tailscale target

Prefer the TV's Tailscale MagicDNS name over its home-network IP when the
FamilyTV host controls the TV remotely.

The target shape is:

```text
<tv-name>.<tailnet>.ts.net:<adb-connect-port>
```

The hostname should stay stable. If the TV shows a different Wireless
debugging connect port later, keep the hostname and replace only the port.

```bash
adb connect <tv-name>.<tailnet>.ts.net:<adb-connect-port>
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port> npm start
```

## 5. Sanity-check the commands the driver uses

```bash
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port>
adb -s "$GOOGLE_TV_ADDR" shell input keyevent KEYCODE_HOME
adb -s "$GOOGLE_TV_ADDR" shell dumpsys window | grep mCurrentFocus
adb -s "$GOOGLE_TV_ADDR" shell pm list packages -3
adb -s "$GOOGLE_TV_ADDR" exec-out screencap -p > /tmp/screen.png
```

## Reliability notes (verify on the real device)

Confirmed on the real Google TV Streamer on 2026-06-26:

- `dumpsys window` focus parsing works for current-app detection.
- `screencap -p` works for screenshots.
- Package names for the installed family apps were tuned in `APP_PACKAGES`.

Still track whether pairing survives:

- Does pairing survive a **TV reboot**? a **host reboot**? a **network blip**?
- Does Wireless debugging stay enabled across **OS updates**?

If pairing proves flaky, the **Pi appliance** should own the pairing and run a
watchdog that re-runs `adb connect` on a timer (the systemd unit already does a
best-effort `adb connect` on start via `ExecStartPre`).
