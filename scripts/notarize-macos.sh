#!/usr/bin/env bash
set -euo pipefail

APPLE_ID_USERNAME="${1:-}"
APPLE_ID_PASSWORD="${2:-}"
BUNDLE_DIR="${3:-src-tauri/target/release/bundle}"
BUNDLE_ID="com.clickyx.app"
TEAM_ID="${4:-}"

if [ -z "$APPLE_ID_USERNAME" ] || [ -z "$APPLE_ID_PASSWORD" ]; then
    echo "Error: Apple ID credentials not provided. Skipping notarization."
    exit 1
fi

if [ -z "$TEAM_ID" ]; then
    echo "Error: TEAM_ID not provided. Skipping notarization."
    exit 1
fi

echo "Starting notarization..."

# Find first .app bundle
APP_BUNDLE=$(find "$BUNDLE_DIR" -name "*.app" -type d | head -1)

if [ -z "$APP_BUNDLE" ]; then
    echo "Error: No .app bundle found. Skipping notarization."
    exit 1
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

# Check for success — notarytool outputs "status: Accepted" on success
if ! echo "$NOTARIZE_OUTPUT" | grep -q "status: Accepted"; then
    echo "Error: Notarization failed. See output above."
    rm -f "$TMP_ZIP"
    exit 1
fi

# Extract submission ID
SUBMISSION_ID=$(echo "$NOTARIZE_OUTPUT" | grep -o "id: [a-f0-9-]*" | head -1 | cut -d' ' -f2)

if [ -z "$SUBMISSION_ID" ]; then
    echo "Error: Could not extract notarization submission ID."
    rm -f "$TMP_ZIP"
    exit 1
fi

echo "Notarization submission ID: $SUBMISSION_ID"

# Check notarization status
xcrun notarytool log "$SUBMISSION_ID" \
    --apple-id "$APPLE_ID_USERNAME" \
    --password "$APPLE_ID_PASSWORD" \
    --team-id "$TEAM_ID"

# Staple the ticket
xcrun stapler staple "$APP_BUNDLE"
echo "Stapling complete."

# Clean up
rm -f "$TMP_ZIP"
echo "macOS notarization complete."
