import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

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
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const cancelledRef = useRef(false);

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
        const unlisten = await listen<StreamEvent>("stream-event", (event) => {
          if (cancelledRef.current) return;
          const p = event.payload;
          if (p.type === "TextDelta" && p.text) {
            accumulated += p.text;
            setCurrentText(accumulated);
          } else if (p.type === "TextDone" && p.text) {
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
        await invoke("send_chat_message_stream", { message: content, model: model ?? null });
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
        const unlisten = await listen<StreamEvent>("stream-event", (event) => {
          if (cancelledRef.current) return;
          const p = event.payload;
          if (p.type === "TextDelta" && p.text) {
            accumulated += p.text;
            setCurrentText(accumulated);
          } else if (p.type === "TextDone" && p.text) {
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

        // Try streaming vision first; fall back to blocking invoke if backend
        // doesn't yet support vision streaming
        try {
          await invoke("send_chat_message_stream_vision", {
            message: content,
            images: imageDataUrls,
            model: model ?? null,
          });
        } catch {
          // Fallback: blocking vision call, manually push result
          unlisten();
          unlistenRef.current = null;
          const response = await invoke<string>("chat_with_vision", {
            message: content,
            images: imageDataUrls,
            model: model ?? null,
          });
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: response, timestamp: Date.now() },
          ]);
          setCurrentText("");
          setStreaming(false);
        }
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

  return {
    messages,
    streaming,
    currentText,
    error,
    sendMessageStream,
    sendMessageStreamWithVision,
    cancelStream,
    clearMessages,
  };
}
