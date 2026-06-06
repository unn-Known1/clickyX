import { useState, useCallback, useEffect } from "react";
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

  useEffect(() => {
    commands.loadConversations().then((loaded) => {
      const convos = (loaded || []) as Conversation[];
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

  const persist = useCallback((convos: Conversation[]) => {
    setConversations(convos);
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

  const syncToBackend = useCallback((_convo: Conversation) => {
    // Legacy mapping, handled by persist now.
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
    isLoaded,
  };
}
