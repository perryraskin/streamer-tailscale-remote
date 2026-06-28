# Docker Deployment

This runs FamilyTV in Docker on a Linux host that has ADB paired with one or
more Google TV devices.

## Configure

```sh
cp .env.example .env
cp familytv.env.example familytv.env
```

Set `FAMILYTV_LISTEN_HOST` to the host's Tailscale IP, set
`FAMILYTV_ADB_HOME` to the host directory containing the authorized ADB keys,
and set `GOOGLE_TV_ADDR` in `familytv.env`.

## Start

```sh
./start.sh
```

The app is served on:

```text
http://<tailscale-ip>:<familytv-port>/
```

Expose the PWA through Tailscale Serve if you want an installable HTTPS URL:

```sh
sudo tailscale serve --bg --https=<serve-port> http://<tailscale-ip>:<familytv-port>
```

## Multiple Google TVs

Run one container per Google TV. Copy the second-TV example and create a second
private env file:

```sh
cp docker-compose.second-tv.example.yml docker-compose.second-tv.yml
cp familytv.env.example familytv-second.env
```

Set `FAMILYTV_SECOND_*` values in `.env`, then start both files together:

```sh
docker compose -f docker-compose.yml -f docker-compose.second-tv.yml up -d --build
```
