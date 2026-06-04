#!/usr/bin/env bash
set -euo pipefail

APPLE_ID_USERNAME="${1:-}"
APPLE_ID_PASSWORD="${2:-}"
BUNDLE_DIR="${3:-src-tauri/target/release/bundle}"
BUNDLE_ID="com.clickyx.app"
TEAM_ID="${4:-}"

if [ -z "$APPLE_ID_USERNAME" ] || [ -z "$APPLE_ID_PASSWORD" ]; then
    echo "Apple ID credentials not provided. Skipping notarization."
    exit 0
fi

echo "Starting notarization..."

# Find first .app bundle
APP_BUNDLE=$(find "$BUNDLE_DIR" -name "*.app" -type d | head -1)

if [ -z "$APP_BUNDLE" ]; then
    echo "No .app bundle found. Skipping notarization."
    exit 0
fi

echo "Notarizing: $APP_BUNDLE"

# Create temporary zip archive for notarization
TMP_ZIP=$(mktemp -u).zip
ditto -c -k --keepParent "$APP_BUNDLE" "$TMP_ZIP"

# Submit for notarization
NOTARIZE_OUTPUT=$(xcrun notarytool submit "$TMP_ZIP" \
    --apple-id "$APPLE_ID_USERNAME" \
    --password "$APPLE_ID_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait 2>&1)

echo "$NOTARIZE_OUTPUT"

# Extract submission ID
SUBMISSION_ID=$(echo "$NOTARIZE_OUTPUT" | grep -o "id: [a-f0-9-]*" | head -1 | cut -d' ' -f2)

if [ -n "$SUBMISSION_ID" ]; then
    echo "Notarization submission ID: $SUBMISSION_ID"

    # Check notarization status
    xcrun notarytool log "$SUBMISSION_ID" \
        --apple-id "$APPLE_ID_USERNAME" \
        --password "$APPLE_ID_PASSWORD" \
        --team-id "$TEAM_ID"

    # Staple the ticket
    xcrun stapler staple "$APP_BUNDLE"
    echo "Stapling complete."
fi

# Clean up
rm -f "$TMP_ZIP"
echo "macOS notarization complete."
