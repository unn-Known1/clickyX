# Tasks: Annotation Lifecycle Management

## Phase 1: Core Types
- [x] T001 [P] Create lifecycle.rs with AnnotationState, Annotation, now_ms()
- [x] T002 [P] Create manager.rs with AnnotationManager struct

## Phase 2: Manager Implementation
- [x] T003 [P] Implement add/get/complete/miss/sweep/clear in AnnotationManager
- [x] T004 [P] Add per-kind timeout config with Default impl

## Phase 3: Integration
- [x] T005 [P] Convert overlay.rs to overlay/mod.rs directory module
- [x] T006 Add lifecycle fields to CursorPayload, RectPayload, ScribblePayload, CaptionPayload
- [x] T007 [P] Wire start_lifecycle_sweep in lib.rs setup

## Phase 4: Verification
- [x] T008 Verify background sweep emits lifecycle-event for expired annotations
