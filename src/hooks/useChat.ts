import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface ChatMessage {
  role: string;
  content: string;
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

  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, model?: string) => {
      if (!content.trim() || streaming) return;

      setError(null);
      setCurrentText("");

      const userMsg: ChatMessage = { role: "user", content };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      try {
        const response = await invoke<string>("send_chat_message", {
          message: content,
          model: model || null,
        });

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: response,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreaming(false);
        setCurrentText("");
      } catch (e) {
        setError(String(e));
        setStreaming(false);
        setCurrentText("");
      }
    },
    [streaming],
  );

  const sendMessageStream = useCallback(
    async (content: string, model?: string) => {
      if (!content.trim() || streaming) return;

      setError(null);
      setCurrentText("");

      const userMsg: ChatMessage = { role: "user", content };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      if (unlistenRef.current) {
        unlistenRef.current();
      }

      let accumulatedText = "";

      try {
        const unlisten = await listen<StreamEvent>(
          "stream-event",
          (event) => {
            const payload = event.payload;
            if (payload.type === "TextDelta" && payload.text) {
              accumulatedText += payload.text;
              setCurrentText(accumulatedText);
            } else if (payload.type === "TextDone" && payload.text) {
              setCurrentText(payload.text);
            } else if (payload.type === "Done") {
              const finalMsg: ChatMessage = {
                role: "assistant",
                content: accumulatedText,
              };
              setMessages((prev) => [...prev, finalMsg]);
              setCurrentText("");
              setStreaming(false);
              unlisten();
              unlistenRef.current = null;
            } else if (payload.type === "Error" && payload.message) {
              setError(payload.message);
              setStreaming(false);
              setCurrentText("");
              unlisten();
              unlistenRef.current = null;
            }
          },
        );

        unlistenRef.current = unlisten;

        await invoke("send_chat_message_stream", {
          message: content,
          model: model || null,
        });
      } catch (e) {
        setError(String(e));
        setStreaming(false);
        setCurrentText("");
      }
    },
    [streaming],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentText("");
    setError(null);
    setStreaming(false);
  }, []);

  return {
    messages,
    streaming,
    currentText,
    error,
    sendMessage,
    sendMessageStream,
    clearMessages,
  };
}
