import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { useChat } from "../hooks/useChat";
import { useVision } from "../hooks/useVision";
import { useConversations } from "../hooks/useConversations";
import type { ChatMessage } from "../hooks/useChat";
import ModelSelector from "./ModelSelector";
import { Icon } from "./Icon";
import ConfirmDialog from "./ConfirmDialog";
import { useAppContext } from "../context/AppContext";
import { useQuery } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { AiConfig } from "../bindings";

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
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`message ${message.role}`}>
      <div className="message-role-row">
        <span className="message-role">{message.role === "user" ? t("chat.you", "You") : "ClickyX"}</span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {message.images && message.images.length > 0 && (
        <div className="message-images">
          {message.images.map((src, i) => (
            <img key={i} src={src} alt={t("chat.attachment", { n: i + 1 })} className="message-image-thumb" />
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
          message.content
        )}
      </div>

      <div className="message-actions">
        <button className="msg-action-btn" onClick={handleCopy} title={copied ? t("chat.copied") : t("chat.copy")}>
          <Icon name={copied ? "check" : "copy"} size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
        {message.role === "assistant" && isLast && onRegenerate && (
          <button className="msg-action-btn" onClick={onRegenerate} title={t("chat.regenerate")}>
            <Icon name="retry" size={12} />
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
  const { t } = useTranslation();
  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <span className="chat-sidebar-title">{t("chat.conversations")}</span>
        <button className="chat-sidebar-new" onClick={onCreate} title={t("chat.newConversation")} aria-label={t("chat.newConversation")}>
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className="chat-sidebar-list">
        {conversations.length === 0 && (
          <p className="chat-sidebar-empty">{t("chat.noConversations")}</p>
        )}
        {[...conversations].reverse().map(c => (
          <div
            key={c.id}
            className={`chat-sidebar-item ${c.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(c.id)}
            role="button"
            tabIndex={0}
            aria-label={t("chat.openConversation", { title: c.title })}
            onKeyDown={(e) => e.key === "Enter" && onSelect(c.id)}
          >
            <span className="chat-sidebar-item-title">{c.title}</span>
            <span className="chat-sidebar-item-date">
              {new Date(c.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
            <button
              className="chat-sidebar-delete"
              onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              aria-label={t("chat.deleteConversation", { title: c.title })}
              title={t("chat.delete")}
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
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const {
    messages, streaming, currentText, error,
    sendMessageStream, sendMessageStreamWithVision,
    cancelStream, clearMessages, replaceMessages, regenerateLast,
  } = useChat();
  const { images, addImageFromDataUrl, removeImage, clearImages, getImageDataUrls } = useVision();
  const {
    conversations, activeId, activeConversation, isLoaded,
    setActiveId, createConversation, deleteConversation, updateMessages,
  } = useConversations();

  // P1 (H-2/CR-10): hydrate the chat body on cold start. useConversations
  // auto-selects the newest conversation (so the header shows its title) but
  // useChat starts empty — without this the title sits over an empty list.
  // Only fills an EMPTY message list so in-flight typing is never clobbered.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded || messages.length > 0) return;
    const convo = activeConversation;
    if (convo && convo.messages.length > 0 && hydratedRef.current !== convo.id) {
      hydratedRef.current = convo.id;
      replaceMessages(convo.messages);
    }
  }, [isLoaded, messages.length, activeConversation, replaceMessages]);

  // Load AI config to derive default model.
  // Shares the ["ai_config"] cache entry with useAiConfig/ModelSelector (was ["ai-config"] — C3).
  const { data: aiConfig } = useQuery<AiConfig>({
    queryKey: ["ai_config"],
    queryFn: () => commands.getAiConfig(),
    staleTime: 30_000,
  });

  // Draft preserved in sessionStorage
  const [input, setInput] = useState(() => {
    if (initialText) return initialText;
    try { return sessionStorage.getItem(DRAFT_KEY) ?? ""; } catch { return ""; }
  });
  const [selectedModel, setSelectedModel] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive default model from saved config when it loads
  useEffect(() => {
    if (!aiConfig || selectedModel) return;
    const defaultModel =
      aiConfig.default_provider === "openai"
        ? aiConfig.openai_model || "gpt-4o"
        : aiConfig.anthropic_model || "claude-sonnet-4-20250514";
    setSelectedModel(defaultModel);
  }, [aiConfig, selectedModel]);

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

  // Auto-grow the composer
  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  const addImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => addImageFromDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, [addImageFromDataUrl]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if ((!input.trim() && images.length === 0) || streaming) return;

      // Create a conversation if none active (createConversation sets it active).
      if (!activeId) createConversation();

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
      .then(() => showToast(t("chat.copied"), "success"))
      .catch(() => {});
  }, [showToast, t]);

  const handleRegenerate = useCallback(() => {
    if (streaming) return;
    void regenerateLast(selectedModel);
  }, [streaming, selectedModel, regenerateLast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "ArrowUp" && input === "") {
      const lastUser = [...messages].reverse().find(m => m.role === "user");
      if (lastUser) { e.preventDefault(); setInput(lastUser.content); }
    }
    // Enter sends, Shift+Enter inserts a newline
    if (e.key === "Enter" && !e.shiftKey && !streaming) {
      e.preventDefault();
      if (input.trim() || images.length > 0) {
        handleSubmit(e as unknown as React.FormEvent);
      }
    }
  }, [input, messages, streaming, images.length, handleSubmit]);

  const handleNewConversation = useCallback(() => {
    clearMessages();
    clearImages();
    createConversation();
    setInput("");
  }, [clearMessages, clearImages, createConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id);
    const convo = conversations.find(c => c.id === id);
    // F-010 fix: load the conversation's persisted history instead of starting fresh
    replaceMessages(convo?.messages ?? []);
    clearImages();
    setSidebarOpen(false);
  }, [setActiveId, conversations, replaceMessages, clearImages]);

  const handleClear = useCallback(() => {
    clearMessages();
    clearImages();
    setConfirmClear(false);
  }, [clearMessages, clearImages]);

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
            title={t("chat.toggleHistory")}
            aria-label={t("chat.toggleHistory")}
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" size={14} />
          </button>
          <span className="chat-title" title={activeConversation?.title ?? t("chat.chatTitle")}>
            {activeConversation?.title ?? t("chat.chatTitle")}
          </span>
        </div>
        <div className="chat-controls">
          <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
          {streaming && (
            <button className="chat-stop-btn" onClick={cancelStream}>
              <Icon name="stop" size={10} />
              {t("chat.stop")}
            </button>
          )}
          {messages.length > 0 && !streaming && (
            <button className="chat-clear-btn" onClick={() => setConfirmClear(true)}>{t("chat.clear")}</button>
          )}
        </div>
      </div>

      <div className="chat-messages" role="log" aria-live="polite" aria-label={t("chat.chatMessages")}>
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            {t("chat.empty")}
            <br />
            <span className="chat-empty-hint">{t("chat.emptyHint")}</span>
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
              <button className="image-remove-btn" onClick={() => removeImage(i)} aria-label={t("chat.removeImage", { n: i + 1 })}>×</button>
            </div>
          ))}
        </div>
      )}

      {isDraggingOver && (
        <div className="chat-drop-overlay" aria-hidden="true">{t("chat.dropImages")}</div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <button
          type="button"
          className="chat-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("chat.attachImage")}
          title={t("chat.attachImage")}
        >
          <Icon name="paperclip" size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) addImageFile(f);
            e.target.value = "";
          }}
        />
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={images.length > 0 ? t("chat.placeholderImage") : t("chat.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          rows={1}
          aria-label={t("chat.chatInput")}
        />
        <button
          type="submit"
          className="chat-submit-btn"
          disabled={(!input.trim() && images.length === 0) || streaming}
          title={t("chat.sendTitle")}
          aria-label={t("chat.sendMessage")}
        >
          <Icon name="send" size={14} />
        </button>
      </form>

      {confirmClear && (
        <ConfirmDialog
          title={t("chat.clearTitle")}
          message={t("chat.clearMessage")}
          confirmLabel={t("chat.clear")}
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

export default ChatTab;
