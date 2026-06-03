# Quickstart — Phase 7

## Prerequisites
- Rust toolchain (nightly for some platforms)
- Node.js 24+
- Platform-specific build deps (see docs/SETUP.md)

## Setup
```sh
# Install dependencies
npm ci

# Build frontend
npm run build

# Build Tauri app (development)
npm run tauri dev

# Build for production
npm run tauri build
```

## Verification
```sh
cargo check        # Rust compilation check
cargo test         # Run Rust tests
npm run build      # Frontend build
```

## CI/CD
```sh
# CI runs automatically on push/PR
# Release workflow: .github/workflows/release.yml
# Manual trigger via GitHub Actions UI
```

## Code Signing (for distribution)
See `scripts/` directory:
- Windows: `sign-windows.ps1`
- macOS: `sign-macos.sh` + `notarize-macos.sh`

Signing requires CI secrets (certificates, keys) — see .github/workflows/release.yml.
