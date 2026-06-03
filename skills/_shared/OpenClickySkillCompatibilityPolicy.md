# OpenClicky Skill Compatibility Policy

## Permission Classes

### safe
Read-only operations with no side effects. Examples: screen capture,
coordinate lookup, clipboard read (non-destructive).

### shell
Can execute arbitrary shell commands. Examples: run a terminal command,
execute a script.

### filesystem
Can read and write files. Examples: save a file, read a config file,
create a directory.

### full
Unrestricted system access. Examples: install software, modify system
settings, access network services.

## Compatibility

All OpenClicky skills must declare a permission_class. ClickyX will
enforce these permissions at the agent runtime level. Skills without
a permission_class will default to "safe" (most restrictive).

## Skill File Format

Skills are TOML files with the following structure:
```toml
name = "skill-name"
description = "What this skill does"
version = "1.0.0"
permission_class = "safe"
entry_point = "skill.js"
```

## Required Fields

- name: Unique skill identifier (kebab-case)
- description: Human-readable description
- version: Semver version string
- permission_class: One of "safe", "shell", "filesystem", "full"
- entry_point: Script or binary to invoke
