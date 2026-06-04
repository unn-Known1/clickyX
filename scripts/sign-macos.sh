#!/bin/bash
IDENTITY="$1"

if [ -z "$IDENTITY" ]; then
    echo "No signing identity provided. Skipping signing."
    exit 0
fi

echo "Using signing identity: $IDENTITY"

# Sign .app bundles
find src-tauri/target/release/bundle -name "*.app" | while read app; do
  echo "Signing: $app"
  codesign --deep --force --verify --verbose \
    --sign "$IDENTITY" \
    --options runtime \
    --entitlements src-tauri/entitlements.plist \
    "$app" 2>&1 || echo "Signing failed for $app (non-fatal)"
done

# Sign DMG if present
find src-tauri/target/release/bundle -name "*.dmg" | while read dmg; do
  echo "Signing DMG: $dmg"
  codesign --force --sign "$IDENTITY" "$dmg" 2>&1 || true
done

echo "macOS code signing complete."
