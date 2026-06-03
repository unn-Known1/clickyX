import { useState } from "react";

function ComputerUseSettings() {
  const [pointingModel, setPointingModel] = useState("claude-sonnet-4-20250514");
  const [cuaBackend, setCuaBackend] = useState("anthropic");
  const [nativeCua, setNativeCua] = useState(false);

  return (
    <section className="settings-section">
      <h3>Computer Use</h3>
      <div className="setting-row">
        <label>Screen Pointing Model</label>
        <select
          className="setting-select"
          value={pointingModel}
          onChange={(e) => setPointingModel(e.target.value)}
        >
          <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
          <option value="claude-opus-4-20250514">Claude Opus 4</option>
          <option value="gpt-4o">GPT-4o</option>
        </select>
      </div>
      <div className="setting-row">
        <label>CUA Backend</label>
        <select
          className="setting-select"
          value={cuaBackend}
          onChange={(e) => setCuaBackend(e.target.value)}
        >
          <option value="anthropic">Anthropic CUA</option>
          <option value="openai">OpenAI CUA</option>
        </select>
      </div>
      <div className="setting-row">
        <label>Native CUA</label>
        <input
          type="checkbox"
          checked={nativeCua}
          onChange={(e) => setNativeCua(e.target.checked)}
        />
      </div>
    </section>
  );
}

export default ComputerUseSettings;
