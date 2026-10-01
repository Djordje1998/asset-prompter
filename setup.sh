#!/usr/bin/env sh
# One-time setup for Linux: installs Bun and ffmpeg if missing, prepares the app, makes the icon and starts it.
# Safe to run again: it skips whatever is already there.
set -e
APP="$(cd "$(dirname "$0")" && pwd)"
PATH="$HOME/.bun/bin:$PATH"
step() { printf '\n== %s\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1; }

# Installs system packages with whichever package manager this distribution has.
pkg() {
  if has apt-get; then sudo apt-get update -qq && sudo apt-get install -y "$@"
  elif has dnf; then sudo dnf install -y "$@"
  elif has pacman; then sudo pacman -S --noconfirm --needed "$@"
  elif has zypper; then sudo zypper install -y "$@"
  else return 1; fi
}

step "Bun (runs the app)"
if has bun; then
  echo "Already installed: bun $(bun --version)"
else
  has curl || pkg curl
  has unzip || pkg unzip
  curl -fsSL https://bun.sh/install | bash
  PATH="$HOME/.bun/bin:$PATH"
fi
has bun || { echo "Bun could not be installed. Install it from https://bun.sh and run setup again."; exit 1; }

step "ffmpeg (frame sheets and motion checks for videos)"
if has ffmpeg; then
  echo "Already installed."
else
  echo "Installing it needs your password (sudo)."
  pkg ffmpeg || echo "Could not install ffmpeg. The app works without it, but videos get no frame sheets. Install it with your package manager later."
fi

step "App packages"
cd "$APP" && bun install

step "Icon in the app menu and on the Desktop"
sh "$APP/scripts/make-shortcut.sh"

step "Starting Asset Prompter"
sh "$APP/scripts/start-hidden.sh"
printf '\nAll set. From now on, start it with the Asset Prompter icon.\n'
