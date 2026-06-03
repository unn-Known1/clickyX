import { useState, useRef, useEffect, useCallback } from "react";
import { useChat, ChatMessage } from "../hooks/useChat";
import { useVision } from "../hooks/useVision";
import ModelSelector from "./ModelSelector";

function ChatTab() {
  const {
    messages,
    streaming,
    currentText,
    error,
    sendMessageStream,
    clearMessages,
  } = useChat();
  const { images, addImageFromDataUrl, removeImage, clearImages, getImageDataUrls } =
    useVision();

  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    "claude-sonnet-4-20250514",
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentText]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || streaming) return;

      const text = input;
      setInput("");

      if (images.length > 0) {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke<string>("chat_with_vision", {
            message: text,
            images: getImageDataUrls(),
            model: selectedModel,
          })
            .then((response) => {
              clearImages();
            })
            .catch((err) => console.error(err));
        });
      } else {
        sendMessageStream(text, selectedModel);
      }
    },
    [input, streaming, images, selectedModel, sendMessageStream, getImageDataUrls, clearImages],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            addImageFromDataUrl(dataUrl);
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [addImageFromDataUrl],
  );

  return (
    <div className="chat-tab">
      <div className="chat-header">
        <span className="chat-title">Chat</span>
        <div className="chat-controls">
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
          {messages.length > 0 && (
            <button className="chat-clear-btn" onClick={clearMessages}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            <p>Ask me anything — I can see your screen and help with tasks.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {streaming && currentText && (
          <div className="message assistant streaming">
            <div className="message-content">{currentText}</div>
            <span className="streaming-cursor">▍</span>
          </div>
        )}

        {error && (
          <div className="message error">
            <div className="message-content">{error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {images.length > 0 && (
        <div className="image-attachments">
          {images.map((img, i) => (
            <div key={i} className="image-thumb">
              <img src={img.previewUrl} alt={`Attachment ${i + 1}`} />
              <button
                className="image-remove-btn"
                onClick={() => removeImage(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder={
            images.length > 0
              ? "Ask about the image..."
              : "Ask me anything..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          disabled={streaming}
        />
        <button
          type="submit"
          className="chat-submit-btn"
          disabled={!input.trim() || streaming}
        >
          {streaming ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`message ${message.role}`}>
      <div className="message-role">
        {message.role === "user" ? "You" : "ClickyX"}
      </div>
      <div className="message-content">{message.content}</div>
    </div>
  );
}

export default ChatTab;
