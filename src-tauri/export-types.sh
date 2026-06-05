#!/bin/bash
# export-types.sh — Generate TypeScript bindings from Rust types via specta.
#
# Requirements:
#   [dev-dependencies] in Cargo.toml:
#     specta = { version = "2", features = ["export"] }
#     specta-typescript = "0.0.7"
#
# Usage:
#   cd src-tauri && ./export-types.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Exporting Rust types to ../src/bindings.generated.ts ..."

if cargo run --example export_types --features specta-export 2>/dev/null; then
  echo "Types exported to src/bindings.generated.ts"
else
  echo "specta export failed or feature not enabled."
  echo "To enable: add specta and specta-typescript to [dev-dependencies] in Cargo.toml"
  echo "See examples/export_types.rs for instructions."
  exit 1
fi
