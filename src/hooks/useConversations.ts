import { useState, useCallback, useEffect, useRef } from "react";
import { commands } from "../bindings";
import type { ChatMessage } from "./useChat";

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isChatMessage(m: unknown): m is ChatMessage {
  return typeof m === "object" && m !== null
    && typeof (m as { role?: unknown }).role === "string"
    && typeof (m as { content?: unknown }).content === "string";
}

/// Runtime shape guard for conversation history loaded from disk (H-10: a
/// corrupt conversations.json must not crash the chat UI on find/map).
function sanitizeConversations(loaded: unknown): Conversation[] {
  if (!Array.isArray(loaded)) return [];
  const out: Conversation[] = [];
  for (const c of loaded) {
    if (typeof c !== "object" || c === null) continue;
    const o = c as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.title !== "string") continue;
    const messages = Array.isArray(o.messages) ? o.messages.filter(isChatMessage) : [];
    out.push({
      id: o.id,
      title: o.title,
      createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
      messages,
    });
  }
  return out;
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === "user");
  if (!first) return "New conversation";
  const text = first.content.trim();
  return text.length > 50 ? text.slice(0, 47) + "…" : text;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  // Mirrors conversations for imperative updates (avoids disk writes inside
  // state updaters, which StrictMode double-invokes in dev)
  const conversationsRef = useRef<Conversation[]>([]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    commands.loadConversations().then((loaded) => {
      const convos = sanitizeConversations(loaded);
      setConversations(convos);
      if (convos.length > 0) {
        setActiveId(convos[convos.length - 1].id);
      }
      setIsLoaded(true);
    }).catch(e => {
      console.error("Failed to load conversations:", e);
      setIsLoaded(true);
    });
  }, []);

  const activeConversation = conversations.find(c => c.id === activeId) ?? null;

  const saveSnapshot = useCallback((convos: Conversation[]) => {
    const trimmed = convos.slice(-50).map(c => ({
      ...c,
      messages: c.messages.slice(-200),
    }));
    commands.saveConversations(trimmed).catch(console.error);
  }, []);

  const createConversation = useCallback((): string => {
    const id = generateId();
    const newConvo: Conversation = {
      id,
      title: "New conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    const updated = [...conversationsRef.current, newConvo];
    setConversations(updated);
    saveSnapshot(updated);
    setActiveId(id);
    return id;
  }, [saveSnapshot]);

  const deleteConversation = useCallback((id: string) => {
    const updated = conversationsRef.current.filter(c => c.id !== id);
    setConversations(updated);
    saveSnapshot(updated);
    setActiveId(prev => prev === id ? null : prev);
  }, [saveSnapshot]);

  const updateMessages = useCallback((id: string, messages: ChatMessage[]) => {
    const updated = conversationsRef.current.map(c =>
      c.id === id
        ? { ...c, messages, title: deriveTitle(messages), updatedAt: Date.now() }
        : c,
    );
    setConversations(updated);
    saveSnapshot(updated);
  }, [saveSnapshot]);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, title } : c);
      saveSnapshot(updated);
      return updated;
    });
  }, [saveSnapshot]);

  return {
    conversations,
    activeId,
    activeConversation,
    setActiveId,
    createConversation,
    deleteConversation,
    updateMessages,
    renameConversation,
    isLoaded,
  };
}
