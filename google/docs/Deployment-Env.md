# Deployment Environment

Keep machine-specific Tailscale names, ADB ports, and public FamilyTV URLs out
of Git. Commit only placeholders in `.env.example`; copy that file to a private
env file on the host that runs FamilyTV.

## Required host state

The FamilyTV host needs:

- Node.js 18+
- `adb`
- Tailscale logged into the same tailnet as the TV
- A paired ADB connection to the Google TV
- `GOOGLE_TV_ADDR` set to the TV's reachable ADB target

The TV needs:

- Tailscale installed and online, if the FamilyTV host controls it over the
  tailnet
- Developer Options enabled
- Wireless debugging enabled
- ADB paired with the FamilyTV host

## Private env file

For local runs:

```bash
cd google
cp .env.example .env
$EDITOR .env
```

Set:

```bash
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port>
PORT=3000
TAILSCALE_SERVE_PORT=8443
```

`GOOGLE_TV_ADDR` is the TV target. It is not the PWA or Siri URL.

The PWA/Siri URL is the FamilyTV host URL reported by:

```bash
tailscale serve status
```

Example shape:

```text
https://<familytv-host>.<tailnet>.ts.net:8443/
```

Use `/command` on that same host URL for Siri:

```text
https://<familytv-host>.<tailnet>.ts.net:8443/command
```

## Running on devpi

On `devpi`, the intended shape is:

```text
iPhone / Mac / AI agent
        |
     Tailscale
        |
devpi running FamilyTV + Tailscale Serve
        |
ADB over Tailscale or local LAN
        |
Google TV Streamer
```

Install:

```bash
git clone <repo-url> ~/familytv
cd ~/familytv/google
npm install
cp .env.example .env
$EDITOR .env
scripts/start-familytv.sh --serve
```

If running as a service, copy the env values into `/etc/familytv/google.env`
and use `deploy/familytv.service`.

## Systemd env

Create:

```bash
sudo mkdir -p /etc/familytv
sudo install -m 600 /dev/null /etc/familytv/google.env
sudoedit /etc/familytv/google.env
```

Example shape:

```bash
GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-connect-port>
PORT=3000
TAILSCALE_SERVE_PORT=8443
```

Then install the service:

```bash
sudo cp deploy/familytv.service /etc/systemd/system/familytv.service
sudo systemctl daemon-reload
sudo systemctl enable --now familytv
```

Publish HTTPS on the FamilyTV host:

```bash
tailscale serve --https="${TAILSCALE_SERVE_PORT:-8443}" --bg "localhost:${PORT:-3000}"
tailscale serve status
```

## Public repo rule

Do not commit:

- `google/.env`
- `/etc/familytv/google.env`
- real tailnet hostnames
- real tailnet suffixes
- account emails
- private IPs that identify the home network

Only `.env.example` belongs in Git.
