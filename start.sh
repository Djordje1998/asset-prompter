#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || bun install
exec bun start
