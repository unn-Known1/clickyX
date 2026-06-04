# ClickyX Configuration Reference

## Overview

Configuration is stored as a JSON file at the platform-specific config directory and loaded at startup.
The app creates a default config on first run; unrecognized keys are silently ignored on load.

**Config file locations:**

| Platform | Path |
|----------|------|
| Linux    | `~/.config/clickyx/config.json` |
| macOS    | `~/Library/Application Support/clickyx/config.json` |
| Windows  | `%APPDATA%\clickyx\config.json` |

---

## Full JSON Schema Example

```json
{
  "version": "1.0",
  "theme": "system",
  "bridge_token": null,
  "onboarding_completed": false,

  "hotkeys": [
    { "key": "Ctrl+Option", "enabled": true, "action": "toggle_panel" },
    { "key": "Ctrl+Shift+T", "enabled": true, "action": "toggle_type_mode" }
  ],

  "api_keys": [
    { "provider": "anthropic", "key": "sk-ant-..." },
    { "provider": "deepgram",  "key": "dg-..." },
    { "provider": "elevenlabs","key": "el-..." }
  ],

  "window": {
    "pin": false,
    "width": 356,
    "height": 500
  },

  "screen": {
    "max_dimension": 1280,
    "jpeg_quality": 80,
    "cache_ttl_secs": 3
  },

  "overlay": {
    "cursor_accent": "#4fc3f7",
    "cursor_size": 32,
    "show_cursor": true,
    "tutor_mode": false,
    "agent_dock_position": "bottom",
    "opacity": 1.0,
    "accent_presets": [
      "#4fc3f7",
      "#ab47bc",
      "#66bb6a",
      "#ffa726"
    ]
  },

  "audio": {
    "ptt_hotkey": "Ctrl+Shift+V",
    "stt_provider": "deepgram",
    "tts_provider": "elevenlabs",
    "activation_mode": "ptt",
    "auto_submit": true,
    "sample_rate": 16000,
    "buffer_size": 1024,
    "volume": 1.0,
    "selected_voice_id": "21m00Tcm4TlvDq8ikWAM",
    "vad_sensitivity": 0.5,
    "always_on_config": {
      "enabled": false,
      "wake_word": "hey clicky",
      "silence_timeout_ms": 1500
    }
  },

  "ai": {
    "anthropic_api_key": null,
    "anthropic_model": "claude-sonnet-4-20250514",
    "openai_api_key": null,
    "openai_model": "gpt-4o",
    "openai_base_url": "https://api.openai.com",
    "default_provider": "anthropic",
    "system_prompt": "You are ClickyX, a helpful AI assistant."
  },

  "computer_use": {
    "pointing_model": "claude-sonnet-4-20250514",
    "cua_backend": "anthropic",
    "native_cua": false,
    "enabled": true,
    "backend": "native",
    "min_click_interval_ms": 200
  },

  "agent": {
    "codex_path": null,
    "codex_home": "~/.local/share/clickyx/codex",
    "max_workers": 1,
    "agent_dock_position": "bottom",
    "enabled_skills": []
  },

  "wake_word": {
    "enabled": false,
    "phrase": "hey clicky",
    "sensitivity": 0.5,
    "activation_mode": "ptt"
  },

  "type_mode": {
    "enabled": true,
    "double_tap_timeout_ms": 400,
    "indicator_color": "#4fc3f7"
  },

  "mcp_servers": [
    {
      "name": "my-server",
      "command": "npx",
      "args": ["-y", "@my-org/mcp-server"],
      "env": {
        "API_TOKEN": "secret"
      },
      "enabled": true
    }
  ],

  "automations_file": "automations.json"
}
```

---

## Field Reference

### Top-level

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | string | `"1.0"` | Config schema version. Do not edit manually. |
| `theme` | string | `"system"` | UI theme. One of: `"system"`, `"light"`, `"dark"`. |
| `bridge_token` | string \| null | `null` | Optional authentication token for the `localhost:32123` HTTP bridge. When set, all bridge requests must include the header `X-Bridge-Token: <token>`. Set to `null` to disable auth. |
| `onboarding_completed` | boolean | `false` | Set to `true` after the onboarding wizard is completed. The wizard displays on launch when this is `false`. |
| `automations_file` | string | `"automations.json"` | Filename (relative to config dir) where automations are stored. |

---

### `hotkeys[]`

Array of global hotkey bindings. Duplicate enabled keys are rejected on save.

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Key combination string (e.g. `"Ctrl+Shift+A"`, `"Ctrl+Option"`). Uses OS modifier naming. |
| `enabled` | boolean | Whether this binding is active. |
| `action` | string | Action identifier. Built-in actions: `"toggle_panel"`, `"toggle_type_mode"`. |

**Default bindings:**
- `Ctrl+Option` → `toggle_panel`
- `Ctrl+Shift+T` → `toggle_type_mode`

**Platform notes:**
- macOS: Use `Option` for the ⌥ key and `Command` or `Meta` for ⌘.
- Linux/Windows: Use `Ctrl`, `Alt`, `Shift`, `Super`.

---

### `api_keys[]`

Array of provider API keys. Each provider looks for its entry here.

| Field | Type | Description |
|-------|------|-------------|
| `provider` | string | Provider identifier: `"anthropic"`, `"openai"`, `"deepgram"`, `"elevenlabs"`. |
| `key` | string | API key value. Stored in plaintext — keep the config file permissions restricted. |

**Alternatively**, AI provider keys can be set in the `ai` object directly.

---

### `window`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `pin` | boolean | `false` | Whether the panel window is pinned (always on top). |
| `width` | integer | `356` | Panel width in logical pixels. |
| `height` | integer | `500` | Panel height in logical pixels. |

---

### `screen`

Controls automatic screen capture behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_dimension` | integer | `1280` | Screenshots are downscaled so neither dimension exceeds this value (pixels). Range: 256–7680. |
| `jpeg_quality` | integer | `80` | JPEG compression quality. Range: 1–100. |
| `cache_ttl_secs` | integer | `3` | Seconds a captured screenshot is cached before being re-captured. |

---

### `overlay`

Controls the floating overlay windows rendered per-monitor.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor_accent` | string | `"#4fc3f7"` | Hex color for the AI cursor indicator on the overlay. |
| `cursor_size` | integer | `32` | Size of the overlay cursor in logical pixels. Range: 8–128. |
| `show_cursor` | boolean | `true` | Whether to show the AI cursor on the overlay. |
| `tutor_mode` | boolean | `false` | When `true`, the overlay shows step-by-step guidance annotations. |
| `agent_dock_position` | string | `"bottom"` | Position of the agent dock strip. One of: `"bottom"`, `"top"`, `"left"`, `"right"`. |
| `opacity` | float | `1.0` | Overlay window opacity. Range: 0.0 (transparent) – 1.0 (opaque). Platform note: full transparency on macOS requires Tauri >2.11.2 with `macos-private-api`. |
| `accent_presets` | string[] | `["#4fc3f7", "#ab47bc", "#66bb6a", "#ffa726"]` | Named color presets for the accent color picker. Each entry is a CSS hex color. Add or remove entries freely. |

---

### `audio`

Controls voice input/output pipeline.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ptt_hotkey` | string | `"Ctrl+Shift+V"` | Push-to-talk hotkey. See `hotkeys[]` for key format. |
| `stt_provider` | string | `"deepgram"` | Speech-to-text provider. Options: `"deepgram"`, `"whisper"`. |
| `tts_provider` | string | `"elevenlabs"` | Text-to-speech provider. Options: `"elevenlabs"`, `"system"`. |
| `activation_mode` | string | `"ptt"` | Voice activation mode. Options: `"ptt"` (push-to-talk), `"always_on"`. |
| `auto_submit` | boolean | `true` | Automatically submit the transcribed text when PTT is released. |
| `sample_rate` | integer | `16000` | Audio sample rate in Hz. Supported: `8000`, `16000`, `44100`. |
| `buffer_size` | integer | `1024` | Audio input buffer size in frames. |
| `volume` | float | `1.0` | TTS playback volume. Range: 0.0–1.0. |
| `selected_voice_id` | string | `"21m00Tcm4TlvDq8ikWAM"` | ElevenLabs voice ID used for TTS responses. |
| `vad_sensitivity` | float | `0.5` | Voice Activity Detection threshold. Range: 0.0 (least sensitive) – 1.0 (most sensitive). Higher values require louder speech to trigger. |

#### `audio.always_on_config`

Configuration for always-on (wake-word) voice mode. Only active when `audio.activation_mode` is `"always_on"`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable always-on listening. When `true`, the microphone is always open. |
| `wake_word` | string | `"hey clicky"` | Phrase that triggers voice activation. Case-insensitive. |
| `silence_timeout_ms` | integer | `1500` | Milliseconds of silence after speech before the utterance is considered complete and submitted. Range: 200–10000. |

**Note:** `audio.always_on_config` mirrors `wake_word` at the top level but is the canonical source when `activation_mode` is `"always_on"`.

---

### `ai`

AI provider configuration. Keys here override the matching entries in `api_keys[]`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `anthropic_api_key` | string \| null | `null` | Anthropic API key (`sk-ant-...`). Required for Claude models. |
| `anthropic_model` | string | `"claude-sonnet-4-20250514"` | Default Anthropic model ID used for chat and CUA. |
| `openai_api_key` | string \| null | `null` | OpenAI API key (`sk-...`). Required for GPT models. |
| `openai_model` | string | `"gpt-4o"` | Default OpenAI model ID. |
| `openai_base_url` | string | `"https://api.openai.com"` | Base URL for OpenAI-compatible API. Override to use NVIDIA NIM, LM Studio, Ollama, etc. |
| `default_provider` | string | `"anthropic"` | Provider used when no model is explicitly selected. Options: `"anthropic"`, `"openai"`. |
| `system_prompt` | string | `"You are ClickyX..."` | System prompt prepended to every AI conversation. |

**Supported model IDs:**

*Anthropic:*
- `claude-sonnet-4-20250514` (recommended)
- `claude-opus-4-20250514`
- `claude-haiku-3-5-20241022`

*OpenAI:*
- `gpt-4o`, `gpt-4o-mini`
- `o1`, `o3-mini`

*NVIDIA NIM (via `openai_base_url`):*
- `nvidia/nemotron-4-340b-instruct`
- Any model from `https://integrate.api.nvidia.com/v1`

---

### `computer_use`

Controls Computer Use Automation (CUA) — autonomous click, scroll, and type operations.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `pointing_model` | string | `"claude-sonnet-4-20250514"` | Model used for GUI element detection in CUA tasks. |
| `cua_backend` | string | `"anthropic"` | AI backend driving CUA decisions. Options: `"anthropic"`, `"openai"`. |
| `native_cua` | boolean | `false` | Use native OS input injection (requires accessibility permission). When `false`, uses background injection. |
| `enabled` | boolean | `true` | Master switch for all CUA features. When `false`, click/scroll/type actions are blocked. |
| `backend` | string | `"native"` | Execution backend. `"native"` warps the visible cursor; `"background"` injects events without cursor movement. |
| `min_click_interval_ms` | integer | `200` | Minimum milliseconds between automated clicks. Prevents runaway click loops. Range: 50–5000. |

**Platform notes:**
- macOS: Requires Accessibility permission in System Settings > Privacy & Security.
- Windows: Elevated UAC may be required for some application targets.
- Linux: Requires `libxdo` or `enigo` backend; Wayland support is limited.

---

### `agent`

Controls the Codex agent runtime.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `codex_path` | string \| null | `null` | Path to the `codex` CLI binary. When `null`, the bundled binary is used. |
| `codex_home` | string | platform data dir | Base directory for agent workspace files. |
| `max_workers` | integer | `1` | Maximum number of simultaneously running agents. Range: 1–16. |
| `agent_dock_position` | string | `"bottom"` | Position of the agent status dock in the overlay. One of: `"bottom"`, `"top"`. |
| `enabled_skills` | string[] | `[]` | Global default skills enabled for all new agents. |

---

### `wake_word`

Legacy wake-word configuration. Prefer `audio.always_on_config` for new setups.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable wake-word detection. |
| `phrase` | string | `"hey clicky"` | Wake phrase. |
| `sensitivity` | float | `0.5` | Detection sensitivity. Range: 0.0–1.0. |
| `activation_mode` | string | `"ptt"` | Activation mode when wake word fires. |

---

### `type_mode`

Controls the "Type Mode" feature which intercepts keyboard input for AI-assisted typing.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable type mode. |
| `double_tap_timeout_ms` | integer | `400` | Window in ms for double-tap shortcut detection. Range: 100–1000. |
| `indicator_color` | string | `"#4fc3f7"` | Color of the type-mode indicator overlay element. |

---

### `mcp_servers[]`

Array of Model Context Protocol server configurations. MCP servers extend ClickyX with additional tools.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Unique display name for this server. |
| `command` | string | required | Executable or command to launch the server (e.g. `"npx"`, `"python"`, `"/usr/local/bin/my-mcp"`). |
| `args` | string[] | `[]` | Arguments passed to the command (e.g. `["-y", "@my-org/mcp-server"]`). Each argument is a separate array element — do not use comma-separated strings. |
| `env` | object | `{}` | Environment variables injected into the server process. Keys and values are plain strings. Secrets are stored in plaintext. |
| `enabled` | boolean | `true` | Whether this server is started. Disabled servers are preserved in config but not launched. |

**Example — filesystem MCP server:**
```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env": {},
  "enabled": true
}
```

---

### `automations[]`

> **Note:** Automations are stored in a separate file (`automations.json` in the config directory, controlled by `automations_file`). The array below documents the schema of each entry in that file.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID assigned at creation. Do not edit. |
| `name` | string | Human-readable automation name. |
| `trigger` | string | Trigger type. Options: `"interval"`, `"cron"`, `"event"`. |
| `skill` | string | Skill slug invoked when the automation fires. |
| `enabled` | boolean | Whether the automation runs. |
| `cron` | string \| null | Cron expression (e.g. `"0 9 * * 1-5"` for weekday 9am). Used when `trigger` is `"cron"`. |
| `interval_seconds` | integer \| null | Seconds between runs. Used when `trigger` is `"interval"`. |
| `prompt` | string | Prompt sent to the agent when the automation fires. |
| `agent_slug` | string \| null | Agent to run (if omitted, a default agent is used). |

**Cron format:** standard 5-field Unix cron (`minute hour day month weekday`).

---

## Validation Rules

- Duplicate enabled hotkey bindings are rejected with an error.
- `overlay.cursor_size` outside 8–128 falls back to the nearest bound.
- `audio.vad_sensitivity` outside 0.0–1.0 is clamped.
- Invalid JSON on load causes the app to use defaults (original file preserved).
- `mcp_servers[].args` must be an array, not a comma-separated string.

## Security Notes

- API keys are stored in **plaintext** in `config.json`. Restrict file permissions (`chmod 600` on Linux/macOS).
- The `bridge_token` protects the `localhost:32123` HTTP API. Use a random high-entropy value.
- MCP server `env` values are injected into subprocess environments — do not store production secrets.
