#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is not installed. See https://bun.sh (curl -fsSL https://bun.sh/install | bash), then run this again."
  exit 1
fi
command -v ffmpeg >/dev/null 2>&1 || echo "ffmpeg was not found: videos get no frame sheets or motion checks. Install it with your package manager."
[ -d node_modules ] || bun install
exec bun start
