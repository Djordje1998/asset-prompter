#!/usr/bin/env sh
# Starts Asset Prompter in the background and opens it in the browser.
# Clicking again while it runs (or while it is still starting) only opens the browser.
# This file lives in scripts/; run from the app folder one level up, where the lock, log and packages are.
cd "$(dirname "$0")/.." || exit 1
URL="http://127.0.0.1:4777"
# Launchers from the desktop do not read the shell profile, where Bun usually adds itself.
PATH="$HOME/.bun/bin:$PATH"

up() {
  if command -v curl >/dev/null 2>&1; then curl -fs -m 1 "$URL/api/state" >/dev/null 2>&1
  else wget -q -T 1 -O /dev/null "$URL/api/state" 2>/dev/null; fi
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open "$URL"; fi
}

fail() {
  if command -v notify-send >/dev/null 2>&1; then notify-send "Asset Prompter" "$1"; fi
  echo "$1" >&2
  exit 1
}

if ! up; then
  # A start begun by another click in the last 30 seconds is still coming up: wait for it instead.
  if [ -z "$(find .starting -newermt '30 seconds ago' 2>/dev/null)" ]; then
    command -v bun >/dev/null 2>&1 || fail "Bun is not installed. See https://bun.sh"
    touch .starting
    [ -d node_modules ] || bun install >/dev/null 2>&1
    NO_OPEN=1 nohup bun start >server.log 2>&1 &
  fi
  i=0
  while ! up; do
    i=$((i + 1))
    [ "$i" -gt 30 ] && { rm -f .starting; fail "The server did not start. See server.log in $(pwd)"; }
    sleep 1
  done
  rm -f .starting
fi
open_browser
