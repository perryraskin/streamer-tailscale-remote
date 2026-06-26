# Quick Parents' Setup

Use this as the short version when moving the Google TV Streamer to the parents'
house.

1. Factory reset the Google TV.
2. Plug it in at the parents' house.
3. Set it up with **only their Google account**.
4. Install and sign into their streaming apps.
5. Confirm the normal physical remote works.
6. Enable Developer Options:

   ```text
   Settings -> System -> About -> Android TV OS build
   ```

   Click repeatedly until Developer Options are enabled.

7. Enable Wireless Debugging:

   ```text
   Settings -> System -> Developer options -> Wireless debugging
   ```

8. On the host at their house, ideally a Pi or always-on PC, install Tailscale,
   Node, and ADB.
9. Pair ADB from that host:

   ```bash
   adb pair <tv-name>.<tailnet>.ts.net:<pairing-port>
   adb connect <tv-name>.<tailnet>.ts.net:<adb-connect-port>
   ```

10. Start FamilyTV:

    ```bash
    cd google
    cp .env.example .env
    $EDITOR .env
    scripts/start-familytv.sh --serve
    ```

11. Open the Tailscale HTTPS URL on your phone and add the PWA to the home
    screen.
12. Create the Siri Shortcut using that same `/command` URL.
13. Smoke test:
    - Screenshot
    - Home
    - Open YouTube TV
    - Open Netflix
    - Type/search

Main deployment choice: for the permanent install, run FamilyTV + Tailscale on a
Pi or always-on host at their house. Keep ADB local there.

Set `GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port>` in the
private `.env`. If Wireless debugging gives the TV a new ADB connect port
later, keep the hostname and replace only the port.
