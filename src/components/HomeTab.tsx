import { useState, useCallback } from "react";
import ChatTab from "./ChatTab";

const suggestions = [
  "What can you help me with?",
  "Take a screenshot and explain it",
  "Summarize what's on my screen",
  "Open settings",
];

function HomeTab() {
  const [showChat, setShowChat] = useState(false);

  const handleSuggestion = useCallback((suggestion: string) => {
    setShowChat(true);
    const input = document.querySelector(".chat-input") as HTMLInputElement;
    if (input) {
      input.value = suggestion;
      input.focus();
    }
  }, []);

  if (showChat) {
    return (
      <div className="home-tab">
        <ChatTab />
      </div>
    );
  }

  return (
    <div className="home-tab">
      <div className="hero-card">
        <h1>Hi, I'm ClickyX</h1>
        <p>Your AI companion — ask me anything about your screen.</p>
      </div>
      <button className="start-chat-btn" onClick={() => setShowChat(true)}>
        Start a conversation
      </button>
      <div className="suggestions-grid">
        {suggestions.map((s) => (
          <button
            key={s}
            className="suggestion-chip"
            onClick={() => handleSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default HomeTab;
