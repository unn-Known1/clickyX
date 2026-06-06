// NOTE: This file is hand-maintained.
// To auto-generate from Rust types, run: src-tauri/export-types.sh
// Requires specta in [dev-dependencies] of Cargo.toml (see B-017 in PENDING_ITEMS.md)
//
/**
 * Typed Tauri command bindings.
 * Single source of truth for all invoke() signatures.
 * When ts-rs or specta is available on Rust side, regenerate this file.
 */
import { invoke as rawInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow as tauriGetCurrentWindow } from "@tauri-apps/api/window";

export type { UnlistenFn, Event };

export const isTauri =
  (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) ||
  (typeof process !== "undefined" && process.env.NODE_ENV === "test");

export function invoke<T>(cmd: string, args?: any): Promise<T> {
  if (!isTauri) {
    console.warn(`[Tauri Mock] invoke("${cmd}") called in browser.`);
    // Provide safe defaults for critical commands to avoid UI breakage
    if (cmd === "get_config") {
      return Promise.resolve({
        hotkeys: [],
        theme: "system",
        api_keys: [],
        window: { pin: false, width: 800, height: 600 },
        version: "0.1.1",
        onboarding_completed: true,
        overlay: {
          cursor_accent: "#ff0000",
          cursor_size: 16,
          show_cursor: true,
          tutor_mode: false,
          agent_dock_position: "bottom",
          accent_presets: [],
        },
        computer_use: {
          pointing_model: "",
          cua_backend: "",
          native_cua: false,
        }
      } as any);
    }
    if (cmd === "get_audio_config") {
      return Promise.resolve({
        ptt_hotkey: "ctrl+space",
        stt_provider: "deepgram",
        tts_provider: "elevenlabs",
        activation_mode: "ptt",
        auto_submit: true,
        volume: 0.8,
        selected_voice_id: "default",
      }) as any;
    }
    if (cmd === "get_ai_config") {
      return Promise.resolve({
        anthropic_api_key: null,
        anthropic_model: "claude-3-5-sonnet",
        openai_api_key: null,
        openai_model: "gpt-4o",
        openai_base_url: "https://api.openai.com/v1",
        default_provider: "anthropic",
        system_prompt: "",
      }) as any;
    }
    if (cmd === "get_models") {
      // In browser mode, return empty list to simulate no provider configured
      return Promise.resolve([]) as any;
    }
    if (cmd === "get_voice_providers") {
      return Promise.resolve([
        { id: "elevenlabs", name: "ElevenLabs", tier: "paid", requires_key: true },
        { id: "cartesia", name: "Cartesia", tier: "paid", requires_key: true },
        { id: "openai", name: "OpenAI TTS", tier: "paid", requires_key: true },
        { id: "system", name: "System (Offline)", tier: "free", requires_key: false }
      ]) as any;
    }
    if (cmd === "get_voices") {
      const provider = args?.provider || "elevenlabs";
      if (provider === "system") {
        return Promise.resolve([
          { id: "system_default", provider: "system", name: "System Voice", description: "Built-in operating system voice", accent_color: "#66bb6a", gender: "neutral", style: "default", language: "en-US", tier: "free" }
        ]) as any;
      }
      return Promise.resolve([
        { id: "voice-1", provider: "elevenlabs", name: "Rachel", description: "Rachel voice", accent_color: "#4fc3f7", gender: "female", style: "conversational", language: "en", tier: "free" },
        { id: "voice-2", provider: "elevenlabs", name: "Domi", description: "Domi voice", accent_color: "#e91e63", gender: "female", style: "expressive", language: "en", tier: "free" }
      ]) as any;
    }
    if (cmd === "check_permission") {
      const permission = args?.permission || "";
      return Promise.resolve({
        permission,
        granted: true,
        description: `Mocked ${permission} permission`,
      }) as any;
    }
    if (cmd === "request_permission") {
      return Promise.resolve(true) as any;
    }
    if (cmd === "get_audio_status") {
      return Promise.resolve({ listening: false, mode: "" }) as any;
    }
    if (cmd === "get_audio_level") {
      return Promise.resolve(0) as any;
    }
    if (cmd === "get_today_stats") {
      return Promise.resolve({ agents_run: 0, voice_commands: 0, items_for_review: 0 }) as any;
    }
    if (cmd === "get_auto_capture_status") {
      return Promise.resolve({
        running: false,
        last_capture: null,
        config: {
          enabled: false,
          interval_ms: 5000,
          capture_mode: "full",
          diff_threshold: 0.1,
          max_cache: 10,
          auto_attach: false,
        }
      }) as any;
    }
    if (cmd.startsWith("list_") || cmd.startsWith("get_mcp_servers") || cmd === "get_app_usage_log" || cmd === "get_automation_runs" || cmd === "get_logs") {
      return Promise.resolve([]) as any;
    }
    return Promise.resolve(undefined as any);
  }
  if (args === undefined) {
    return rawInvoke<T>(cmd);
  }
  return rawInvoke<T>(cmd, args);
}

export function listen<T>(event: string, handler: (e: Event<T>) => void): Promise<UnlistenFn> {
  if (!isTauri) {
    return Promise.resolve(() => {});
  }
  return tauriListen<T>(event, handler);
}

export function getCurrentWindow(): ReturnType<typeof tauriGetCurrentWindow> {
  if (!isTauri) {
    return {
      onFocusChanged: (_handler: any) => Promise.resolve(() => {}),
      minimize: () => Promise.resolve(),
      close: () => Promise.resolve(),
    } as any;
  }
  return tauriGetCurrentWindow();
}


// ── Config ────────────────────────────────────────────────────────────────────
export interface AppConfig {
  hotkeys: { key: string; enabled: boolean; action: string }[];
  theme: string;
  api_keys: { provider: string; key: string }[];
  window: { pin: boolean; width: number; height: number };
  version: string;
  onboarding_completed?: boolean;
  overlay: {
    cursor_accent: string;
    cursor_size: number;
    show_cursor: boolean;
    tutor_mode: boolean;
    agent_dock_position: string;
    accent_presets: string[];
  };
  computer_use: {
    pointing_model: string;
    cua_backend: string;
    native_cua: boolean;
  };
}

export interface AiConfig {
  anthropic_api_key: string | null;
  anthropic_model: string;
  openai_api_key: string | null;
  openai_model: string;
  openai_base_url: string;
  default_provider: string;
  system_prompt: string;
}

export interface AudioConfig {
  ptt_hotkey: string;
  stt_provider: string;
  tts_provider: string;
  activation_mode: string;
  auto_submit: boolean;
  volume: number;
  selected_voice_id: string;
}

// ── Agents ────────────────────────────────────────────────────────────────────
export interface AgentInfo {
  id: string;
  name: string;
  slug: string;
  state: string;
  skills: string[];
  created_at: string;
  updated_at: string;
  transcript: { role: string; content: string }[];
}

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  permission_class: string;
  entry_point: string;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  capabilities: string[];
}

// ── Screen ────────────────────────────────────────────────────────────────────
export interface ScreenImage {
  id: number;
  data: string;
  width: number;
  height: number;
}

export interface AutoCaptureStatus {
  running: boolean;
  last_capture: { timestamp: number; region: string; width: number; height: number; size: number } | null;
  config: {
    enabled: boolean;
    interval_ms: number;
    capture_mode: string;
    diff_threshold: number;
    max_cache: number;
    auto_attach: boolean;
  };
}

// ── Voice ─────────────────────────────────────────────────────────────────────
export interface VoiceInfo {
  id: string;
  provider: string;
  name: string;
  description: string;
  accent_color: string;
  gender: string;
  style: string;
  language: string;
  tier: string;
}

export interface VoiceProvider {
  id: string;
  name: string;
  tier: string;
  requires_key: boolean;
}

// ── MCP / Automations ─────────────────────────────────────────────────────────
export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: { type: string; seconds?: number; expression?: string };
  agent_slug?: string;
  enabled: boolean;
  last_run?: string;
}

// ── 3D ───────────────────────────────────────────────────────────────────────
export interface Model3DTask {
  task_id: string;
  status: "pending" | "processing" | "success" | "failed";
  model_url?: string;
  prompt: string;
  style: string;
  created_at: number;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export interface TodayStats {
  agents_run: number;
  voice_commands: number;
  items_for_review: number;
}

// ── Permissions ───────────────────────────────────────────────────────────────
export interface PermissionStatus {
  permission: string;
  granted: boolean;
  description: string;
}

// ── Workspace ─────────────────────────────────────────────────────────────────
export interface WorkspaceStatus {
  available: boolean;
  authenticated: boolean;
  email?: string;
  scopes?: string[];
}

// ── Log ───────────────────────────────────────────────────────────────────────
export interface LogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

// ── Audio status ──────────────────────────────────────────────────────────────
export interface AudioStatus {
  listening: boolean;
  mode: string;
}

// ── Typed invoke wrappers ─────────────────────────────────────────────────────
export const commands = {
  // Config
  getConfig: () => invoke<AppConfig>("get_config"),
  updateConfig: (partial: Partial<AppConfig>) => invoke<AppConfig>("update_config", { partial }),
  exportConfig: () => invoke<string>("export_config"),
  importConfig: (json: string) => invoke<void>("import_config", { json }),
  resetConfig: () => invoke<void>("reset_config"),

  // AI
  getAiConfig: () => invoke<AiConfig>("get_ai_config"),
  updateAiConfig: (partial: Partial<AiConfig>) => invoke<AiConfig>("update_ai_config", { partial }),
  getModels: () => invoke<ModelInfo[]>("get_models"),

  // Audio
  getAudioConfig: () => invoke<AudioConfig>("get_audio_config"),
  updateAudioConfig: (partial: Partial<AudioConfig>) => invoke<AudioConfig>("update_audio_config", { partial }),
  getAudioStatus: () => invoke<AudioStatus>("get_audio_status"),
  getAudioLevel: () => invoke<number>("get_audio_level"),

  // Agents
  listAgents: () => invoke<AgentInfo[]>("list_agents"),
  createAgent: (name: string, slug: string, skills: string[]) => invoke<AgentInfo>("create_agent", { name, slug, skills }),
  runAgent: (slug: string, prompt: string) => invoke<void>("run_agent", { slug, prompt }),
  stopAgent: (slug: string) => invoke<void>("stop_agent", { slug }),
  archiveAgent: (slug: string) => invoke<void>("archive_agent", { slug }),
  enableSkill: (slug: string, skillName: string) => invoke<void>("enable_skill", { slug, skillName }),
  disableSkill: (slug: string, skillName: string) => invoke<void>("disable_skill", { slug, skillName }),
  listSkills: () => invoke<SkillInfo[]>("list_skills"),

  // Screen
  captureScreens: () => invoke<ScreenImage[]>("capture_screens"),
  captureCursorScreen: () => invoke<ScreenImage>("capture_cursor_screen"),
  captureFocusedWindow: () => invoke<ScreenImage | null>("capture_focused_window"),
  getAutoCaptureStatus: () => invoke<AutoCaptureStatus>("get_auto_capture_status"),
  startAutoCapture: (captureMode?: string, intervalMs?: number) => invoke<void>("start_auto_capture", { captureMode, intervalMs }),
  stopAutoCapture: () => invoke<void>("stop_auto_capture"),
  clearAutoCaptureCache: () => invoke<void>("clear_auto_capture_cache"),

  // Chat
  sendChatMessageStream: (message: string, model: string | null, sessionId?: string) => invoke<void>("send_chat_message_stream", { message, model, sessionId }),
  sendChatMessageStreamVision: (message: string, images: string[], model: string | null, sessionId?: string) => invoke<void>("send_chat_message_stream_vision", { message, images, model, sessionId }),
  chatWithVision: (message: string, images: string[], model: string | null) => invoke<string>("chat_with_vision", { message, images, model }),
  loadConversations: () => invoke<unknown[]>("load_conversations"),
  saveConversations: (conversations: unknown[]) => invoke<void>("save_conversations", { conversations }),

  // Voice
  getVoiceProviders: () => invoke<VoiceProvider[]>("get_voice_providers"),
  getVoices: (provider: string) => invoke<VoiceInfo[]>("get_voices", { provider }),
  selectVoice: (voiceId: string, accentColor: string) => invoke<void>("select_voice", { voiceId, accentColor }),
  setAccentPreset: (color: string) => invoke<string>("set_accent_preset", { color }),
  toggleTutorMode: () => invoke<boolean>("toggle_tutor_mode"),

  // MCP
  getMcpServers: () => invoke<McpServer[]>("get_mcp_servers"),
  addMcpServer: (config: McpServer) => invoke<McpServer[]>("add_mcp_server", { config }),
  removeMcpServer: (name: string) => invoke<McpServer[]>("remove_mcp_server", { name }),
  testMcpServer: (serverId: string) => invoke<void>("test_mcp_server", { serverId }),

  // Automations
  listAutomations: () => invoke<Automation[]>("list_automations"),
  createAutomation: (automation: Partial<Automation>) => invoke<Automation>("create_automation", { automation }),
  toggleAutomation: (id: string, enabled: boolean) => invoke<Automation>("toggle_automation", { id, enabled }),
  deleteAutomation: (id: string) => invoke<boolean>("delete_automation", { id }),

  // 3D
  generate3dModel: (prompt: string, style: string) => invoke<Model3DTask>("generate_3d_model", { prompt, style }),
  get3dModelTask: (taskId: string) => invoke<Model3DTask>("get_3d_model_task", { taskId }),

  // Stats
  getTodayStats: () => invoke<TodayStats>("get_today_stats"),

  // Permissions
  checkPermission: (permission: string) => invoke<PermissionStatus>("check_permission", { permission }),
  requestPermission: (permission: string) => invoke<boolean>("request_permission", { permission }),

  // System
  getAppVersion: () => invoke<string>("get_app_version"),
  getLogs: (count: number) => invoke<LogEntry[]>("get_logs", { count }),
  clearLogs: () => invoke<void>("clear_logs"),
  getAppUsageLog: () => invoke<any[]>("get_app_usage_log"),
  clearAppUsageLog: () => invoke<void>("clear_app_usage_log"),
  getAutomationRuns: (automationId: string) => invoke<any[]>("get_automation_runs", { automationId }),
  checkGoogleWorkspace: () => invoke<WorkspaceStatus>("check_google_workspace"),
  googleWorkspaceAuthStart: () => invoke<void>("google_workspace_auth_start"),
  googleWorkspaceAuthRevoke: () => invoke<void>("google_workspace_auth_revoke"),

  // Overlay
  overlayShowCursor: (x: number, y: number, label?: string) => invoke<void>("overlay_show_cursor", { x, y, label }),
  overlayShowCursors: (cursors: any[]) => invoke<void>("overlay_show_cursors", { cursors }),
  overlayShowRect: (x: number, y: number, w: number, h: number, label?: string) => invoke<void>("overlay_show_rect", { x, y, w, h, label }),
  overlayShowScribble: (points: [number, number][], label?: string) => invoke<void>("overlay_show_scribble", { points, label }),
  overlayShowCaption: (text: string, x: number, y: number) => invoke<void>("overlay_show_caption", { text, x, y }),
  overlayClear: () => invoke<void>("overlay_clear"),
  setOverlayVisible: (visible: boolean) => invoke<void>("set_overlay_visible", { visible }),

  // Agent HUD
  openAgentHud: (slug: string) => invoke<void>("open_agent_hud", { slug }),
  agentAttachFiles: (slug: string, paths: string[]) => invoke<void>("agent_attach_files", { slug, paths }),
};
