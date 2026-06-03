<!--
Sync Impact Report
==================
Version change: (none) → 1.0.0 (initial creation)
Modified principles: N/A (first edition)
Added sections:
  - Project Identity
  - 6 Principles (Cross-Platform First, Feature Parity, No macOS Lock-In,
    Local-First Architecture, External Bridge Compatibility, Spec-Driven Development)
  - Governance (Amendment, Versioning, Compliance Review)
Removed sections: N/A
Templates requiring updates:
  - ⚠ pending: .specify/templates/plan-template.md (needs creation from speckit conventions)
  - ⚠ pending: .specify/templates/spec-template.md (needs creation from speckit conventions)
  - ⚠ pending: .specify/templates/tasks-template.md (needs creation from speckit conventions)
  - ✅ N/A: .opencode/commands/*.md (no CLAUDE-only references found; all already generic)
Follow-up TODOs:
  - None (all placeholders resolved for initial constitution)
-->

# Project Constitution

## Project Identity

**Project Name**: ClickyX

**Description**: Cross-platform port of OpenClicky — a system-tray AI
companion with voice, screen context, agent mode, cursor overlay, and
integrations. Rebuilt from scratch for Windows, Linux, and macOS using
cross-platform technologies.

**Tech Stack**: Tauri (Rust + web frontend), Rust for native system APIs,
React/Svelte for panel UI and settings.

## Principles

### Principle 1: Cross-Platform First

Every feature MUST have equivalent implementations for all three target
platforms (Windows, Linux, macOS). Platform-specific code MUST be isolated
behind a trait or abstraction layer with platform-agnostic interfaces.
Single-platform shortcuts or stubs are forbidden unless a documented
equivalence plan exists in the feature specification.

**Rationale**: The core purpose of ClickyX is to break OpenClicky's
macOS-only lock-in. Accepting platform gaps would defeat the project's
reason for existence.

### Principle 2: Feature Parity

Every feature in the OpenClicky original MUST have a documented migration
path in the feature specification. Deviations from the original behavior
MUST be explicitly listed with rationale. The external HTTP API at
`localhost:32123` MUST remain wire-compatible with OpenClicky's spec.

**Rationale**: Users migrating from OpenClicky should experience a seamless
transition. Parity is the baseline; improvements are additive on top.

### Principle 3: No macOS Lock-In

The codebase MUST NOT use Foundation, SwiftUI, AppKit, ScreenCaptureKit,
CGEvent taps, or any Apple-only framework. All system interactions MUST go
through platform-independent abstractions (Rust crates for native APIs,
Web APIs for UI). macOS-specific optimizations MAY be added only after the
cross-platform implementation is complete and proven.

**Rationale**: macOS-only code creates re-entrenchment risk. The project
must remain buildable on all three platforms from a single codebase.

### Principle 4: Local-First Architecture

All API keys MUST be user-configured and stored locally. The project MUST
NOT implement cloud key sync, hosted OAuth flows, Google/Apple login, or
any telemetry that sends API keys or conversation content to a
third-party service not explicitly chosen by the user. Feature
functionality MUST NOT depend on the availability of any cloud service
owned by the project maintainers.

**Rationale**: User trust and data sovereignty are non-negotiable for a
companion that has access to screen contents, microphone input, and
conversation history.

### Principle 5: External Bridge Compatibility

The external control bridge (HTTP + SSE on `localhost:32123`) MUST maintain
API-level compatibility with OpenClicky's bridge specification. Any
extension to the bridge API MUST be additive (new endpoints or optional
fields) and MUST NOT break existing clients. The bridge contract is
versioned and changes MUST follow semantic versioning for the bridge
protocol independently of the application version.

**Rationale**: Agents and automation scripts depend on a stable bridge
interface. Breaking changes ripple across the entire agent ecosystem.

### Principle 6: Spec-Driven Development

Every implementation phase MUST be preceded by a feature specification
(see `docs/FEATURE_SPEC.md`) and a technical plan. The constitution,
specification, plan, and tasks MUST be kept in sync. No code SHALL be
written for a feature whose spec has not passed a constitution compliance
check.

**Rationale**: Without spec-driven governance, cross-platform consistency,
feature parity, and architectural discipline degrade rapidly in a
complex multi-platform project.

## Governance

### Amendment Procedure

1. Any contributor MAY propose a constitution amendment by opening a
   pull request that modifies `.specify/memory/constitution.md`.
2. The Sync Impact Report at the top of the file MUST be updated to
   reflect the change.
3. Amendments MUST be reviewed and approved by the project maintainer
   before merging.
4. After merging, all dependent templates (plan-template.md,
   spec-template.md, tasks-template.md) MUST be updated if the amendment
   affects their structure or mandatory sections.
5. The `LAST_AMENDED_DATE` and `CONSTITUTION_VERSION` fields in the
   Governance section MUST be updated as part of the amendment.

### Versioning Policy

Constitution versioning follows Semantic Versioning 2.0.0:

- **MAJOR** (1.x → 2.0): Backward-incompatible governance changes,
  principle removal, or redefinition of an existing principle.
- **MINOR** (1.0 → 1.1): Addition of a new principle or materially
  expanded guidance for an existing principle.
- **PATCH** (1.0.0 → 1.0.1): Clarifications, wording corrections,
  typo fixes, or non-semantic refinements.

### Compliance Review

- Every feature spec MUST pass a constitution compliance check before
  implementation begins (enforced by `/speckit.analyze`).
- The compliance check verifies that all MUST-level principles are
  satisfied and that no principle is violated.
- Principle violations in spec or plan artifacts MUST be resolved by
  modifying the artifact — not by diluting the constitution.
- If a principle itself requires modification, a separate constitution
  amendment MUST precede any artifact changes that would otherwise
  violate the current constitution.

### Metadata

- **Ratification Date**: 2026-06-03
- **Last Amended Date**: 2026-06-03
- **Constitution Version**: 1.0.0
