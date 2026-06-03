# Quickstart: Core Foundation

## Prerequisites

- Rust toolchain (rustup, cargo) — https://rustup.rs
- Node.js v18+ — https://nodejs.org
- Tauri v2 CLI: `cargo install tauri-cli --version "^2"`

**Platform-specific**:
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev
  libappindicator3-dev librsvg2-dev`
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Microsoft Visual Studio C++ Build Tools

## Scaffold Project

```bash
# Create the Tauri v2 project with React + TypeScript
npm create tauri-app@latest clickyx -- --template react-ts
cd clickyx

# Add Rust dependencies to src-tauri/Cargo.toml
# (see dependencies section below)
```

## Rust Dependencies

Add to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
actix-web = "4"
actix-rt = "2"
tokio = { version = "1", features = ["full"] }
dirs = "5"          # platform-standard config directories
```

## Project Structure

```
clickyx/
├── src/                    # React frontend
│   ├── App.tsx             # Root component with tab routing
│   ├── main.tsx            # Entry point
│   ├── components/
│   │   ├── HomeTab.tsx     # Hero + suggestions grid
│   │   └── SettingsTab.tsx # API keys, hotkeys, theme
│   ├── hooks/
│   │   └── useConfig.ts    # Tauri command wrappers
│   └── styles/
│       └── theme.css       # Light/dark/system theme variables
├── src-tauri/
│   ├── src/
│   │   ├── main.rs         # Tauri entry, tray, bridge startup
│   │   ├── tray.rs         # System tray setup and handlers
│   │   ├── bridge.rs        # actix-web HTTP server
│   │   ├── config.rs       # JSON config load/save
│   │   ├── overlay.rs      # Overlay window management
│   │   └── commands.rs     # #[tauri::command] functions
│   ├── Cargo.toml
│   ├── tauri.conf.json     # Tauri v2 config
│   └── icons/              # App and tray icons
└── package.json
```

## Development Workflow

```bash
# Start the Tauri dev server (hot-reloads frontend + Rust)
cargo tauri dev

# Or run frontend dev server separately
cd src && npm run dev
# Then in another terminal:
cargo tauri dev -- --no-frontend-dev-server
```

## Build

```bash
# Debug build
cargo tauri build --debug

# Release build
cargo tauri build
```

Output binaries in `src-tauri/target/release/`:
- Linux: `clickyx_*_amd64.AppImage`, `clickyx_*_amd64.deb`
- macOS: `ClickyX.app` bundle
- Windows: `ClickyX_x64.msi` or `ClickyX_x64-setup.exe`
