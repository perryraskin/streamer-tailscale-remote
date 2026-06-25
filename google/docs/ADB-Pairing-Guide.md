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
adb pair <TV_IP>:<PAIRING_PORT>     # enter the code when prompted
```

## 4. Connect

The connect port is different from the pairing port (shown on the main Wireless
debugging screen):
```bash
adb connect <TV_IP>:<ADB_PORT>
adb devices            # should list <TV_IP>:<ADB_PORT>  device
```

Use that `IP:PORT` as `GOOGLE_TV_ADDR` for the server:
```bash
GOOGLE_TV_ADDR=<TV_IP>:<ADB_PORT> npm start
```

## 5. Sanity-check the commands the driver uses

```bash
adb -s <TV_IP>:<ADB_PORT> shell input keyevent KEYCODE_HOME
adb -s <TV_IP>:<ADB_PORT> shell dumpsys window | grep mCurrentFocus
adb -s <TV_IP>:<ADB_PORT> shell pm list packages -3
adb -s <TV_IP>:<ADB_PORT> exec-out screencap -p > /tmp/screen.png
```

## Reliability notes (verify on the real device)

Open questions to confirm once the Streamer is set up:

- Does pairing survive a **TV reboot**? a **host reboot**? a **network blip**?
- Does Wireless debugging stay enabled across **OS updates**?
- Which **package names** do the family's apps actually use (check `pm list`)?

If pairing proves flaky, the **Pi appliance** should own the pairing and run a
watchdog that re-runs `adb connect` on a timer (the systemd unit already does a
best-effort `adb connect` on start via `ExecStartPre`).
