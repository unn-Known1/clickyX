# Feature Specification: Screen Context & Overlay

## Overview

Screen capture and cursor overlay system for ClickyX. This feature enables
the AI companion to see and interact with what's on the user's screen —
capturing screenshots, identifying elements, and rendering visual guidance
(cursors, rectangles, scribbles, captions) on a transparent overlay window.

**Driven by**: Phase 5 of `docs/FEATURE_SPEC.md` (Screen Context & Overlay).

---

## User Scenarios

### US1: AI captures screen for context

A user asks "What's on my screen?" or "Summarize this page." The AI captures
the current screen contents, optionally the focused window, and uses the image
as visual context for its response.

**Acceptance criteria**:
- Screen capture works across all monitors
- Focused window capture works (best effort per platform)
- Images are JPEG-compressed (max 1280px, quality 0.8)
- Captured images are cacheable (3s TTL)

### US2: Visual guidance overlay

The AI says "Click the Submit button" and draws a cursor ring around the
Submit button on screen. The user sees a visual indicator drawn by ClickyX.

**Acceptance criteria**:
- Cursor overlay shows at specified screen coordinates
- Multiple cursors can be shown simultaneously
- Rectangles overlay with optional labels
- Scribble/freehand drawing support
- Caption/speech bubble rendering
- All overlays can be cleared at once

### US3: AI performs clicks

The AI sends a click command through the bridge API (with user confirmation).
A click is simulated at the specified screen coordinates.

**Acceptance criteria**:
- Clicks can be triggered via bridge API
- Coordinates use screen-space (not window-space)

---

## Data Flow

```
User Query → AI Provider → Action (show cursor, click, etc.)
                              ↓
                         Tauri Backend
                              ↓
                    Tauri Event Bus → Overlay WebView
                    Bridge HTTP API → External Consumers
```

---

## Non-Goals

- OCR or element detection (future phase)
- Full screen recording / video capture
- Annotation editing tools
- Remote desktop control
