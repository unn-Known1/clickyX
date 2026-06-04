/**
 * i18n setup — English (default) + Spanish skeleton.
 * Add more locales by duplicating the en/ folder.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const en = {
  translation: {
    // Navigation
    nav: {
      home: "Home",
      agents: "Agents",
      connections: "Connections",
      settings: "Settings",
    },
    // Home
    home: {
      greeting: "Hi, I'm ClickyX",
      subtitle: "Your AI companion — ask me anything about your screen.",
      startChat: "Start a conversation",
      suggestions: {
        help: "What can you help me with?",
        screenshot: "Take a screenshot and explain it",
        summarize: "Summarize what's on my screen",
        settings: "Open settings",
      },
    },
    // Chat
    chat: {
      placeholder: "Ask me anything…",
      placeholderImage: "Ask about the image…",
      send: "Send",
      stop: "Stop",
      clear: "Clear",
      empty: "Ask me anything — I can see your screen and help with tasks.",
      emptyHint: "Paste or drag images to attach them.",
      copy: "Copy",
      copied: "Copied",
      retry: "Retry",
      newConversation: "New conversation",
      conversations: "Conversations",
      noConversations: "No conversations yet.",
    },
    // Agents
    agents: {
      title: "Agents",
      newAgent: "New Agent",
      cancel: "Cancel",
      noAgents: "No agents yet. Create one to get started.",
      noMatch: "No agents match.",
      search: "Search agents…",
      createAgent: "Create Agent",
      namePlaceholder: "Agent name",
      slugPlaceholder: "Slug (auto-derived)",
      skills: "Skills:",
      transcript: "Transcript",
      noMessages: "No messages yet.",
      run: "Run",
      stop: "Stop",
      archive: "Archive",
    },
    // Settings
    settings: {
      title: "Settings",
      sections: {
        general: "General",
        voice: "Voice",
        providers: "AI Providers",
        computerUse: "Computer Use",
        permissions: "Permissions",
        agents: "Agents",
        automations: "Automations",
        system: "System & Logs",
      },
      save: "Save",
      saving: "Saving…",
      saved: "Saved!",
    },
    // Connections
    connections: {
      title: "Connections & Integrations",
      googleWorkspace: "Google Workspace",
      mcpServers: "MCP Servers",
      automations: "Automations",
      noMcp: "No MCP servers configured",
      noAutomations: "No automations configured",
    },
    // Status bar
    status: {
      listening: "Listening",
      idle: "Idle",
      capturing: "Capturing",
      noCapture: "No capture",
    },
    // Common
    common: {
      loading: "Loading…",
      error: "Error",
      ok: "OK",
      cancel: "Cancel",
      delete: "Delete",
      remove: "Remove",
      add: "Add",
      close: "Close",
      search: "Search…",
    },
  },
};

const es = {
  translation: {
    nav: { home: "Inicio", agents: "Agentes", connections: "Conexiones", settings: "Ajustes" },
    home: {
      greeting: "Hola, soy ClickyX",
      subtitle: "Tu asistente AI — pregúntame lo que quieras sobre tu pantalla.",
      startChat: "Iniciar conversación",
      suggestions: {
        help: "¿Con qué puedes ayudarme?",
        screenshot: "Toma una captura y explícala",
        summarize: "Resume lo que hay en mi pantalla",
        settings: "Abrir ajustes",
      },
    },
    chat: {
      placeholder: "Pregúntame lo que quieras…",
      placeholderImage: "Pregunta sobre la imagen…",
      send: "Enviar", stop: "Detener", clear: "Limpiar",
      empty: "Pregúntame lo que quieras — puedo ver tu pantalla.",
      emptyHint: "Pega o arrastra imágenes para adjuntarlas.",
      copy: "Copiar", copied: "¡Copiado!", retry: "Reintentar",
      newConversation: "Nueva conversación",
      conversations: "Conversaciones",
      noConversations: "No hay conversaciones.",
    },
    agents: {
      title: "Agentes", newAgent: "Nuevo agente", cancel: "Cancelar",
      noAgents: "Sin agentes aún.", noMatch: "Ningún agente coincide.",
      search: "Buscar agentes…", createAgent: "Crear agente",
      namePlaceholder: "Nombre del agente", slugPlaceholder: "Slug (auto)",
      skills: "Habilidades:", transcript: "Transcripción",
      noMessages: "Sin mensajes aún.", run: "Ejecutar", stop: "Detener", archive: "Archivar",
    },
    settings: {
      title: "Ajustes",
      sections: {
        general: "General", voice: "Voz", providers: "Proveedores IA",
        computerUse: "Uso del equipo", permissions: "Permisos",
        agents: "Agentes", automations: "Automatizaciones", system: "Sistema y logs",
      },
      save: "Guardar", saving: "Guardando…", saved: "¡Guardado!",
    },
    connections: {
      title: "Conexiones e integraciones",
      googleWorkspace: "Google Workspace",
      mcpServers: "Servidores MCP",
      automations: "Automatizaciones",
      noMcp: "No hay servidores MCP configurados",
      noAutomations: "No hay automatizaciones configuradas",
    },
    status: { listening: "Escuchando", idle: "Inactivo", capturing: "Capturando", noCapture: "Sin captura" },
    common: {
      loading: "Cargando…", error: "Error", ok: "Aceptar",
      cancel: "Cancelar", delete: "Eliminar", remove: "Quitar",
      add: "Agregar", close: "Cerrar", search: "Buscar…",
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources: { en, es },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export default i18n;
