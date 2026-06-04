#!/usr/bin/env bash
set -euo pipefail

SIGNING_IDENTITY="${1:-}"
SEARCH_DIR="${2:-src-tauri/target/release/bundle}"

if [ -z "$SIGNING_IDENTITY" ]; then
    echo "No signing identity provided. Skipping signing."
    exit 0
fi

echo "Using signing identity: $SIGNING_IDENTITY"

# Sign .app bundles
find "$SEARCH_DIR" -name "*.app" -type d | while read -r app; do
    echo "Signing: $app"

    codesign --force --options runtime \
        --sign "$SIGNING_IDENTITY" \
        --deep \
        "$app"

    echo "Verifying signature..."
    codesign --verify --verbose=4 "$app"
done

# Sign .dmg files
find "$SEARCH_DIR" -name "*.dmg" -type f | while read -r dmg; do
    echo "Signing DMG: $dmg"

    codesign --force --options runtime \
        --sign "$SIGNING_IDENTITY" \
        "$dmg"

    codesign --verify --verbose=4 "$dmg"
done

echo "macOS code signing complete."
