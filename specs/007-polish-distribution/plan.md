# Implementation Plan: Phase 7 — Polish & Distribution

## Steps

### 1. Spec Files
- [x] Create `specs/007-polish-distribution/` directory structure
- [ ] spec.md, plan.md, research.md, data-model.md
- [ ] contracts/tauri-commands.md, contracts/bridge-api.md
- [ ] tasks.md, quickstart.md

### 2. Settings UI — Full Implementation
- [ ] Create src/components/SettingsSections/ directory
- [ ] Implement GeneralSettings.tsx
- [ ] Implement VoiceSettings.tsx
- [ ] Implement AiProviderSettings.tsx
- [ ] Implement ComputerUseSettings.tsx
- [ ] Implement PermissionsSettings.tsx
- [ ] Implement SystemSettings.tsx
- [ ] Rewrite SettingsTab.tsx to orchestrate sections

### 3. Permission Management (Rust)
- [ ] Create src-tauri/src/permissions.rs with Permission enum and PermissionStatus struct
- [ ] Implement check_permission() per platform
- [ ] Implement request_permission() stubs
- [ ] Add to lib.rs and commands.rs

### 4. Auto-Updater (Rust)
- [ ] Create src-tauri/src/updater.rs with UpdateInfo struct
- [ ] Implement check_for_updates(), download_update(), install_update()
- [ ] Add to lib.rs and commands.rs
- [ ] Add tauri-plugin-updater to Cargo.toml

### 5. Build & Distribution Configuration
- [ ] Update tauri.conf.json with updater plugin config
- [ ] Add bundle targets for all platforms
- [ ] Create .github/workflows/ci.yml
- [ ] Create .github/workflows/release.yml

### 6. Documentation
- [ ] Update README.md
- [ ] Create docs/SETUP.md
- [ ] Create docs/CONFIGURATION.md
- [ ] Create docs/CONTRIBUTING.md

### 7. Code Signing Scripts
- [ ] Create scripts/sign-windows.ps1
- [ ] Create scripts/sign-macos.sh
- [ ] Create scripts/notarize-macos.sh

### 8. Frontend Polish
- [ ] Add error boundaries in App.tsx
- [ ] Toast notification system
- [ ] Skeleton loaders
- [ ] Tab transition animations
- [ ] Settings save confirmation animation

### 9. Performance & Logging
- [ ] Log levels throughout existing code
- [ ] Log file rotation
- [ ] Log viewer in System settings
- [ ] Lazy load tab components
- [ ] Debounce config saves

### 10. Extend Tauri Commands
- [ ] check_permission, request_permission
- [ ] check_for_updates, install_update
- [ ] get_logs, clear_logs
- [ ] export_config, import_config, reset_config
- [ ] get_app_version, toggle_tutor_mode, set_cursor_accent

### 11. Wiring
- [ ] Update lib.rs with new modules and commands
- [ ] Initialize auto-updater on startup
