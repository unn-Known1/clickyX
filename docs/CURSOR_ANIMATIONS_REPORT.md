# Cursor Actions and Scroll Feedback — Investigation & Implementation Report

**Status: implemented in the working tree; frontend verified; Rust/native verification pending.**

**Report date:** October 5, 2026
**Project:** ClickyX — Tauri v2 (Rust) + React/TypeScript desktop application
**Scope:** audit of the cursor-animation reports and source, correction of factual gaps, and wiring of directional scroll feedback through the CUA command and localhost bridge into the overlay.

This report is the consolidated record of the investigation and follow-up. It distinguishes source inspection and frontend test evidence from Rust/native behavior that could not be verified in this environment. No changes have been committed or pushed.

---

## 1. Executive summary

The cursor-animation UI already knew how to render three directional scroll ripples, and the animation hook already accepted a `scroll` action with an optional direction. The missing part was the product event path: successful OS scrolls did not trigger that action. A prior report incorrectly described the backend as having no scroll entrypoint.

Source inspection found two actual scroll paths:

1. Tauri command `cua_scroll` in `src-tauri/src/commands/cua_cmds.rs`.
2. Localhost HTTP bridge `scroll_handler` in `src-tauri/src/bridge.rs`.

Both call `InputSimulator::scroll` in `src-tauri/src/cua.rs`. Both now emit a best-effort app-wide Tauri event named `cua-scroll` after the OS scroll succeeds. The payload is one of `up`, `down`, `left`, or `right`, selected from the dominant scroll axis and delta sign. The overlay validates that payload, refreshes its own OS-cursor sample, and triggers the existing `scroll` burst at that screen’s local cursor position.

The bridge’s existing SSE `guidance_update` event and payload are unchanged. Event-emission failure is logged but does not turn a successful input operation into a reported scroll failure.

Frontend behavior is covered and frontend checks pass. The Rust changes, event emission in the actual desktop application, and real OS scrolling remain unverified because `cargo`/`rustc` are unavailable here.

---

## 2. Findings from the source audit

### 2.1 What was already implemented

- `src/hooks/useMouseFollowActions.ts` includes `scroll` in the typed `MouseAction` union. It is a time-bounded burst, carries an optional `ScrollDirection`, and respects the per-action and master animation settings.
- `src/overlay/CursorActionLayer.tsx` maps direction to rotation (`down: 0°`, `up: 180°`, `right: −90°`, `left: 90°`) and renders three ripple spans.
- `src/overlay/overlay.css` provides the scroll appearance and animation. Earlier CSS wiring and animation defects are recorded in the historical implementation details in this report’s predecessor; the current CSS was not changed for emitter wiring.
- `src/overlay/OverlayApp.tsx` already consumes a number of typed Tauri events for cursor, annotation, audio, and type-mode feedback.
- `src/hooks/useGlobalCursor.ts` already supplies a window-local pointer ref. On click-through overlay windows, OS cursor polling is needed because the webview generally receives no `mousemove` events.

### 2.2 The factual report gap

The earlier limitation text claimed that neither drag nor scroll had a backend event source. That was only accurate for drag. The Rust source already had the two scroll handlers above, and both already called `InputSimulator::scroll`; they simply did not notify the overlay animation layer.

There is still no corresponding CUA drag gesture lifecycle or drag operation to emit held-state start/end events. The drag ghost remains a hook-level feature, not a real product-triggered action.

### 2.3 Existing platform limitation

The existing `InputSimulator::scroll` implementation returns an unsupported error on Linux Wayland and says to install `ydotool`. Since the new feedback is emitted only after a successful `sim.scroll(...)`, a rejected scroll does not produce a ripple. This follow-up does not implement Wayland scrolling or change the behavior of the underlying input backend.

---

## 3. Scroll feedback implementation

### 3.1 Direction mapping and event contract

`src-tauri/src/cua.rs` now provides two helpers:

- `scroll_direction(delta_x, delta_y) -> Option<&'static str>`
- `emit_scroll_event(app, delta_x, delta_y) -> Result<(), String>`

Direction rules:

| Input | Result |
| --- | --- |
| Dominant vertical delta is positive | `down` |
| Dominant vertical delta is negative | `up` |
| Dominant horizontal delta is positive | `right` |
| Dominant horizontal delta is negative | `left` |
| Equal absolute deltas | Vertical axis wins (the comparison uses `>=`) |
| Both deltas have absolute value `<= 0.1` | No event |
| Either delta is non-finite | No event |

The positive/negative convention follows the existing Enigo scroll calls in `InputSimulator::scroll`: positive distance is used as down/right and negative as up/left. Direction-only data is sufficient; command coordinates are not sent to overlays because each per-screen overlay needs its own local coordinates.

The event name is `cua-scroll`; the serialized payload is the direction string itself. Tauri app-wide emission makes the event available to the overlay webviews without changing the bridge protocol.

### 3.2 Input-path wiring

- **Tauri CUA:** `cua_scroll` first calls `sim.scroll(...)`. If input fails, it returns that error and emits no animation event. If input succeeds, it attempts `emit_scroll_event`. An event-emission error is logged as a warning; the command still returns success because the requested OS operation already succeeded.
- **Localhost bridge:** `scroll_handler` follows the same success-first/best-effort-event pattern. Its existing bridge SSE `guidance_update` event remains in the success path with its existing action, coordinate, and delta fields.
- **No protocol break:** no existing HTTP route, request field, Tauri command signature, or SSE event was replaced or renamed.

### 3.3 Overlay and cursor placement

`OverlayApp` subscribes to `cua-scroll`, rejects values outside the four allowed directions, and requests a one-shot cursor refresh before triggering the scroll burst. This matters because the click-through webview cannot rely on an in-window mouse event at scroll time.

`useGlobalCursor` now exposes `refresh()`, which obtains the current OS cursor and window origin, converts physical desktop coordinates into this overlay window’s CSS coordinates using `devicePixelRatio`, updates the existing mutable ref, and returns the sample. If the Tauri call fails it returns `null`; the overlay then falls back to the ref’s last-known location rather than preventing the effect entirely.

The existing hook owns the one cursor poller used by the cursor-action layer and pet sprite. A `keepCursorActive` option lets the hook keep that poller alive when the pet is visible, while effects/aura state still activate it as before. The one-shot refresh does not create another polling loop.

### 3.4 Tests added

- `src-tauri/src/cua.rs`: Rust unit cases cover all four directions, dominant-axis selection, vertical tie-breaking, negligible deltas, and non-finite values. These tests are present but were **not run** because Rust tooling is unavailable.
- `src/hooks/useGlobalCursor.test.ts`: checks an on-demand OS cursor refresh while background polling is inactive, including physical-to-local coordinate conversion.
- `src/overlay/OverlayApp.test.tsx`: exercises the `cua-scroll` event surface, fresh cursor position, rightward CSS rotation, the three ripple elements, and rejection of an invalid direction.

The frontend tests mock the Tauri event bus and cursor IPC. They verify the frontend contract, not native app event delivery or actual Enigo scrolling.

---

## 4. Systems design principles applied

1. **Separate input mechanism from presentation.** `InputSimulator` remains the OS-input mechanism; the small event helper translates successful scroll deltas into a presentation event. The React overlay owns rendering and cursor-local placement.
2. **Keep one action with data, not four action variants.** Direction is a property of the scroll effect, not separate `scroll-up`, `scroll-down`, etc. actions. Existing settings, metadata, and burst lifecycle remain shared.
3. **Use a minimal, typed event contract.** The event contains one validated direction string. It does not expose new public HTTP fields or duplicate coordinates that have different coordinate spaces per display.
4. **Preserve compatibility and fail open for decoration.** The existing bridge SSE event is untouched. A visual-event failure is logged but does not retroactively make successful OS input fail.
5. **Respect display-local coordinates.** Each overlay refreshes its own OS cursor sample and converts it to its own local CSS coordinates; the backend does not guess which monitor/window coordinate system a ripple should use.
6. **Avoid unnecessary polling and renders.** Scroll uses the existing cursor ref/poller. The new one-shot refresh is only used when an input event needs a current point; pointer animation continues to use refs/RAF rather than React state updates per frame.
7. **Bound and validate inputs.** Direction is restricted to a four-value union in TypeScript and validated at the event boundary. Zero-ish/non-finite Rust deltas do not create meaningless animation events. Existing burst expiry and effect caps continue to bound UI state.
8. **Cross-platform by sharing the existing backend.** No new OS-specific scroll code was added; both input routes already use the shared `InputSimulator`. This does not imply every platform backend works—the existing Wayland limitation remains.

---

## 5. Other findings and already-fixed gaps in the animation work

The report audit also retained these previously identified feature findings so they are not lost:

- **Typing animation visibility:** a missing `@keyframes action-typing` had left a typing container at the base opacity. The keyframe and static CSS-wiring test were added in the earlier animation work.
- **Preset label:** selecting the `off` preset could be relabeled `custom`; `matchPreset()` now recognizes the disabled master state before comparing named bundles.
- **Pet cursor tracking:** the click-through overlay prevented normal `mousemove` tracking for the pet. A shared cursor source now serves the pet and action layer, with polling only active while either consumer needs it.
- **Drag emitter:** investigation confirmed no drag-operation API or held mouse gesture lifecycle currently provides start/end events. The visual ghost exists but is not triggered by a real drag operation. No drag API was invented as part of this scroll-specific fix.
- **Scroll emitter:** corrected from “no backend scroll entrypoint” to “backend paths existed but had no overlay feedback”; the feedback path is now wired as described above.

The earlier feature work also includes named local-first animation presets and generated sound assets. Those features are not modified by this scroll follow-up. Their original verification claims are historical and should not be conflated with verification of the new Rust event path.

---

## 6. Verification results

| Check | Result | Scope / caveat |
| --- | --- | --- |
| `npx tsc -b --noEmit` | **Passed** | Current frontend follow-up as checked after the source changes. |
| `npm test` | **Passed: 260 tests, 31 files** | Full Vitest suite; includes the new cursor-refresh and overlay event tests. |
| `npx eslint src/hooks/useGlobalCursor.ts src/hooks/useGlobalCursor.test.ts src/hooks/useMouseFollowActions.ts src/overlay/OverlayApp.tsx src/overlay/OverlayApp.test.tsx` | **Passed** | Changed frontend files; clean output. |
| `git diff --check` | **Passed** | No whitespace errors in the worktree diff. |
| `cargo check` | **Blocked / not run** | `cargo` is unavailable in this environment. |
| `cargo test --all-features` | **Blocked / not run** | Requires the unavailable Rust toolchain. Rust direction tests have not executed. |
| Native Tauri event delivery and actual OS scroll | **Unverified** | No runnable desktop shell/display and no Rust toolchain here; frontend mocks cannot prove native delivery. |
| Linux Wayland scroll | **Known unsupported in current backend** | Existing `InputSimulator::scroll` returns an error and directs users to `ydotool`; no ripple is emitted on that failure path. |

Earlier reports recorded frontend test/build/lint checks and a separate 22-check Chromium harness for the pre-follow-up animation implementation. Those historical checks do not verify the current Rust emitter. The current frontend test suite is 260 passing tests, not the earlier 258 count.

---

## 7. Current status and remaining work

**Implemented in the current worktree:** Rust direction selection and event-emission helper; best-effort event hooks in both successful scroll paths; overlay event validation and directional ripple trigger; a fresh OS cursor sample for per-screen placement; frontend and Rust unit tests; and corrected investigation reports.

**Verified:** TypeScript, the complete frontend test suite, ESLint on edited frontend files, and diff whitespace checks all pass.

**Not yet verified:** Rust compilation and Rust unit tests; successful event delivery from a running Tauri app into each native overlay; actual OS scrolling/ripple coordination on Windows, macOS, and Linux; and behavior on each compositor/display scaling arrangement. The Linux Wayland scroll backend is a known existing limitation.

The feature should therefore be described as **frontend-verified and source-wired, but not native-verified**. Run `cargo fmt --check`, `cargo check`, and the relevant Rust tests in a Rust-enabled environment, then exercise the Tauri command and bridge scroll paths on supported desktop platforms before calling native behavior verified. No commit, push, deployment, or delivery action was performed.
