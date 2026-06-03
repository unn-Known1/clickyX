# ClickyX

Cross-platform AI companion — a port of [OpenClicky](https://github.com/jasonkneen/openclicky) for Windows, Linux, and macOS.

> Note: This is a ground-up rebuild. OpenClicky is deeply tied to macOS-native frameworks (SwiftUI, AppKit, ScreenCaptureKit, CGEvent taps). ClickyX reimplements the same capabilities using cross-platform technologies.

## Overview

ClickyX is a system-tray AI companion that provides:
- Push-to-talk voice with screen-aware help
- Cursor overlay for pointing at UI elements
- Agent Mode (Codex runtime) for complex tasks
- Local AI provider integration (Claude, OpenAI, Deepgram)
- External control bridge (HTTP API for agents)
- Bundled skills system
- Plugable architecture

## Tech Stack (Recommended)

- **Tauri** (Rust + web frontend) for the app shell
- **Rust** for native system APIs (audio, screen capture, overlay)
- **React/Svelte** for panel and settings UI
- **WebSocket** for streaming AI responses

## Status

Early planning phase — see [FEATURE_SPEC.md](./docs/FEATURE_SPEC.md) for the full feature breakdown.
