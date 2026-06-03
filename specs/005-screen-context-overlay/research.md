# Research: Screen Capture Crates & Overlay Techniques

## Screen Capture Options

### xcap (v0.4)
- **Status**: Recommended
- **Platforms**: Windows (DXGI), Linux (PipeWire/X11), macOS (AVFoundation)
- **API**: `Monitor::all()` → `monitor.capture_image()`
- **Pros**: Only actively maintained cross-platform Rust screen capture crate
- **Cons**: Requires PipeWire on modern Linux; fallback to X11
- **License**: Apache 2.0 / MIT

### scrap
- **Platforms**: Windows, Linux (X11 only), macOS
- **Status**: Less maintained; no Wayland support
- **API**: Lower-level frame capture
- **Verdict**: Not recommended — lacks Wayland and is less actively maintained

### screenshots-rs
- **Status**: Unmaintained wrapper
- **Verdict**: Not recommended

## Click-Through Overlay Techniques

| Platform | Technique | API |
|----------|-----------|-----|
| Windows | WS_EX_TRANSPARENT + WS_EX_LAYERED | SetWindowLong / SetLayeredWindowAttributes |
| macOS | ignoresMouseEvents | NSWindow property |
| Linux (X11) | Input shape / _NET_WM_WINDOW_TYPE_DOCK | XShapeCombineRectangles / EWMH |
| Linux (Wayland) | wl_surface_set_input_region | Wayland protocol |
| Linux (wlroots) | layer-shell with keyboard interation disabled | zwlr_layer_shell_v1 |

## JPEG Encoding

- `image` crate with `jpeg` feature: `JpegEncoder::new_with_quality`
- Quality 80 provides good visual quality at ~3:1 compression for screenshots
- Max dimension 1280px prevents excessive memory use

## Coordinate Systems

| Platform | Origin | Y-axis |
|----------|--------|--------|
| Windows | Top-left | Down |
| Linux (X11) | Top-left | Down |
| macOS | Bottom-left (flipped) | Up |

macOS requires Y-flip transformation: `screen_y = display_height - capture_y`
