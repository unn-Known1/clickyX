# Research: Polish & Distribution

## Auto-Updater

Tauri v2 provides `tauri-plugin-updater` for automatic updates. The plugin:
- Checks a JSON endpoint for latest version metadata
- Downloads and applies updates
- Supports code signature verification

Endpoint format:
```
https://releases.clickyx.app/{{target}}/{{arch}}/{{current_version}}
```

Response format:
```json
{
  "version": "1.0.1",
  "notes": "Bug fixes",
  "pub_date": "2025-01-01T00:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "...", "url": "..." },
    "linux-x86_64": { "signature": "...", "url": "..." },
    "darwin-x86_64": { "signature": "...", "url": "..." },
    "darwin-aarch64": { "signature": "...", "url": "..." }
  }
}
```

## Permission APIs (Cross-Platform)

### Windows
- Microphone: `winapi` → `AvRtCreateThreadOrderingGroup` / WASAPI
- Screen Recording: Not a dedicated permission pre-Windows 11 22H2; screen capture APIs restricted
- Notifications: Registry-based via `AppUserModelID`

### Linux
- Microphone: PipeWire/PulseAudio D-Bus API
- Screen Recording: PipeWire portal (xdg-desktop-portal)
- Notifications: D-Bus (freedesktop notification spec)

### macOS
- Microphone: `AVCaptureDevice` authorization
- Screen Recording: `CGDisplayStream` / `SCContentSharingSession`
- Notifications: `UNUserNotificationCenter`
- Accessibility: `AXIsProcessTrusted`

## CI/CD Platforms

Tauri supports building on GitHub Actions via:
- `tauri-action` (community, but fragile)
- Manual setup with `tauri build`
- Cross-compilation not fully supported; native builds per OS required
- Caching Rust targets and Node modules critical for CI speed
