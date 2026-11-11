#!/usr/bin/env bash
# Installs the Bun that package.json's packageManager names, from Bun's GitHub release, checked
# against the release's SHASUMS256.txt.
set -euo pipefail
version="$(node -p 'require("./package.json").packageManager.replace(/^bun@/, "")')"
release="https://github.com/oven-sh/bun/releases/download/bun-v${version}"
dir="$(mktemp -d)"
cd "$dir"
curl -fsSL --retry 3 -o bun-linux-x64.zip "$release/bun-linux-x64.zip"
curl -fsSL --retry 3 -o SHASUMS256.txt "$release/SHASUMS256.txt"
grep ' bun-linux-x64.zip$' SHASUMS256.txt | sha256sum -c -
python3 -m zipfile -e bun-linux-x64.zip .
install -m 755 bun-linux-x64/bun /usr/local/bin/bun
ln -sf bun /usr/local/bin/bunx
bun --version
