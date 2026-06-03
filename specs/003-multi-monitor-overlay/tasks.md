# Tasks: Multi-Monitor Overlay

## Phase 1: Screen Detection
- [x] T001 [P] Create screen_router.rs with ScreenManager and CoordinateNormalizer
- [x] T002 [P] Implement monitor detection via xcap::Monitor::all()

## Phase 2: Window Manager
- [x] T003 [P] Create window_manager.rs with OverlayWindowManager
- [x] T004 [P] Implement per-screen window creation, positioning, refresh

## Phase 3: Integration
- [x] T005 [P] Add screen-aware overlay functions to overlay/mod.rs
- [x] T006 Add get_screen_for_point utility

## Phase 4: Polish
- [ ] T007 Handle display hotplug (display-config-change event)
- [x] T008 Fallback to single overlay when only one monitor
