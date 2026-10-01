#!/usr/bin/env sh
# Puts an "Asset Prompter" icon in the app menu and on the Desktop (Linux).
# It starts the server in the background (or just opens the browser if it already runs).
# This file lives in scripts/; the app folder is one level up.
APP="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$APP/scripts/start-hidden.sh"

ENTRY="[Desktop Entry]
Type=Application
Name=Asset Prompter
Comment=Start Asset Prompter
Exec=\"$APP/scripts/start-hidden.sh\"
Icon=$APP/src/web/favicon.svg
Terminal=false
Categories=Graphics;Utility;"

MENU="$HOME/.local/share/applications"
mkdir -p "$MENU"
printf '%s\n' "$ENTRY" >"$MENU/asset-prompter.desktop"
chmod +x "$MENU/asset-prompter.desktop"
echo "Created $MENU/asset-prompter.desktop"

DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP" ]; then
  cp "$MENU/asset-prompter.desktop" "$DESKTOP/asset-prompter.desktop"
  chmod +x "$DESKTOP/asset-prompter.desktop"
  # GNOME shows desktop launchers only once they are marked trusted.
  command -v gio >/dev/null 2>&1 && gio set "$DESKTOP/asset-prompter.desktop" metadata::trusted true 2>/dev/null
  echo "Created $DESKTOP/asset-prompter.desktop"
fi
echo "Done. Start it from the app menu or the Desktop icon. Run this again if you move the folder."
