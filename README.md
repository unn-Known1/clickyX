# ClickyX

Cross-platform AI companion — a port of [OpenClicky](https://github.com/jasonkneen/openclicky) for Windows, Linux, and macOS.

ClickyX is a system-tray AI companion that provides push-to-talk voice, screen-aware AI assistance, cursor overlay guidance, agent mode, and external control via HTTP API.

## Prerequisites

- Node.js 24+
- Rust toolchain (stable)
- Platform-specific deps (see [docs/SETUP.md](docs/SETUP.md))

## Quick Start

```sh
npm ci
npm run tauri dev     # development mode
npm run tauri build   # production build
```

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React UI    │◄───►│  Tauri Bridge    │◄───►│  Rust Backend│
│  (Panel)     │     │  (IPC Commands)  │     │  (Audio,     │
│              │     │                  │     │   Screen,    │
│  Overlay     │     │  HTTP Bridge     │     │   AI, Agent) │
│  (WebView)   │     │  (127.0.0.1:     │     │              │
└──────────────┘     │   32123)         │     └──────────────┘
                     └──────────────────┘
```

## Features

- **Voice**: Push-to-talk, STT (Deepgram), TTS (ElevenLabs), wake word
- **Screen Context**: Screen capture, window capture, cursor-aware
- **AI Providers**: Anthropic (Claude), OpenAI (GPT), extensible provider system
- **Agent Mode**: Codex runtime with bundled skills
- **Cursor Overlay**: Animated cursor guidance, rectangles, scribbles, captions
- **System Tray**: Quick access panel, global hotkeys
- **External Bridge**: HTTP API for agent integration
- **Cross-platform**: Windows (MSI), Linux (AppImage, deb, rpm), macOS (DMG)

## Build Instructions

```sh
npm run build         # Frontend build
cargo check           # Rust compilation check
cargo test            # Run Rust tests
npm run tauri build   # Full production build
```

## Configuration

Config file (auto-created on first run):
- Linux: `~/.config/clickyx/config.json`
- macOS: `~/Library/Application Support/clickyx/config.json`
- Windows: `%APPDATA%/clickyx/config.json`

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for full reference.

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Feature Specification](docs/FEATURE_SPEC.md)

## License

MIT
