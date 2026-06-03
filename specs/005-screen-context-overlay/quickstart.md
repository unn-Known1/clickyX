# Quickstart: Screen Context & Overlay

## Dependencies

Add to `src-tauri/Cargo.toml`:
```toml
xcap = "0.4"
base64 = "0.22"
image = { version = "0.25", default-features = false, features = ["jpeg"] }
```

## Rust Module Structure

```
src-tauri/src/
  screen/
    mod.rs         — Module exports
    capture.rs     — Screen capture using xcap
    coordinate.rs  — Coordinate normalization
  overlay.rs       — Overlay types, commands, click-through
  config.rs        — +ScreenConfig, +OverlayPrefs
  commands.rs      — +Screen/overlay commands
  bridge.rs        — +Screen/overlay endpoints
  lib.rs           — Register modules + commands
```

## Overlay Architecture

```
[Backend]                [Tauri Event Bus]         [Overlay WebView]
  show_cursor()      →   "show-cursor" event   →   OverlayApp renders SVG cursor
  show_rect()        →   "show-rect" event      →   OverlayApp renders div rect
  show_scribble()    →   "show-scribble" event   →   OverlayApp renders SVG path
  show_caption()     →   "show-caption" event    →   OverlayApp renders speech bubble
  clear_overlay()    →   "clear-overlays" event  →   OverlayApp clears all state
```

## Vite Multi-Entry

Add to `vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "src/overlay/index.html",
      },
    },
  },
});
```

## Verification

```sh
cargo check          # Rust compilation check
npm run build        # Frontend + overlay build
```
