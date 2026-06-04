import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { useChat } from "../hooks/useChat";
import { useVision } from "../hooks/useVision";
import { useConversations } from "../hooks/useConversations";
import type { ChatMessage } from "../hooks/useChat";
import ModelSelector from "./ModelSelector";
import { useAppContext } from "../context/AppContext";

const DRAFT_KEY = "clickyx_chat_draft";

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  message,
  onCopy,
  onRegenerate,
  isLast,
}: {
  message: ChatMessage;
  onCopy: (text: string) => void;
  onRegenerate?: () => void;
  isLast: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`message ${message.role}`}>
      <div className="message-role-row">
        <span className="message-role">{message.role === "user" ? "You" : "ClickyX"}</span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {message.images && message.images.length > 0 && (
        <div className="message-images">
          {message.images.map((src, i) => (
            <img key={i} src={src} alt={`Attachment ${i + 1}`} className="message-image-thumb" />
          ))}
        </div>
      )}

      <div className="message-content">
        {message.role === "assistant" ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              code({ className, children, ...props }) {
                const isBlock = className?.startsWith("language-");
                if (isBlock) {
                  const lang = (className ?? "").replace("language-", "");
                  return (
                    <div className="md-code-block-wrap">
                      {lang && <span className="md-code-lang">{lang}</span>}
                      <code className={className} {...props}>{children}</code>
                    </div>
                  );
                }
                return <code className="md-code-inline" {...props}>{children}</code>;
              },
              pre({ children }) {
                return <pre className="md-code-block">{children}</pre>;
              },
              a({ href, children }) {
                return <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">{children}</a>;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.content}</span>
        )}
      </div>

      <div className="message-actions">
        <button className="msg-action-btn" onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copied ? "Copied" : "Copy"}
        </button>
        {message.role === "assistant" && isLast && onRegenerate && (
          <button className="msg-action-btn" onClick={onRegenerate} title="Regenerate">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ── Conversation sidebar ───────────────────────────────────────────────────────
function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  conversations: import("../hooks/useConversations").Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <span className="chat-sidebar-title">Conversations</span>
        <button className="chat-sidebar-new" onClick={onCreate} title="New conversation" aria-label="New conversation">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="chat-sidebar-list">
        {conversations.length === 0 && (
          <p className="chat-sidebar-empty">No conversations yet.</p>
        )}
        {[...conversations].reverse().map(c => (
          <div
            key={c.id}
            className={`chat-sidebar-item ${c.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelect(c.id)}
          >
            <span className="chat-sidebar-item-title">{c.title}</span>
            <span className="chat-sidebar-item-date">
              {new Date(c.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
            <button
              className="chat-sidebar-delete"
              onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              aria-label={`Delete conversation: ${c.title}`}
              title="Delete"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat Tab ───────────────────────────────────────────────────────────────────
function ChatTab({ initialText }: { initialText?: string }) {
  const { showToast } = useAppContext();
  const {
    messages, streaming, currentText, error,
    sendMessageStream, sendMessageStreamWithVision,
    cancelStream, clearMessages,
  } = useChat();
  const { images, addImageFromDataUrl, removeImage, clearImages, getImageDataUrls } = useVision();
  const {
    conversations, activeId, activeConversation,
    setActiveId, createConversation, deleteConversation, updateMessages,
  } = useConversations();

  // Draft preserved in sessionStorage
  const [input, setInput] = useState(() => {
    if (initialText) return initialText;
    try { return sessionStorage.getItem(DRAFT_KEY) ?? ""; } catch { return ""; }
  });
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-20250514");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist draft on every keystroke
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, input); } catch { /* ignore */ }
  }, [input]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentText]);

  // Sync messages back to conversation store
  useEffect(() => {
    if (activeId && messages.length > 0) {
      updateMessages(activeId, messages);
    }
  }, [messages, activeId, updateMessages]);

  const addImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => addImageFromDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, [addImageFromDataUrl]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if ((!input.trim() && images.length === 0) || streaming) return;

      // Create a conversation if none active
      let cid = activeId;
      if (!cid) cid = createConversation();

      const text = input;
      setInput("");
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }

      if (images.length > 0) {
        sendMessageStreamWithVision(text, getImageDataUrls(), selectedModel)
          .then(() => clearImages());
      } else {
        sendMessageStream(text, selectedModel);
      }
    },
    [input, streaming, images, selectedModel, activeId, createConversation, sendMessageStream, sendMessageStreamWithVision, getImageDataUrls, clearImages],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) addImageFile(file);
      }
    }
  }, [addImageFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith("image/")) addImageFile(file);
    }
  }, [addImageFile]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Copied", "success"))
      .catch(() => {});
  }, [showToast]);

  const handleRegenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser || streaming) return;
    sendMessageStream(lastUser.content, selectedModel);
  }, [messages, streaming, selectedModel, sendMessageStream]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && input === "") {
      const lastUser = [...messages].reverse().find(m => m.role === "user");
      if (lastUser) { e.preventDefault(); setInput(lastUser.content); }
    }
  }, [input, messages]);

  const handleNewConversation = useCallback(() => {
    clearMessages();
    clearImages();
    createConversation();
    setInput("");
  }, [clearMessages, clearImages, createConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id);
    clearMessages();
    clearImages();
    setSidebarOpen(false);
    // Note: reloading message history from store is a future enhancement
    // when backend persistence lands; for now new messages start fresh
  }, [setActiveId, clearMessages, clearImages]);

  return (
    <div className={`chat-tab ${isDraggingOver ? "chat-drop-active" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Sidebar drawer */}
      {sidebarOpen && (
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onCreate={handleNewConversation}
          onDelete={deleteConversation}
        />
      )}

      <div className="chat-header">
        <div className="chat-header-left">
          <button
            className="chat-sidebar-toggle"
            onClick={() => setSidebarOpen(v => !v)}
            title="Toggle conversation history"
            aria-label="Toggle conversation history"
            aria-expanded={sidebarOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="chat-title" title={activeConversation?.title ?? "Chat"}>
            {activeConversation?.title ?? "Chat"}
          </span>
        </div>
        <div className="chat-controls">
          <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
          {streaming && (
            <button className="chat-stop-btn" onClick={cancelStream}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
              </svg>
              Stop
            </button>
          )}
          {messages.length > 0 && !streaming && (
            <button className="chat-clear-btn" onClick={() => { clearMessages(); clearImages(); }}>Clear</button>
          )}
        </div>
      </div>

      <div className="chat-messages" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            Ask me anything — I can see your screen and help with tasks.
            <br />
            <span className="chat-empty-hint">Paste or drag images to attach them.</span>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={`${msg.timestamp}-${i}`}
            message={msg}
            onCopy={handleCopy}
            onRegenerate={handleRegenerate}
            isLast={i === messages.length - 1}
          />
        ))}

        {streaming && currentText && (
          <div className="message assistant streaming">
            <div className="message-role-row">
              <span className="message-role">ClickyX</span>
            </div>
            <div className="message-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentText}</ReactMarkdown>
              <span className="streaming-cursor" aria-hidden="true">▍</span>
            </div>
          </div>
        )}

        {error && (
          <div className="message error" role="alert">
            <div className="message-content">{error}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {images.length > 0 && (
        <div className="image-attachments" role="list">
          {images.map((img, i) => (
            <div key={i} className="image-thumb" role="listitem">
              <img src={img.previewUrl} alt={`Attachment ${i + 1}`} />
              <button className="image-remove-btn" onClick={() => removeImage(i)} aria-label={`Remove image ${i + 1}`}>×</button>
            </div>
          ))}
        </div>
      )}

      {isDraggingOver && (
        <div className="chat-drop-overlay" aria-hidden="true">Drop images here</div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder={images.length > 0 ? "Ask about the image…" : "Ask me anything…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          aria-label="Chat input"
        />
        <button
          type="submit"
          className="chat-submit-btn"
          disabled={(!input.trim() && images.length === 0) || streaming}
        >
          {streaming ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

export default ChatTab;
