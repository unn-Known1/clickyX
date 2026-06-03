# Feature Specification: Skills System Completion

## Overview
Complete the bundled skills system by creating the missing entry-point JavaScript files referenced by the existing `.toml` skill descriptors, and expand the skill catalog from 4 to cover the essential skill categories. The macOS original ships 28+ skills; the FEATURE_SPEC catalogs 63.

## Users & Stakeholders
- **End users**: Access useful agent skills (screenshot, screen-point, codex management, etc.)
- **Agent runtime (Codex)**: Skills load without "entry point not found" errors

## User Stories
- **P1**: As a user, I want existing skills (screenshot, screen-point, screen-caption, manage-codex) to work end-to-end
- **P2**: As a user, I want additional essential skills: research-reports, email-assistant, repo-operator
- **P2**: As a developer, I want a skill scaffolding tool to create new skills consistently

## Functional Requirements
1. **Fix existing skills**: Create the `.js` entry-point files referenced by existing `.toml` skill descriptors:
   - `skills/screenshot/screenshot.js`
   - `skills/screen-point/screen-point.js`
   - `skills/screen-caption/screen-caption.js`
   - `skills/manage-codex/manage-codex.js`
   Each entry point should have a valid `main()` export that the Codex runtime can invoke

2. **Skill scaffolding**: Create a `skills/skill-template/` directory with a template `.toml` and `.js` file for easy skill creation

3. **Extended skills** (P2):
   - `skills/research-report/` — Web search + document generation
   - `skills/email-assistant/` — Email composition and management
   - `skills/repo-operator/` — Git operations and repository management
   Each with `.toml` descriptor and `.js` entry point

4. **Skill validation**: A script that scans `skills/` directory and validates:
   - Every `.toml` has a corresponding `.js` entry point
   - Every `.js` has a valid `main()` export
   - Descriptor fields are complete (name, description, entry, permissions)

## Success Criteria
- All 4 existing skills load without entry-point errors in Codex
- 3 new skills are functional with basic implementations
- Skill validation script passes on the entire skills directory
- Skill template enables creating new skills in <5 minutes

## Dependencies & Assumptions
- Codex runtime expects skills in the format defined by existing `.toml` files
- Skills directory is at `skills/` in project root
- Assumes Node.js skill entry points (`.js` with CommonJS or ESM exports)
- Out of scope: skill marketplace, skill versioning, permissions system
