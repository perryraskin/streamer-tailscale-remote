# Parents' Install Runbook

This is the clean path after testing the Google TV Streamer with a personal
Google account. Goal: the TV has only the parents' Google account, while
FamilyTV remains reachable privately through Tailscale.

## Recommended shape

Use this deployment shape for the parents' house:

```text
Phone / Mac / AI agent
        |
     Tailscale
        |
Pi or always-on host at parents' house
        |
 local ADB
        |
Google TV Streamer
```

Do **not** leave your Google account on the Google TV. If you also do not want a
personal Tailscale login on the TV itself, do not install Tailscale on the TV;
run Tailscale on the Pi/host instead.

## What can be one-command

The TV-side work cannot be one-click because factory reset, Google account
sign-in, app sign-ins, Developer Options, and ADB pairing require the remote,
credentials, and pairing codes.

The host-side work after ADB is paired is close to one command:

```bash
cd google
cp .env.example .env
$EDITOR .env
scripts/start-familytv.sh --serve
```

That command installs Node dependencies if needed, reconnects ADB, starts the
FamilyTV server, and publishes the web remote over Tailscale HTTPS.

Set the private TV target in `.env`:

```text
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port>
```

The Tailscale DNS name should stay stable. If Wireless debugging is toggled or
re-paired, Android may assign a new ADB connect port; update only the port.

## Before reset

- Confirm the parents' Google account email/password and 2-step verification
  path are available.
- Confirm streaming app credentials are available: YouTube TV, Netflix, Disney+,
  Prime Video, Hulu, Tubi, Peacock, or whatever they actually use.
- Decide the permanent host:
  - Best: Raspberry Pi or always-on PC at parents' house.
  - Acceptable for testing: your Mac, if it can reach the TV.
- Keep the physical Google TV remote nearby. The physical remote remains the
  fallback.

## Factory reset

On the Google TV:

```text
Profile icon -> All settings -> System -> About -> Factory Reset
```

Factory reset erases local data, installed apps, settings, and accounts from the
device.

## Set up with parents' account only

1. Start Google TV setup after the reset.
2. Use the parents' Google account, not your account.
3. Put the device in the parents' Google Home home/room.
4. Finish remote setup and confirm the physical remote works.
5. Prefer Ethernet if practical; otherwise join the parents' Wi-Fi.

Being a member of the parents' Google Home helps you manage devices in their
home, but it does not transfer your current TV login into their Google account.
The clean account boundary comes from resetting and setting up with their
account from the start.

## Install and sign into apps

Install the apps they actually need, then sign in to each one with their app
credentials:

- YouTube TV
- Netflix
- YouTube
- Disney+
- Prime Video
- Hulu
- Tubi
- Peacock

After app install, FamilyTV can list packages with:

```bash
curl http://localhost:3000/apps
```

or directly with:

```bash
adb -s "$GOOGLE_TV_ADDR" shell pm list packages -3
```

Update `APP_PACKAGES` only if package names differ from the current map.

## Enable ADB

On the Google TV:

```text
Settings -> System -> About -> Android TV OS build
```

Click the build number about seven times until Developer Options are enabled.

Then:

```text
Settings -> System -> Developer options -> Wireless debugging -> On
```

Pair from the host:

```bash
adb pair <tv-name>.<tailnet>.ts.net:<pairing-port>
```

Connect from the host:

```bash
adb connect <tv-name>.<tailnet>.ts.net:<adb-connect-port>
adb devices
```

Expected:

```text
<tv-name>.<tailnet>.ts.net:<adb-connect-port> device
```

## Start FamilyTV

From the repo on the host:

```bash
cd google
scripts/start-familytv.sh --serve
```

Open the HTTPS URL shown by:

```bash
tailscale serve status
```

Then add the web remote to the phone home screen from the browser.

## Smoke test

Use these checks before leaving the house:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/current-app
curl -o screenshot.png http://localhost:3000/screenshot
```

From the web remote:

- Confirm screenshot loads.
- Press Home.
- Launch YouTube TV.
- Launch Netflix.
- Type into a search field.
- Add the PWA to the phone home screen from the Tailscale HTTPS URL.

## Reliability checks

Before calling the install done:

- Reboot the Google TV and confirm `adb connect "$GOOGLE_TV_ADDR"` still works.
- Reboot the host and confirm FamilyTV starts again.
- Confirm the Tailscale machine has key expiry disabled.
- Confirm the phone can reach the Tailscale HTTPS URL off the parents' Wi-Fi.

## If ADB is flaky

Move the FamilyTV server to a Pi/host at the parents' house and keep ADB local.
That is the long-term deployment shape. ADB-over-Tailscale is useful for testing,
but local ADB is more likely to survive real use.
