# Tauri Commands: Screen & Overlay

## Screen Capture

### `capture_screens`
- **Returns**: `Vec<CapturedScreen>` (base64 JPEG data)
- **Description**: Capture all connected monitors

### `capture_cursor_screen`
- **Returns**: `CapturedScreen`
- **Description**: Capture only the monitor containing the cursor

### `capture_focused_window`
- **Returns**: `Option<CapturedScreen>`
- **Description**: Capture foreground window (best effort)

## Overlay Control

### `show_cursor(x: f64, y: f64, label: Option<String>)`
- **Emits**: `show-cursor` event to overlay window

### `show_cursors(cursors: Vec<CursorData>)`
- **Emits**: `show-cursors` with array payload

### `show_rect(x: f64, y: f64, w: f64, h: f64, label: Option<String>)`
- **Emits**: `show-rect` to overlay window

### `show_scribble(points: Vec<[f64; 2]>, label: Option<String>)`
- **Emits**: `show-scribble` to overlay window

### `show_caption(text: String, x: f64, y: f64)`
- **Emits**: `show-caption` to overlay window

### `clear_overlay()`
- **Emits**: `clear-overlays` to overlay window

### `set_overlay_visible(visible: bool)`
- **Shows/hides**: the overlay window
