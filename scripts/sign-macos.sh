#!/bin/bash
IDENTITY="$1"

if [ -z "$IDENTITY" ]; then
    echo "No signing identity provided. Skipping signing."
    exit 1
fi

echo "Using signing identity: $IDENTITY"

# Sign .app bundles — note: --deep is deprecated, --timestamp is required for notarization
find src-tauri/target/release/bundle -name "*.app" | while read app; do
  echo "Signing: $app"
  codesign --force --verify --verbose --timestamp \
    --sign "$IDENTITY" \
    --options runtime \
    --entitlements src-tauri/entitlements.plist \
    "$app" 2>&1 || echo "Signing failed for $app (non-fatal)"
done

# Sign DMG if present
find src-tauri/target/release/bundle -name "*.dmg" | while read dmg; do
  echo "Signing DMG: $dmg"
  codesign --force --timestamp --sign "$IDENTITY" "$dmg" 2>&1 || true
done

echo "macOS code signing complete."
