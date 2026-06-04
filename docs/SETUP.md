# ClickyX Developer Setup Guide

## Prerequisites

### Common
- Node.js 24+
- Rust toolchain (stable, 1.77+)
- npm

### Linux (Ubuntu/Debian)
```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libxdo-dev \
  libasound2-dev \
  libpulse-dev
```

### macOS
Xcode 15+ with command line tools:
```sh
xcode-select --install
```

### Windows
- Microsoft Visual Studio C++ Build Tools
- WebView2 (included in Windows 10 1803+)

## Quick Start

```sh
# Clone the repository
git clone https://github.com/unn-Known1/clickyX.git
cd clickyX

# Install Node dependencies
npm ci

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
clickyx/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # React hooks
│   ├── styles/             # CSS
│   └── App.tsx             # Root component
├── src-tauri/
│   ├── src/                # Rust backend
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri config
├── specs/                  # Feature specs
├── scripts/                # Build scripts
└── docs/                   # Documentation
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend for production |
| `npm run tauri dev` | Run Tauri app in dev mode |
| `npm run tauri build` | Build Tauri app for distribution |
| `cargo check` | Check Rust compilation |
| `cargo test` | Run Rust tests |
| `cargo clippy` | Lint Rust code |

## Configuration

Config is stored at the platform config directory:
- Linux: `~/.config/clickyx/config.json`
- macOS: `~/Library/Application Support/clickyx/config.json`
- Windows: `%APPDATA%/clickyx/config.json`
