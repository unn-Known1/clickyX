import { useState, useCallback } from "react";
import { commands } from "../bindings";
import type { ChatMessage } from "./useChat";

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = "clickyx_conversations";

function loadFromStorage(): Conversation[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function saveToStorage(convos: Conversation[]) {
  try {
    // Keep last 50 conversations, trim messages to last 200 per thread
    const trimmed = convos.slice(-50).map(c => ({
      ...c,
      messages: c.messages.slice(-200),
    }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full — ignore
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === "user");
  if (!first) return "New conversation";
  const text = first.content.trim();
  return text.length > 50 ? text.slice(0, 47) + "…" : text;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadFromStorage());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = loadFromStorage();
    return saved.length > 0 ? saved[saved.length - 1].id : null;
  });

  const activeConversation = conversations.find(c => c.id === activeId) ?? null;

  const persist = useCallback((convos: Conversation[]) => {
    setConversations(convos);
    saveToStorage(convos);
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
    persist([...conversations, newConvo]);
    setActiveId(id);
    return id;
  }, [conversations, persist]);

  const deleteConversation = useCallback((id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    persist(updated);
    if (activeId === id) {
      setActiveId(updated.length > 0 ? updated[updated.length - 1].id : null);
    }
  }, [conversations, persist, activeId]);

  const updateMessages = useCallback((id: string, messages: ChatMessage[]) => {
    const updated = conversations.map(c =>
      c.id === id
        ? { ...c, messages, title: deriveTitle(messages), updatedAt: Date.now() }
        : c,
    );
    persist(updated);
  }, [conversations, persist]);

  const renameConversation = useCallback((id: string, title: string) => {
    const updated = conversations.map(c => c.id === id ? { ...c, title } : c);
    persist(updated);
  }, [conversations, persist]);

  /** Persist conversation to Rust backend (best-effort, non-blocking) */
  const syncToBackend = useCallback((convo: Conversation) => {
    commands.saveConversation(convo).catch(() => {/* backend may not support yet */});
  }, []);

  return {
    conversations,
    activeId,
    activeConversation,
    setActiveId,
    createConversation,
    deleteConversation,
    updateMessages,
    renameConversation,
    syncToBackend,
  };
}
