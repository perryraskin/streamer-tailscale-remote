#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

PORT="${PORT:-3000}"
DEFAULT_GOOGLE_TV_ADDR="${DEFAULT_GOOGLE_TV_ADDR:-}"
TAILSCALE_SERVE_PORT="${TAILSCALE_SERVE_PORT:-8443}"
SERVE=0

usage() {
  cat <<'EOF'
Usage:
  scripts/start-familytv.sh [--addr <host:port>] [--serve] [--serve-port <port>]

Options:
  --addr <host:port>
                    Google TV ADB target. If omitted, uses GOOGLE_TV_ADDR,
                    DEFAULT_GOOGLE_TV_ADDR, or the single connected
                    `adb devices` entry.
  --serve           Publish the local web remote over Tailscale HTTPS with
                    `tailscale serve --https=$TAILSCALE_SERVE_PORT --bg
                    localhost:$PORT`.
  --serve-port <port>
                    Tailscale HTTPS port for --serve. Default: 8443.

Environment:
  GOOGLE_TV_ADDR    Same as --addr.
  DEFAULT_GOOGLE_TV_ADDR
                    Default ADB target when --addr/GOOGLE_TV_ADDR is omitted.
                    Usually unnecessary; prefer GOOGLE_TV_ADDR in .env.
  ENV_FILE          Env file to load before parsing arguments.
                    Default: ./google/.env.
  PORT              FamilyTV HTTP port. Default: 3000.
  TAILSCALE_SERVE_PORT
                    Same as --serve-port. Default: 8443.
  ADB_BIN           ADB binary. Default is handled by the app: adb.

Examples:
  scripts/start-familytv.sh --serve
  GOOGLE_TV_ADDR=<tv-name>.<tailnet>.ts.net:<adb-port> scripts/start-familytv.sh --serve
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --addr)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --addr" >&2
        exit 2
      fi
      GOOGLE_TV_ADDR="$2"
      shift 2
      ;;
    --serve)
      SERVE=1
      shift
      ;;
    --serve-port)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --serve-port" >&2
        exit 2
      fi
      TAILSCALE_SERVE_PORT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node is required. Install Node.js 18+ before running FamilyTV." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js/npm before running FamilyTV." >&2
  exit 1
fi

if ! command -v "${ADB_BIN:-adb}" >/dev/null 2>&1; then
  echo "adb is required. macOS: brew install android-platform-tools" >&2
  echo "Debian/Raspberry Pi OS: sudo apt install -y android-tools-adb" >&2
  exit 1
fi

cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm ci
fi

if [[ -z "${GOOGLE_TV_ADDR:-}" && -n "${DEFAULT_GOOGLE_TV_ADDR:-}" ]]; then
  GOOGLE_TV_ADDR="$DEFAULT_GOOGLE_TV_ADDR"
fi

if [[ -z "${GOOGLE_TV_ADDR:-}" ]]; then
  mapfile -t devices < <("${ADB_BIN:-adb}" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  if [[ "${#devices[@]}" -eq 1 ]]; then
    GOOGLE_TV_ADDR="${devices[0]}"
  else
    echo "Could not infer GOOGLE_TV_ADDR from adb devices." >&2
    echo "Set GOOGLE_TV_ADDR in google/.env, run adb connect <host:port>, or pass --addr <host:port>." >&2
    "${ADB_BIN:-adb}" devices >&2 || true
    exit 1
  fi
fi

echo "Using Google TV ADB target: $GOOGLE_TV_ADDR"
"${ADB_BIN:-adb}" connect "$GOOGLE_TV_ADDR" >/dev/null 2>&1 || true

if [[ "$SERVE" -eq 1 ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "tailscale is required for --serve." >&2
    exit 1
  fi
  echo "Serving FamilyTV over Tailscale HTTPS on port ${TAILSCALE_SERVE_PORT}..."
  tailscale serve --https="${TAILSCALE_SERVE_PORT}" --bg "localhost:${PORT}"
  tailscale serve status || true
fi

export GOOGLE_TV_ADDR PORT
exec npm start
