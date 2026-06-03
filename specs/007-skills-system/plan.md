# Implementation Plan: Skills System

## Technical Context
- Stack: Node.js + HTTP bridge
- Libraries: fetch API (Node), existing localhost:32123 bridge
- Integration points: skills/ directory, scripts/validate-skills.js

## Constitution Check
- [x] Cross-Platform First — Node.js is cross-platform
- [x] Feature Parity — 63 spec skills, 4 bundled
- [x] No macOS Lock-In
- [x] Local-First Architecture — all skills connect to localhost bridge

## Implementation Phases

### Phase 0: Research
- Catalog skills from FEATURE_SPEC §7.1
- Determine JS entry point pattern

### Phase 1: Core Implementation
- Create skills/screen-control/: screenshot.js, screen-point.js, screen-caption.js
- Create skills/codex/manage-codex.js for Codex lifecycle
- Create skills/skill-template/ with example-skill.toml + .js scaffolding

### Phase 2: Tooling
- Create scripts/validate-skills.js — scan .toml ↔ .js pairing
- Create .specify/templates/skill-template.md

## Architecture Decisions
- .toml manifest per skill (name, description, entry_point, timeout)
- JS modules communicate via HTTP to localhost:32123 bridge
- Skill validation checks .toml ↔ .js pairing and basic structure
