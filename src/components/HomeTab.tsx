import { useState } from "react";

const suggestions = [
  "What can you help me with?",
  "Take a screenshot",
  "Summarize my screen",
  "Open settings",
];

function HomeTab() {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      // TODO: Submit to AI provider (Phase 3)
      setPrompt("");
    }
  };

  return (
    <div className="home-tab">
      <div className="hero-card">
        <h1>Hi, I'm ClickyX</h1>
        <p>Your AI companion — ask me anything about your screen.</p>
      </div>
      <form className="prompt-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="prompt-input"
          placeholder="Ask me anything..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button type="submit" className="prompt-submit">
          Ask
        </button>
      </form>
      <div className="suggestions-grid">
        {suggestions.map((s) => (
          <button
            key={s}
            className="suggestion-chip"
            onClick={() => setPrompt(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default HomeTab;
