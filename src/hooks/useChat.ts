import { useState, useCallback, useRef, useEffect } from "react";
import { commands, listen, type UnlistenFn } from "../bindings";

/** Generate a small random session ID to scope stream events per useChat instance */
function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface ChatMessage {
  role: string;
  content: string;
  timestamp: number;
  images?: string[]; // data URLs shown in the bubble
}

interface StreamEvent {
  type: "TextDelta" | "TextDone" | "Error" | "Done";
  text?: string;
  message?: string;
  session_id?: string;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const cancelledRef = useRef(false);
  // F-029: stable session ID so multiple useChat instances don't cross-contaminate
  const sessionIdRef = useRef<string>(newSessionId());
  // Mirror of messages for imperative helpers (regenerateLast)
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (unlistenRef.current) unlistenRef.current();
    };
  }, []);

  /** Cancel an in-progress stream (best-effort) */
  const cancelStream = useCallback(() => {
    cancelledRef.current = true;
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setStreaming(false);
    setCurrentText("");
  }, []);

  /** Stream a text-only message */
  const sendMessageStream = useCallback(
    async (content: string, model?: string) => {
      if (!content.trim() || streaming) return;

      setError(null);
      setCurrentText("");
      cancelledRef.current = false;

      const userMsg: ChatMessage = { role: "user", content, timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      let accumulated = "";

      try {
        const sessionId = sessionIdRef.current;
        const unlisten = await listen<StreamEvent>("stream-event", (event) => {
          if (cancelledRef.current) return;
          // F-029: ignore events that belong to a different session
          if (event.payload.session_id && event.payload.session_id !== sessionId) return;
          const p = event.payload;
          if (p.type === "TextDelta" && p.text) {
            accumulated += p.text;
            setCurrentText(accumulated);
          } else if (p.type === "TextDone" && p.text) {
            // Capture the authoritative final text so Done doesn't persist a truncated buffer
            accumulated = p.text;
            setCurrentText(p.text);
          } else if (p.type === "Done") {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: accumulated, timestamp: Date.now() },
            ]);
            setCurrentText("");
            setStreaming(false);
            unlisten();
            unlistenRef.current = null;
          } else if (p.type === "Error" && p.message) {
            setError(p.message);
            setStreaming(false);
            setCurrentText("");
            unlisten();
            unlistenRef.current = null;
          }
        });

        unlistenRef.current = unlisten;
        await commands.sendChatMessageStream(content, model ?? null, sessionId);
      } catch (e) {
        if (!cancelledRef.current) {
          setError(String(e));
          setStreaming(false);
          setCurrentText("");
        }
      }
    },
    [streaming],
  );

  /** Stream a vision (image) message — uses same stream-event pipeline */
  const sendMessageStreamWithVision = useCallback(
    async (content: string, imageDataUrls: string[], model?: string) => {
      if ((!content.trim() && imageDataUrls.length === 0) || streaming) return;

      setError(null);
      setCurrentText("");
      cancelledRef.current = false;

      const userMsg: ChatMessage = {
        role: "user",
        content,
        timestamp: Date.now(),
        images: imageDataUrls,
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      let accumulated = "";

      try {
        const sessionId = sessionIdRef.current;
        const unlisten = await listen<StreamEvent>("stream-event", (event) => {
          if (cancelledRef.current) return;
          // F-029: filter by session ID
          if (event.payload.session_id && event.payload.session_id !== sessionId) return;
          const p = event.payload;
          if (p.type === "TextDelta" && p.text) {
            accumulated += p.text;
            setCurrentText(accumulated);
          } else if (p.type === "TextDone" && p.text) {
            // Capture the authoritative final text so Done doesn't persist a truncated buffer
            accumulated = p.text;
            setCurrentText(p.text);
          } else if (p.type === "Done") {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: accumulated, timestamp: Date.now() },
            ]);
            setCurrentText("");
            setStreaming(false);
            unlisten();
            unlistenRef.current = null;
          } else if (p.type === "Error" && p.message) {
            setError(p.message);
            setStreaming(false);
            setCurrentText("");
            unlisten();
            unlistenRef.current = null;
          }
        });

        unlistenRef.current = unlisten;

        // Vision streaming isn't supported on the backend; call chatWithVision directly
        const response = await commands.chatWithVision(content, imageDataUrls, model ?? null);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response, timestamp: Date.now() },
        ]);
        setCurrentText("");
        setStreaming(false);
        unlisten();
        unlistenRef.current = null;
      } catch (e) {
        if (!cancelledRef.current) {
          setError(String(e));
          setStreaming(false);
          setCurrentText("");
        }
      }
    },
    [streaming],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentText("");
    setError(null);
    setStreaming(false);
    cancelledRef.current = true;
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
  }, []);

  /** Replace the message history wholesale (e.g. when loading a conversation) */
  const replaceMessages = useCallback((newMessages: ChatMessage[]) => {
    cancelledRef.current = true;
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setStreaming(false);
    setCurrentText("");
    setError(null);
    setMessages(Array.isArray(newMessages) ? newMessages : []);
  }, []);

  /** Regenerate the last assistant reply: drop everything after the last user
   *  message, then re-run the prompt without duplicating the user turn. */
  const regenerateLast = useCallback(
    async (model?: string) => {
      if (streaming) return;
      const msgs = messagesRef.current;
      let idx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "user") { idx = i; break; }
      }
      if (idx === -1) return;
      const prompt = msgs[idx].content;
      const images = msgs[idx].images;
      // Drop the trailing assistant messages AND the user turn; sendMessageStream
      // will re-append the user turn once (no duplicate reply, no duplicate prompt).
      setMessages(msgs.slice(0, idx));
      if (images && images.length > 0) {
        await sendMessageStreamWithVision(prompt, images, model);
      } else {
        await sendMessageStream(prompt, model);
      }
    },
    [streaming, sendMessageStream, sendMessageStreamWithVision],
  );

  return {
    messages,
    streaming,
    currentText,
    error,
    sendMessageStream,
    sendMessageStreamWithVision,
    cancelStream,
    clearMessages,
    replaceMessages,
    regenerateLast,
  };
}
