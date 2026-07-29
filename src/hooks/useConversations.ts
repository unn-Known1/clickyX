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

  const saveSnapshot = useCallback((convos: Conversation[]) => {
    const trimmed = convos.slice(-50).map(c => ({
      ...c,
      messages: c.messages.slice(-200),
    }));
    commands.saveConversations(trimmed).catch(console.error);
  }, []);

  const createConversation = useCallback((): string => {
    const id = generateId();
    setConversations(prev => {
      const newConvo: Conversation = {
        id,
        title: "New conversation",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      const updated = [...prev, newConvo];
      saveSnapshot(updated);
      return updated;
    });
    setActiveId(id);
    return id;
  }, [saveSnapshot]);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveSnapshot(updated);
      return updated;
    });
    setActiveId(prev => prev === id ? null : prev);
  }, [saveSnapshot]);

  const updateMessages = useCallback((id: string, messages: ChatMessage[]) => {
    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === id
          ? { ...c, messages, title: deriveTitle(messages), updatedAt: Date.now() }
          : c,
      );
      saveSnapshot(updated);
      return updated;
    });
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
