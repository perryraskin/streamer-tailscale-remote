#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
fi

if command -v tailscale >/dev/null 2>&1; then
  bind_ip="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  if [ -n "$bind_ip" ]; then
    tmp_file=".env.tmp"
    awk -F= '$1 != "FAMILYTV_LISTEN_HOST" { print }' .env > "$tmp_file"
    printf 'FAMILYTV_LISTEN_HOST=%s\n' "$bind_ip" >> "$tmp_file"
    mv "$tmp_file" .env
  fi
fi

docker compose up -d --build
