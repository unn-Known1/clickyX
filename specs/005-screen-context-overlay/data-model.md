# Data Model: Screen Context & Overlay

## ScreenCapture

```rust
pub struct ScreenImage {
    pub data: Vec<u8>,       // JPEG-encoded image bytes
    pub width: u32,          // Image pixel width
    pub height: u32,         // Image pixel height
    pub monitor_id: u32,     // Monitor identifier
}

pub struct ScreenConfig {
    pub max_dimension: u32,  // Max image dimension (default: 1280)
    pub jpeg_quality: u8,    // JPEG compression quality (default: 80)
    pub cache_ttl_secs: u64, // Cache TTL for screenshots (default: 3)
}
```

## OverlayState

```rust
pub struct OverlayState {
    pub cursors: Vec<CursorOverlay>,
    pub rectangles: Vec<RectOverlay>,
    pub scribbles: Vec<ScribbleOverlay>,
    pub speech_bubble: Option<SpeechBubble>,
    pub agent_dock: Option<AgentDockPosition>,
}

pub struct CursorOverlay {
    pub x: f64, pub y: f64,
    pub label: Option<String>,
    pub accent: Option<String>,
    pub duration_ms: u64,
    pub animation: CursorAnimation,
}

pub enum CursorAnimation {
    None,
    BezierArc { from_x: f64, from_y: f64, progress: f64 },
}

pub struct RectOverlay {
    pub x: f64, pub y: f64, pub w: f64, pub h: f64,
    pub label: Option<String>,
}

pub struct ScribbleOverlay {
    pub points: Vec<(f64, f64)>,
    pub label: Option<String>,
}

pub struct SpeechBubble {
    pub text: String,
    pub x: f64, pub y: f64,
    pub streaming: bool,
    pub char_index: usize,
}

pub enum AgentDockPosition {
    Left, Right, Top, Bottom,
}
```

## CursorPosition

```rust
pub struct NormalizedPoint {
    pub x: f64,
    pub y: f64,
    pub display_id: u32,
}
```

## GuidanceOverlay (Frontend State)

```typescript
interface CursorState {
  id: string;
  x: number; y: number;
  label?: string;
  accent?: string;
  animation?: "bezier" | "none";
  fromX?: number; fromY?: number;
}

interface RectState {
  id: string;
  x: number; y: number;
  w: number; h: number;
  label?: string;
}

interface ScribbleState {
  points: [number, number][];
  label?: string;
}

interface CaptionState {
  text: string;
  x: number; y: number;
}
```

## OverlayPrefs

```rust
pub struct OverlayPrefs {
    pub cursor_accent: String,    // Default cursor accent color
    pub cursor_size: u32,         // Cursor size in pixels
    pub show_cursor: bool,        // Show/hide cursor overlay
    pub tutor_mode: bool,         // Tutor mode shows labels
    pub agent_dock_position: String, // "left" | "right" | "top" | "bottom"
}
```
