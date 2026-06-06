# ClickyX Developer Setup Guide

## Prerequisites

### Common
- Node.js 22+
- Rust toolchain (stable, 1.77+)
- npm

### Linux (Ubuntu 22.04+)
```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libxdo-dev \
  libasound2-dev \
  libpulse-dev \
  libspeechd-dev
```

> [!NOTE]
> CI runs on `ubuntu-22.04` for glibc 2.35 compatibility. Using Ubuntu 20.04 or older is not supported.

### macOS
Xcode 15+ with command line tools:
```sh
xcode-select --install
```

### Windows
- Microsoft Visual Studio C++ Build Tools (MSVC toolchain)
- WebView2 (included in Windows 10 1803+ / Windows 11)
- No additional system libs required

## Quick Start

```sh
# Clone the repository
git clone https://github.com/unn-Known1/clickyX.git
cd clickyX

# Install Node dependencies
npm ci

# Run in development mode (hot-reload)
npm run tauri dev

# Build for production
npm run tauri build
```

Production artifacts land in `src-tauri/target/release/bundle/`:
- **Windows** — `.msi` and `.exe`
- **macOS** — `.dmg` and `.app`
- **Linux** — `.deb` and `.AppImage`

## Project Structure

```
clickyx/
├── src/                    # React frontend (TypeScript)
│   ├── components/         # UI components (tabs, settings sections, overlays)
│   ├── hooks/              # React hooks (react-query based)
│   ├── context/            # AppContext (toasts, navigation)
│   ├── store/              # Zustand global state
│   ├── overlay/            # Overlay-specific React app
│   ├── styles/             # CSS (theme tokens)
│   ├── bindings.ts         # Typed invoke() wrappers — use this, not raw invoke
│   └── App.tsx             # Root component
├── src-tauri/
│   ├── src/                # Rust backend
│   │   ├── audio/          # VAD, STT, TTS, wake word, pipeline
│   │   ├── ai/             # Providers, catalog, guidance tags
│   │   ├── agent/          # Codex sessions, skills, Google stub
│   │   ├── screen/         # xcap capture, auto-capture
│   │   ├── overlay/        # Window manager, screen router, lifecycle
│   │   ├── commands.rs     # Tauri command handlers
│   │   ├── bridge.rs       # HTTP API (localhost:32123)
│   │   └── lib.rs          # App setup
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri config
├── specs/                  # Feature specs (per-feature implementation plans)
├── scripts/                # Build helpers
├── docs/                   # Documentation
│   ├── PROJECT_SPEC.md     # Single source of truth
│   ├── CONFIGURATION.md    # Full config schema
│   ├── BRIDGE_API.md       # localhost:32123 endpoint reference
│   └── SETUP.md            # This file
└── e2e/                    # Playwright E2E + visual regression tests
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (browser only, no Tauri) |
| `npm run build` | Build frontend for production (tsc + vite) |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:visual` | Run Playwright visual regression |
| `npm run tauri dev` | Run full Tauri app in hot-reload dev mode |
| `npm run tauri build` | Build Tauri app for distribution |
| `cargo check` | Check Rust compilation (fast, no linking) |
| `cargo test --all-features` | Run all Rust unit tests |
| `cargo clippy` | Lint Rust code |
| `cargo fmt` | Format Rust code |

## Configuration

Config is auto-created on first run at the platform config directory:
- **Linux:** `~/.config/clickyx/config.json`
- **macOS:** `~/Library/Application Support/clickyx/config.json`
- **Windows:** `%APPDATA%/clickyx/config.json`

Full schema reference: [`docs/CONFIGURATION.md`](CONFIGURATION.md)

## Key Development Rules

Before writing code, read [AGENTS.md](../AGENTS.md). The critical rules are:

1. All `invoke()` calls must use typed wrappers in `src/bindings.ts`
2. All server data fetching must use `useQuery`/`useMutation` from react-query
3. New hooks under `src/hooks/` must have a `.test.ts` sibling
4. Never write platform-specific code without equivalents on all 3 platforms
5. Use `AppContext` for toasts and navigation, never `window.__`
