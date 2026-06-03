# Feature Specification: Cross-Platform CUA Click Execution

## Overview
Implement the actual computer-use-automation (CUA) click/type/key execution that exists as a no-op stub. The `enigo` crate is already in the tech stack plan; this feature wires it up for cross-platform input simulation (SendInput on Windows, libxdo on Linux, CGEvent on macOS).

## Users & Stakeholders
- **End users**: The AI can actually click and type on their behalf
- **Agents (Codex)**: The `click`/`openclicky_click` MCP tool actually executes actions
- **Developers**: Consistent `InputSimulator` trait across platforms

## User Stories
- **P1**: As a user, when the AI says "click the button", the click actually happens
- **P1**: As an agent developer, calling POST /click with coordinates results in a real mouse click
- **P2**: As a user, I can configure which CUA backend to use (native CUA vs background CUA)
- **P2**: As a developer, I want an `InputSimulator` trait with platform-specific impls

## Functional Requirements
1. **InputSimulator trait** with platform implementations:
   - `click(x, y, button)` — Move cursor and click
   - `double_click(x, y)` — Double-click at position
   - `type_text(text)` — Type keystrokes
   - `key_press(key)` — Press a single key
   - `move_cursor(x, y)` — Warp cursor to coordinates
   - `scroll(delta_x, delta_y)` — Scroll wheel

2. **Platform implementations**:
   - Windows: `SendInput` API via `enigo` crate
   - Linux: XTest/libxdo via `enigo` crate (X11), wtype/ydotool (Wayland)
   - macOS: `CGEvent` API via `enigo` crate

3. **CUA backend selector**:
   - Configurable in `ComputerUseConfig` (already exists as struct)
   - Options: `native` (cursor warp) or `background` (no cursor warp)
   - `native` = InputSimulator (moves real cursor)
   - `background` = Sends input events without warping visible cursor

4. **Bridge integration**:
   - Wire `POST /click` to call `InputSimulator::click()`
   - Return success/failure with coordinates clicked
   - Respect `ComputerUseConfig.native_cua` toggle

5. **Click validation**:
   - Log all click coordinates with timestamp
   - Minimum interval between clicks (configurable, default 100ms)
   - Safety bounds check: coordinates within valid screen area

## Success Criteria
- Click executes at exact pixel coordinates on all 3 platforms
- Type text produces correct characters in focused input field
- double_click triggers OS double-click behavior
- Background mode does not warp visible cursor
- Safety bounds prevent off-screen clicks

## Dependencies & Assumptions
- Requires `enigo` crate in `Cargo.toml` (check if already present)
- `ComputerUseConfig` struct exists in `src-tauri/src/config.rs` (lines 120-135)
- Bridge POST /click handler exists as stub in `bridge.rs` (lines 198-202)
- Out of scope: drag-and-drop, right-click context menus, gesture recognition
