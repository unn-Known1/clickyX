# Dynamic Mouse-Follow Animations — Design & Implementation Report

**Request:** _"Add dynamic animations which follow the mouse arrow for different actions."_

**Status:** Implemented and verified (see [§4](#4-verification) and the companion
implementation notes). Scope is the **overlay window** (`src/overlay/`), which is the
transparent, always-on-top surface that already renders annotations, the cursor glow,
captions, and the pet.

---

## 1. Understanding the Request

The request has three ambiguities that must be pinned down before any code is written:
what an _action_ is, what _following the mouse_ means, and what makes an animation
_dynamic_.

### 1.1 "Different actions"

ClickyX already drives the overlay from a well-defined Rust-authored event stream
(`show-cursor`, `show-rect`, `show-scribble`, `show-caption`, `show-highlight`,
`show-shape`, plus `processing-*` / `waveform-*` lifecycle events). Those events map
one-to-one onto the things the AI actually does on screen. Rather than inventing a new
vocabulary, the nine distinct actions are taken **directly from the existing overlay
event stream** — no new IPC surface, no new Rust payloads:

| Action      | Source event / trigger            | Meaning                                        |
| ----------- | --------------------------------- | ---------------------------------------------- |
| `point`     | `show-cursor` (static/no anim)    | Guide the user's attention to a target         |
| `click`     | `lifecycle-event` `cursor*` done  | An AI-driven click landed                      |
| `select`    | `show-rect`                       | A region / bounding-box selection              |
| `highlight` | `show-highlight`                  | A region being called out (glow)               |
| `draw`      | `show-scribble`                   | A drawn scribble path                          |
| `speak`     | `show-caption`                    | Voice output / spoken caption                  |
| `guide`     | `show-shape` or animated cursor   | An arrow / curve guidance shape                |
| `listen`    | `waveform-start` … `waveform-end` | Microphone capture (**sustained**)             |
| `think`     | `processing-start` … `processing-end` | Model is working (**sustained**)           |

The actions split into two behavioural families:

- **Bursts** — a discrete, self-expiring animation spawned at a point in time
  (`point`, `click`, `select`, `highlight`, `draw`, `speak`, `guide`).
- **Auras** — a state that persists while the action is active and trails the pointer
  (`listen`, `think`).

### 1.2 "Follow the mouse arrow"

Two things move on screen: the **user's real OS cursor**, and the **AI's intent** (where
the annotation/effect should appear). The feature anchors its visuals to the live pointer
position, eased with a per-frame lerp so the effect _trails_ the cursor rather than
teleporting frame-to-frame. Concretely:

- Bursts are pinned to the viewport coordinate where they were spawned (they represent a
  one-off event, not a constant presence).
- The ambient **halo** and every **aura** live inside a single anchor element whose
  `transform` is updated by an internal `requestAnimationFrame` loop, easing 35% of the
  remaining distance each frame (`FOLLOW_EASE = 0.35`). When the layer activates it snaps
  onto the pointer first, so nothing slides in from screen-centre.

### 1.3 "Dynamic animations"

"Dynamic" is interpreted as: multi-keyframe CSS animations (not a static fade), driven by
the action's semantics, with a per-action lifetime. Each action gets a distinct visual
language instead of one generic pulse:

| Animation type                             | Used by                        |
| ------------------------------------------ | ------------------------------ |
| Expanding **ripple/ring** (`action-ring`)  | `point`                        |
| **Click** pop (`action-click`)             | `click`                        |
| Dashed **marching-ants rect** (`action-select`) | `select`                  |
| **Glow** pulse (`action-highlight`)        | `highlight`                    |
| **Dotted trail** (`action-draw`)           | `draw`                         |
| **Sound-arc** (`action-speak`)             | `speak`                        |
| **Chevron** sweep (`action-guide`)         | `guide`                        |
| Concentric **expanding rings** (`aura-listen`) | `listen` (aura)            |
| Rotating **dashed orbit** (`aura-think`)   | `think` (aura)                 |
| Breathing **halo** (`halo-breathe`)        | ambient, whenever the layer is active |

Colours are inherited from the overlay's `--accent` CSS variable so the animations track
the user's chosen accent variant automatically.

---

## 2. Implementation Steps

### Step 1 — A headless "engine" hook: `src/hooks/useMouseFollowActions.ts`

A single hook owns all animation **state and timing**, with no DOM knowledge:

- Exports the action vocabulary and metadata as the single source of truth:
  `MouseAction`, `CursorEffectKind` (`"burst" | "aura"`), `ACTION_EFFECT_META`
  (per-action `{ kind, durationMs }`), `MOUSE_ACTIONS`, `SUSTAINED_ACTIONS`,
  `MAX_ACTIVE_EFFECTS = 24`, `AURA_TRIGGER_MS`, `isSustainedAction`.
- Tracks the pointer in a **ref** (`mousemove` listener) so mouse movement never triggers
  a React re-render.
- `trigger(action, at?)` spawns a `CursorEffect` at the pointer (or explicit coords),
  caps the list at `MAX_ACTIVE_EFFECTS` (`prev.slice(-(MAX - 1))`), and schedules a
  `setTimeout` expiry tracked in a `timersRef` map. Triggering an aura action produces a
  finite burst of `AURA_TRIGGER_MS`.
- `setSustained(action, active)` idempotently adds/removes an aura.
- `clear()` cancels all timers and resets state; an unmount effect cancels any pending
  expiry timers (no leaks after the overlay closes).

### Step 2 — A presentational layer: `src/overlay/CursorActionLayer.tsx`

A `memo` component that renders pure visuals from props `{ effects, sustained }`:

- Returns `null` when idle (zero DOM cost when nothing is happening).
- Bursts render as `.cursor-action.cursor-action-<action>` with inline `left`/`top` and
  `animationDuration = durationMs`, `aria-hidden="true"`.
- Sustained auras and the ambient halo render inside a single `.cursor-follow-anchor`
  whose `transform: translate3d(x, y, 0)` is driven by an internal RAF loop (same
  isolation strategy as the existing `PetLayer`). Compositor-only transform keeps the
  60fps follow off the layout/paint path.

### Step 3 — Styles: `src/overlay/overlay.css`

183 lines appended (before the reduced-motion block):

- `.cursor-follow-anchor`, `.cursor-pointer-halo` (+ `@keyframes halo-breathe`).
- `.cursor-aura`, `.cursor-aura-listen` / `.cursor-aura-think` (+ their keyframes).
- `.cursor-action` base plus the seven per-action keyframe sets listed in §1.3.

### Step 4 — Wiring into the existing event system: `src/overlay/OverlayApp.tsx`

The hook is instantiated once, its results are fed to `<CursorActionLayer />` (rendered
above `<PetLayer />`), and every existing overlay listener gains a one-line trigger:

| Event                                              | Trigger                          |
| -------------------------------------------------- | -------------------------------- |
| `show-cursor` (animated) / (static)                | `triggerMouseAction("guide" / "point")` |
| `clear-overlays`                                   | `clearMouseActions()`            |
| `show-rect`                                        | `triggerMouseAction("select")`   |
| `show-scribble`                                    | `triggerMouseAction("draw")`     |
| `show-caption`                                     | `triggerMouseAction("speak")`    |
| `show-highlight`                                   | `triggerMouseAction("highlight")`|
| `show-shape`                                       | `triggerMouseAction("guide")`    |
| `processing-start` / `processing-end`              | `setMouseAura("think", true/false)` |
| `waveform-start` / `waveform-end`                  | `setMouseAura("listen", true/false)`|
| `lifecycle-event` (`state === "completed"`, `id` starts with `cursor`) | `triggerMouseAction("click")` |

The main `useEffect` dependency array was updated to
`[startStreamingCaption, triggerMouseAction, setMouseAura, clearMouseActions]`.

> **Important:** the Rust backend (`overlay/mod.rs`, `ai/guidance.rs`) and `bindings.ts`
> were **not** modified. All nine actions are derived from events and payloads that
> already existed, so the bridge/annotation contracts are untouched.

### Step 5 — Tests and docs

- `src/hooks/useMouseFollowActions.test.ts` — 11 cases: metadata length, sustained list,
  idle state, spawn-at-pointer, explicit coords, burst expiry, finite aura trigger,
  idempotent toggle, MAX cap, `clear()` + timer cancellation, unmount safety (fake timers).
- `src/overlay/CursorActionLayer.test.tsx` — 4 cases: idle `null`, burst positioned with
  correct classes, halo + one aura per sustained action, RAF moves the anchor transform.
- `AGENTS.md` file-map rows and a `CHANGELOG.md` "Unreleased › Added" bullet.

---

## 3. Systems Design Principles

**Modularity.** The feature is split along a single seam: the hook owns *what* and *when*
(state, timing, vocabulary); `CursorActionLayer` owns *how it looks* (DOM + RAF); the CSS
owns the *visual language*; `OverlayApp` only *wires* existing events to triggers. New
actions are added in exactly one place — `ACTION_EFFECT_META` — and flow automatically
through `MOUSE_ACTIONS`, `SUSTAINED_ACTIONS`, the cap logic, and (given a matching CSS
class) the layer.

**Performance.** The pointer is kept in a ref, not React state, so ~60fps `mousemove` does
not re-render the overlay tree. The follow loop is a self-contained RAF writing only a
compositor-friendly `translate3d`, mirroring `PetLayer`'s isolation. Bursts are capped at
`MAX_ACTIVE_EFFECTS = 24` so a fast event stream cannot grow the effect list unboundedly,
and each burst clears its own timer on expiry. The layer renders `null` when idle, so the
feature costs nothing when unused.

**Accessibility.** Every generated element is `aria-hidden="true"` (decorative). The
existing `.overlay-container * { animation: none !important }` reduced-motion rule still
governs, so users who request reduced motion get no animated effects. No new user-facing
strings were introduced, so i18n parity (EN/ES/FR/JA) is unaffected — `check-i18n.mjs`
stays green.

**Separation of concerns.** The Rust annotation engine, the overlay event stream, the
animation engine, the render layer, and the stylesheet each have one responsibility; no
layer reaches into another's domain. The backend and typed bindings are untouched, so the
`localhost:32123` bridge contract and the annotation parser are unchanged.

**Cross-platform.** The implementation is pure web-platform code (DOM + CSS keyframes +
`requestAnimationFrame`) with no platform-specific branches, consistent with the project's
cross-platform-first rule.

---

## 4. Verification

| Check                            | Result |
| -------------------------------- | ------ |
| `npx tsc -b --noEmit`            | exit 0 |
| `npx vitest run`                 | exit 0 — **186 passed / 26 files** (was 171; +15 new) |
| `npx eslint` (5 changed/new files) | exit 0 |
| `node scripts/check-i18n.mjs`    | exit 0 — full EN parity, no new strings |
| `npm run lint` (full)            | exit 0 — 58 pre-existing warnings, 0 errors |

CI is fire-and-forget per project rule 9. No Rust files were touched, so the Rust
compile/test legs are unaffected.

## 5. Known Limitations / Follow-ups

- The headless sandbox cannot launch the transparent overlay window, so the animation
  visuals themselves are covered by component tests (classes, positioning, RAF transform),
  not a pixel-level visual run. A manual pass on a real desktop is the remaining check.
- Bursts are pinned to their spawn coordinate rather than chasing the pointer afterward —
  intentional for discrete events, but a "trailing burst" variant could be added if
  desired.
- Aura stacking is supported (both `listen` and `think` can be active), but two auras
  render as concentric layers at the same anchor; a future refinement could offset them.

---

## 6. Re-verification pass — findings and fixes

A follow-up pass exercised the feature through its **real surface** (the Tauri
overlay event bus) rather than only the isolated hook/layer, and found two gaps.

### Finding 1 (critical): the follow could never see the real cursor

Overlay windows are created with `set_ignore_cursor_events(true)`
(`overlay/window_manager.rs`), i.e. they are **click-through**. A click-through
window is skipped during OS hit-testing, so it receives **no `mousemove` events** —
the single source the animation layer used for the pointer. On a real desktop the
pointer therefore stayed at the initial viewport centre: bursts spawned at the
screen centre and the halo/aura never followed. (The same latent issue affects the
pre-existing `PetLayer`.) This is the well-known Tauri overlay limitation that
`cursor_position` was added for.

**Fix:** new `src/hooks/useGlobalCursor.ts` — `mousemove` stays the primary source,
and when no move has been observed for 500 ms it falls back to Tauri's
`cursorPosition()` command, converting global physical pixels into window-local CSS
pixels via the window origin and `devicePixelRatio`. The fallback only runs while
the layer is active (idle overlay = zero IPC) and is **fail-safe**: if the command is
unavailable or denied it stops after a few tries and keeps native input, so it
cannot regress the previous behaviour. `core:default` already grants
`core:window:allow-cursor-position`, so no capability change was needed. Both the
engine and the render layer now share one pointer ref.

### Finding 2 (correctness): bursts ignored the action's own coordinates

Every annotation payload already carries its coordinates (`show-cursor.x/y`,
`show-rect.x/y/w/h`, `show-highlight`, `show-shape.x1/y1`, `show-scribble.points`,
`show-caption.x/y`), yet all bursts were spawned at the raw pointer. The engine's
`trigger(action, at?)` already accepted an explicit `at`, so the wiring now passes
the annotation coordinates (rect/highlight use their centre). The `click` burst,
which arrives later via `lifecycle-event` with no coordinates, reuses the last
cursor annotation's position.

### Verification after the fixes

| Check | Result |
| --- | --- |
| `npx tsc -b --noEmit` | exit 0 |
| `npx vitest run` | exit 0 — **195 passed / 28 files** (was 186/26) |
| `npx eslint` (7 changed/new source files) | exit 0 — no warnings |

New tests: `src/overlay/OverlayApp.test.tsx` drives the real event bus for all nine
actions and asserts annotation-anchored bursts, burst expiry, aura persistence, and
`clear-overlays`; `src/hooks/useGlobalCursor.test.ts` covers the primary path, the
inactive no-poll path, the `cursorPosition()` conversion, and poll-stop on failure.

---

## 7. Ten new features and settings

A Settings › Appearance › **Mouse Animations** section now exposes ten new
capabilities. Settings are local-first (`localStorage`, mirroring `useFocus`), so the
overlay window reads them synchronously at mount and there is no backend round-trip
and no unverifiable Rust change.

| # | Feature | Setting | Implementation |
| --- | --- | --- | --- |
| 1 | Master switch | on/off | `useMouseFollowActions` gates `trigger`/`setSustained`; an inert engine leaves the layer unrendered |
| 2 | Cursor trail | off / short / medium / long | `TRAIL_DOTS` (0/6/12/20); the layer's RAF writes each dot's transform from a ring buffer of recent anchor positions |
| 3 | Follow responsiveness | instant / smooth / lazy | `FOLLOW_EASE` (1.0 / 0.35 / 0.12) as the per-frame catch-up factor |
| 4 | Burst size | small / normal / large | `BURST_SIZE_PX` (32/44/60) applied as the `--cursor-burst-size` CSS var (the `guide` chevron scales proportionally at 0.6×) |
| 5 | Per-action toggles | 9 switches | `settings.actions` gates each action; a disabled aura action cannot be pinned |
| 6 | Action sounds | on/off | `Sounds.cursorAction()` on burst trigger (silent no-op when the asset is absent) |
| 7 | Idle pulse | on/off | `.cursor-idle-pulse` ring inside the follow anchor |
| 8 | Pointer halo | on/off | `.cursor-pointer-halo` toggled off |
| 9 | Burst cap | 8 / 16 / 24 | replaces the hardcoded `MAX_ACTIVE_EFFECTS` in the effect list |
| 10 | Colour override | colour picker + reset | inline `--accent` on the anchor and each burst; empty inherits the overlay accent |

`normalizeMouseAnimationSettings()` validates every persisted value (enum membership,
`maxEffects` membership, `#rrggbb` accent, boolean per-action flags) so a stale or
hand-edited `localStorage` entry can never produce an invalid configuration.

### Performance notes
The trail reuses the existing RAF loop and writes only `transform`/`opacity` on a
fixed set of nodes — no extra React renders. The option tables are module constants,
so the settings object is referentially stable between changes and the overlay's
listener effect is not re-subscribed. Reduced-motion still suppresses every animation.

### Verification
| Check | Result |
| --- | --- |
| `npx tsc -b --noEmit` | exit 0 |
| `npx vitest run` | exit 0 — **223 passed / 30 files** (was 195/28) |
| `npx eslint` (12 changed/new files) | exit 0 — no warnings |
| `npm run lint` (full) | exit 0 — 58 warnings / 0 errors (unchanged baseline) |
| `node scripts/check-i18n.mjs` | exit 0 — 627 keys, full EN parity |
| `codespell` (exact CI invocation) | exit 0 |
