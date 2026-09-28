import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { ChatMessage } from "./useChat";

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export const CONVERSATIONS_QUERY_KEY = ["conversations"];

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

function trimForSave(convos: Conversation[]): Conversation[] {
  return convos.slice(-50).map(c => ({
    ...c,
    messages: c.messages.slice(-200),
  }));
}

export function useConversations() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Ensures the "select most recent on first load" default runs exactly once,
  // so a later user delete-to-null is never resurrected by a refetch.
  const didInitActiveRef = useRef(false);

  const convosQuery = useQuery<Conversation[], Error>({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: async () => sanitizeConversations(await commands.loadConversations()),
    staleTime: Infinity,
  });

  const saveMutation = useMutation<void, Error, Conversation[]>({
    mutationFn: (convos) => commands.saveConversations(trimForSave(convos)),
  });

  const conversations = convosQuery.data ?? [];
  const isLoaded = convosQuery.isSuccess || convosQuery.isError;

  useEffect(() => {
    if (!didInitActiveRef.current && convosQuery.isSuccess) {
      didInitActiveRef.current = true;
      const convos = convosQuery.data ?? [];
      if (convos.length > 0) {
        setActiveId(convos[convos.length - 1].id);
      }
    }
  }, [convosQuery.isSuccess, convosQuery.data]);

  const activeConversation = conversations.find(c => c.id === activeId) ?? null;

  const persist = useCallback((updated: Conversation[]) => {
    queryClient.setQueryData<Conversation[]>(CONVERSATIONS_QUERY_KEY, updated);
    saveMutation.mutate(updated);
  }, [queryClient, saveMutation]);

  const createConversation = useCallback((): string => {
    const id = generateId();
    const newConvo: Conversation = {
      id,
      title: "New conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    const updated = [...conversations, newConvo];
    persist(updated);
    setActiveId(id);
    return id;
  }, [conversations, persist]);

  const deleteConversation = useCallback((id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    persist(updated);
    setActiveId(prev => prev === id ? null : prev);
  }, [conversations, persist]);

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
