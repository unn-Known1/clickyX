// NOTE: This file is hand-maintained.
// To auto-generate from Rust types, run: src-tauri/export-types.sh
// Requires specta in [dev-dependencies] of Cargo.toml (see B-017 in PENDING_ITEMS.md)
//
/**
 * Typed Tauri command bindings.
 * Single source of truth for all invoke() signatures.
 * When ts-rs or specta is available on Rust side, regenerate this file.
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

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
  getConfig: () => tauriInvoke<AppConfig>("get_config"),
  updateConfig: (partial: Partial<AppConfig>) => tauriInvoke<AppConfig>("update_config", { partial }),
  exportConfig: () => tauriInvoke<string>("export_config"),
  importConfig: (json: string) => tauriInvoke<void>("import_config", { json }),
  resetConfig: () => tauriInvoke<void>("reset_config"),

  // AI
  getAiConfig: () => tauriInvoke<AiConfig>("get_ai_config"),
  updateAiConfig: (partial: Partial<AiConfig>) => tauriInvoke<AiConfig>("update_ai_config", { partial }),
  getModels: () => tauriInvoke<ModelInfo[]>("get_models"),

  // Audio
  getAudioConfig: () => tauriInvoke<AudioConfig>("get_audio_config"),
  updateAudioConfig: (partial: Partial<AudioConfig>) => tauriInvoke<AudioConfig>("update_audio_config", { partial }),
  getAudioStatus: () => tauriInvoke<AudioStatus>("get_audio_status"),
  getAudioLevel: () => tauriInvoke<number>("get_audio_level"),

  // Agents
  listAgents: () => tauriInvoke<AgentInfo[]>("list_agents"),
  createAgent: (name: string, slug: string, skills: string[]) => tauriInvoke<AgentInfo>("create_agent", { name, slug, skills }),
  runAgent: (slug: string, prompt: string) => tauriInvoke<void>("run_agent", { slug, prompt }),
  stopAgent: (slug: string) => tauriInvoke<void>("stop_agent", { slug }),
  archiveAgent: (slug: string) => tauriInvoke<void>("archive_agent", { slug }),
  enableSkill: (slug: string, skillName: string) => tauriInvoke<void>("enable_skill", { slug, skillName }),
  disableSkill: (slug: string, skillName: string) => tauriInvoke<void>("disable_skill", { slug, skillName }),
  listSkills: () => tauriInvoke<SkillInfo[]>("list_skills"),

  // Screen
  captureScreens: () => tauriInvoke<ScreenImage[]>("capture_screens"),
  captureCursorScreen: () => tauriInvoke<ScreenImage>("capture_cursor_screen"),
  captureFocusedWindow: () => tauriInvoke<ScreenImage | null>("capture_focused_window"),
  getAutoCaptureStatus: () => tauriInvoke<AutoCaptureStatus>("get_auto_capture_status"),
  startAutoCapture: (captureMode?: string, intervalMs?: number) => tauriInvoke<void>("start_auto_capture", { captureMode, intervalMs }),
  stopAutoCapture: () => tauriInvoke<void>("stop_auto_capture"),
  clearAutoCaptureCache: () => tauriInvoke<void>("clear_auto_capture_cache"),

  // Chat
  sendChatMessageStream: (message: string, model: string | null) => tauriInvoke<void>("send_chat_message_stream", { message, model }),
  sendChatMessageStreamVision: (message: string, images: string[], model: string | null) => tauriInvoke<void>("send_chat_message_stream_vision", { message, images, model }),
  chatWithVision: (message: string, images: string[], model: string | null) => tauriInvoke<string>("chat_with_vision", { message, images, model }),
  saveConversation: (conversation: unknown) => tauriInvoke<void>("save_conversation", { conversation }),

  // Voice
  getVoiceProviders: () => tauriInvoke<VoiceProvider[]>("get_voice_providers"),
  getVoices: (provider: string) => tauriInvoke<VoiceInfo[]>("get_voices", { provider }),
  selectVoice: (voiceId: string, accentColor: string) => tauriInvoke<void>("select_voice", { voiceId, accentColor }),
  setAccentPreset: (color: string) => tauriInvoke<string>("set_accent_preset", { color }),
  toggleTutorMode: () => tauriInvoke<boolean>("toggle_tutor_mode"),

  // MCP
  getMcpServers: () => tauriInvoke<McpServer[]>("get_mcp_servers"),
  addMcpServer: (config: McpServer) => tauriInvoke<McpServer[]>("add_mcp_server", { config }),
  removeMcpServer: (name: string) => tauriInvoke<McpServer[]>("remove_mcp_server", { name }),

  // Automations
  listAutomations: () => tauriInvoke<Automation[]>("list_automations"),
  createAutomation: (automation: Partial<Automation>) => tauriInvoke<Automation>("create_automation", { automation }),
  toggleAutomation: (id: string, enabled: boolean) => tauriInvoke<Automation>("toggle_automation", { id, enabled }),
  deleteAutomation: (id: string) => tauriInvoke<boolean>("delete_automation", { id }),

  // 3D
  generate3dModel: (prompt: string, style: string) => tauriInvoke<Model3DTask>("generate_3d_model", { prompt, style }),
  get3dModelTask: (taskId: string) => tauriInvoke<Model3DTask>("get_3d_model_task", { taskId }),

  // Stats
  getTodayStats: () => tauriInvoke<TodayStats>("get_today_stats"),

  // Permissions
  checkPermission: (permission: string) => tauriInvoke<PermissionStatus>("check_permission", { permission }),
  requestPermission: (permission: string) => tauriInvoke<boolean>("request_permission", { permission }),

  // System
  getAppVersion: () => tauriInvoke<string>("get_app_version"),
  getLogs: (count: number) => tauriInvoke<LogEntry[]>("get_logs", { count }),
  clearLogs: () => tauriInvoke<void>("clear_logs"),
  checkGoogleWorkspace: () => tauriInvoke<WorkspaceStatus>("check_google_workspace"),

  // Overlay
  overlayShowCursor: (x: number, y: number, label?: string) => tauriInvoke<void>("overlay_show_cursor", { x, y, label }),
  overlayShowRect: (x: number, y: number, w: number, h: number, label?: string) => tauriInvoke<void>("overlay_show_rect", { x, y, w, h, label }),
  overlayClear: () => tauriInvoke<void>("overlay_clear"),
  setOverlayVisible: (visible: boolean) => tauriInvoke<void>("set_overlay_visible", { visible }),

  // Agent HUD
  openAgentHud: (slug: string) => tauriInvoke<void>("open_agent_hud", { slug }),
  agentAttachFiles: (slug: string, paths: string[]) => tauriInvoke<void>("agent_attach_files", { slug, paths }),
};
