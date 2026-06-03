# Feature Specification: Onboarding & Permissions UI

## Overview
Create a first-run onboarding wizard that guides users through permission setup (microphone, screen recording, accessibility, notifications) with visual explanations, and a permissions dashboard in Settings for ongoing management. The macOS original has a "drag-to-accept" permission guide; clickyX needs a cross-platform equivalent.

## Users & Stakeholders
- **New users**: First-run experience that explains what permissions are needed, why, and how to grant them
- **Existing users**: Permissions dashboard to see status and re-trigger permission requests
- **Developers**: Reusable permission-grant flow components

## User Stories
- **P1**: As a new user, I see an onboarding wizard on first launch that guides me through permission setup
- **P1**: As a user, I can check permission status in Settings and re-request if denied
- **P2**: As a user, I can skip onboarding and configure permissions later
- **P2**: As a user, I see visual explanations of why each permission is needed

## Functional Requirements
1. **Onboarding wizard** (first-launch modal):
   - Welcome screen with app name, tagline, and "Get Started" button
   - Step-by-step permission request flow: Microphone → Screen Recording → Accessibility → Notifications
   - Each step shows: icon, what the permission enables, OS-specific instructions for granting
   - Progress indicator (step 1 of 4, etc.)
   - "Skip" button at each step; skipped permissions can be completed later
   - Final screen: "You're all set!" with quick-start tips

2. **Permissions dashboard** (Settings tab):
   - List of all required permissions with status indicator (granted/denied/not-requested)
   - "Request" button next to each un-granted permission
   - OS-specific help text explaining how to grant each permission
   - "Check Status" button that re-evaluates current permission state

3. **Platform-specific guidance**:
   - Windows: Screenshot showing Windows Settings → Privacy & Security
   - Linux: Distro-specific instructions (GNOME Privacy settings, PipeWire config)
   - macOS: System Settings → Privacy & Security path

4. **State persistence**: Store onboarding completion status in config (`config.onboarding_completed`)

## Success Criteria
- Onboarding wizard appears exactly once (on first launch after config reset)
- Each permission step accurately reflects the OS-specific grant flow
- Permissions dashboard updates in real-time when permissions change
- 100% of users complete onboarding in <2 minutes
- Skipped permissions are clearly marked in the dashboard

## Dependencies & Assumptions
- Requires `src-tauri/src/permissions.rs` platform stubs (already exist, lines 42-214)
- Onboarding state stored in existing config system
- Uses Rust backend's permission check/request functions via Tauri commands
- Out of scope: animated permission video tutorials, auto-detection of permission grant
