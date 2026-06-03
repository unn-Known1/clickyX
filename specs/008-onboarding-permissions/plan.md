# Implementation Plan: Onboarding & Permissions

## Technical Context
- Stack: React + CSS + Tauri permission API
- Libraries: Tauri IPC (invoke)
- Integration points: src/components/OnboardingWizard.tsx, src/components/OnboardingWizard.css

## Constitution Check
- [x] Cross-Platform First — OS-specific permission hints per step
- [x] Feature Parity — matches OpenClicky first-run flow
- [x] No macOS Lock-In
- [x] Local-First Architecture

## Implementation Phases

### Phase 0: Research
- Map required permissions: microphone, screen_recording, accessibility, notifications
- Determine OS-specific guidance for each

### Phase 1: Core Implementation
- Create OnboardingWizard.tsx with 4 steps: Microphone → Screen Recording → Accessibility → Notifications
- Add per-step OS hints (Linux: pipewire, macOS: Settings, Windows: Privacy)
- Create OnboardingWizard.css with dark theme modal styles

### Phase 2: Integration
- Wire skip/finish flow
- Add permission check invocation for each step
- Integrate into main app as first-run modal

## Architecture Decisions
- Modal overlay (not separate window) — consistent with Settings tab
- Skip button at each step — users can configure later
- OS-specific hints in step description — reduces support burden
