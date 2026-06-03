# Tasks — Phase 7

## Spec Files
- [ ] Create spec.md
- [ ] Create plan.md
- [ ] Create research.md
- [ ] Create data-model.md
- [ ] Create contracts/tauri-commands.md
- [ ] Create contracts/bridge-api.md
- [ ] Create tasks.md
- [ ] Create quickstart.md

## Settings UI
- [ ] GeneralSettings.tsx (cursor, tutor mode, theme, glass, font, avatar, cursor size)
- [ ] VoiceSettings.tsx (voice model, realtime, deepgram, activation, captions, TTS, volume)
- [ ] AiProviderSettings.tsx (API keys for all providers, codex model, dock position)
- [ ] ComputerUseSettings.tsx (pointing model, CUA backend, native CUA)
- [ ] PermissionsSettings.tsx (status + request buttons)
- [ ] SystemSettings.tsx (Google Workspace, MCP, memory, logs, support)
- [ ] Rewrite SettingsTab.tsx

## Rust Backend
- [ ] permissions.rs — Permission enum, PermissionStatus, check/request
- [ ] updater.rs — UpdateInfo, check/download/install
- [ ] commands.rs — Add 12 new tauri commands
- [ ] lib.rs — Add mod, register commands, init updater
- [ ] Cargo.toml — Add tauri-plugin-updater

## Build & CI
- [ ] tauri.conf.json — Updater plugin config, bundle targets
- [ ] .github/workflows/ci.yml — Multi-platform CI
- [ ] .github/workflows/release.yml — Release workflow
- [ ] scripts/sign-windows.ps1 — Windows signing script
- [ ] scripts/sign-macos.sh — macOS signing script
- [ ] scripts/notarize-macos.sh — macOS notarization script

## Documentation
- [ ] README.md — Update with full project docs
- [ ] docs/SETUP.md — Developer setup guide
- [ ] docs/CONFIGURATION.md — Configuration reference
- [ ] docs/CONTRIBUTING.md — Contribution guide

## Frontend Polish
- [ ] App.tsx — Error boundaries, lazy loading, toast system
- [ ] theme.css — New animation and skeleton styles
- [ ] Logging improvements (log levels, rotation)
