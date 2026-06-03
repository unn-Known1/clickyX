# Feature Specification: Polish & Distribution

## Overview

Phase 7 finalizes ClickyX for production distribution. This includes a complete Settings UI, permission management, auto-updater integration, CI/CD pipelines, code signing, build configuration for all platforms, comprehensive documentation, and frontend polish (error handling, loading states, animations).

**Driven by**: Phase 7 of `docs/FEATURE_SPEC.md` (Polish & Distribution).

---

## User Scenarios

### US1: User configures all app settings from Settings UI

A user opens the Settings panel from the tray menu and sees organized sections for General, Voice, AI Providers, Computer Use, Permissions, Agents, Automations, and System & Logs.

**Acceptance criteria**:
- All setting changes persist to config.json.
- Changes apply immediately where possible.
- Sensitive fields (API keys) use password masking.

### US2: User checks and requests permissions

A user navigates to Permissions in Settings and sees the status of Microphone, Screen Recording, and Notifications permissions. They can tap Request to open the OS permission dialog.

**Acceptance criteria**:
- Permission status is accurately reported per platform.
- Request button dispatches the appropriate OS prompt.
- Unsupported platforms show a clear message.

### US3: Application auto-updates

When a new release is available, the app checks on startup and notifies the user. The user can download and install the update.

**Acceptance criteria**:
- Check for updates on startup.
- Display available version and release notes.
- Download progress is reported.
- Install triggers restart.

### US4: CI builds and releases

Every push and pull request triggers a build on all three platforms. Releases are published as GitHub Releases with signed platform binaries.

---

## Security Considerations

- API keys stored in plaintext at user's config dir — encrypted storage deferred to post-1.0.
- Code signing prevents tampering — signing scripts are templates requiring CI secrets.
- Auto-updater validates signatures against a public key.
- Permission requests use platform-native dialogs.

---

## Dependencies

- `tauri-plugin-updater` for auto-update mechanism.
- Platform signing tools (signtool on Windows, codesign on macOS).
- GitHub Actions for CI/CD.
