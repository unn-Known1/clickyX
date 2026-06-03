# ClickyX Configuration Reference

## Overview

Configuration is stored as a JSON file at the platform's config directory. The app loads this file at startup and watches for changes.

## Configuration Schema

```json
{
  "version": "0.1.0",
  "theme": "system" | "light" | "dark",
  "hotkeys": [
    {
      "key": "Ctrl+Option",
      "enabled": true,
      "action": "toggle_panel"
    }
  ],
  "api_keys": [
    {
      "provider": "anthropic",
      "key": "sk-ant-..."
    }
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
    "agent_dock_position": "bottom"
  },
  "audio": {
    "ptt_hotkey": "Ctrl+Shift+V",
    "stt_provider": "deepgram",
    "tts_provider": "elevenlabs",
    "activation_mode": "ptt",
    "auto_submit": true,
    "sample_rate": 16000,
    "buffer_size": 1024,
    "volume": 1.0
  },
  "ai": {
    "anthropic_api_key": null,
    "anthropic_model": "claude-sonnet-4-20250514",
    "openai_api_key": null,
    "openai_model": "gpt-4o",
    "default_provider": "anthropic",
    "system_prompt": ""
  }
}
```

## Fields

### General

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `theme` | string | `"system"` | UI theme: `system`, `light`, or `dark` |
| `overlay.show_cursor` | bool | `true` | Show cursor overlays |
| `overlay.tutor_mode` | bool | `false` | Enable tutor mode |
| `overlay.cursor_accent` | string | `"#4fc3f7"` | Cursor accent color |
| `overlay.cursor_size` | number | `32` | Cursor size in pixels |
| `overlay.agent_dock_position` | string | `"bottom"` | Agent dock position |

### Audio/Voice

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `audio.stt_provider` | string | `"deepgram"` | Speech-to-text provider |
| `audio.tts_provider` | string | `"elevenlabs"` | Text-to-speech provider |
| `audio.activation_mode` | string | `"ptt"` | Voice activation mode |
| `audio.volume` | number | `1.0` | Output volume (0-1) |
| `audio.ptt_hotkey` | string | `"Ctrl+Shift+V"` | Push-to-talk hotkey |

### AI Providers

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ai.anthropic_api_key` | string\|null | `null` | Anthropic API key |
| `ai.anthropic_model` | string | `"claude-sonnet-4-20250514"` | Anthropic model ID |
| `ai.openai_api_key` | string\|null | `null` | OpenAI API key |
| `ai.openai_model` | string | `"gpt-4o"` | OpenAI model ID |
| `ai.default_provider` | string | `"anthropic"` | Default AI provider |

### Hotkeys

Each hotkey entry:
| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Key combo (e.g., `"Ctrl+Shift+A"`) |
| `enabled` | bool | Whether hotkey is active |
| `action` | string | Action identifier |
