import { useState } from "react";
import { useAgents, AgentInfo, SkillInfo } from "../hooks/useAgents";

function statusDot(status: string): string {
  switch (status) {
    case "idle":
    case "created":
      return "var(--text-secondary)";
    case "running":
      return "#4caf50";
    case "done":
    case "completed":
      return "#4fc3f7";
    case "error":
    case "failed":
      return "#f44336";
    case "archived":
      return "#888";
    default:
      return "var(--text-secondary)";
  }
}

function statusLabel(state: string): string {
  if (state === "Running") return "running";
  if (state === "Completed") return "done";
  if (state === "Failed") return "error";
  if (state === "Archived") return "archived";
  if (state === "Paused") return "paused";
  return "idle";
}

function AgentCard({
  agent,
  selected,
  onSelect,
  onRun,
  onStop,
  onArchive,
}: {
  agent: AgentInfo;
  selected: boolean;
  onSelect: () => void;
  onRun: () => void;
  onStop: () => void;
  onArchive: () => void;
}) {
  const label = statusLabel(agent.state);
  return (
    <div
      className={`agent-card ${selected ? "agent-card-selected" : ""}`}
      onClick={onSelect}
    >
      <div className="agent-card-header">
        <span
          className="agent-status-dot"
          style={{ backgroundColor: statusDot(label) }}
        />
        <span className="agent-card-name">{agent.name}</span>
        <span className="agent-card-slug">{agent.slug}</span>
      </div>
      <div className="agent-card-status">{label}</div>
      <div className="agent-card-skills">
        {agent.skills.map((s) => (
          <span key={s} className="agent-skill-badge">
            {s}
          </span>
        ))}
      </div>
      <div className="agent-card-actions">
        {label === "running" ? (
          <button className="agent-btn agent-btn-stop" onClick={(e) => { e.stopPropagation(); onStop(); }}>
            Stop
          </button>
        ) : label === "idle" || label === "paused" || label === "done" || label === "error" ? (
          <button className="agent-btn agent-btn-run" onClick={(e) => { e.stopPropagation(); onRun(); }}>
            Run
          </button>
        ) : null}
        {label !== "archived" && (
          <button className="agent-btn agent-btn-archive" onClick={(e) => { e.stopPropagation(); onArchive(); }}>
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

function CreateAgentForm({
  skills,
  onCreate,
}: {
  skills: SkillInfo[];
  onCreate: (name: string, slug: string, selectedSkills: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    onCreate(name.trim(), slug.trim(), selectedSkills);
    setName("");
    setSlug("");
    setSelectedSkills([]);
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName)
        ? prev.filter((s) => s !== skillName)
        : [...prev, skillName],
    );
  };

  return (
    <form className="create-agent-form" onSubmit={handleSubmit}>
      <h3>Create Agent</h3>
      <input
        className="settings-input"
        placeholder="Agent name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="settings-input"
        placeholder="Agent slug (e.g. my-agent)"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
      />
      {skills.length > 0 && (
        <div className="skill-selector">
          <label>Skills:</label>
          <div className="skill-checkboxes">
            {skills.map((skill) => (
              <label key={skill.name} className="skill-checkbox">
                <input
                  type="checkbox"
                  checked={selectedSkills.includes(skill.name)}
                  onChange={() => toggleSkill(skill.name)}
                />
                <span>{skill.name}</span>
                <span className="skill-perm">{skill.permission_class}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <button type="submit" className="settings-save-btn">
        Create Agent
      </button>
    </form>
  );
}

function AgentDetail({
  agent,
  skills,
  onRun,
  onStop,
  onArchive,
  onEnableSkill,
  onDisableSkill,
}: {
  agent: AgentInfo;
  skills: SkillInfo[];
  onRun: () => void;
  onStop: () => void;
  onArchive: () => void;
  onEnableSkill: (skill: string) => void;
  onDisableSkill: (skill: string) => void;
}) {
  const label = statusLabel(agent.state);
  return (
    <div className="agent-detail">
      <div className="agent-detail-header">
        <h3>{agent.name}</h3>
        <span
          className="agent-status-dot agent-status-dot-lg"
          style={{ backgroundColor: statusDot(label) }}
        />
        <span className="agent-detail-status">{label}</span>
      </div>
      <div className="agent-detail-meta">
        <span>Slug: {agent.slug}</span>
        <span>ID: {agent.id}</span>
      </div>
      <div className="agent-detail-actions">
        {label === "running" ? (
          <button className="agent-btn agent-btn-stop" onClick={onStop}>Stop</button>
        ) : (
          <button className="agent-btn agent-btn-run" onClick={onRun}>Run</button>
        )}
        <button className="agent-btn agent-btn-archive" onClick={onArchive}>Archive</button>
      </div>
      <div className="agent-detail-skills">
        <h4>Skills</h4>
        <div className="agent-detail-skills-list">
          {agent.skills.map((s) => (
            <span key={s} className="agent-skill-badge">
              {s}
              <button className="skill-remove" onClick={() => onDisableSkill(s)}>&times;</button>
            </span>
          ))}
        </div>
        <div className="agent-add-skills">
          {skills
            .filter((sk) => !agent.skills.includes(sk.name))
            .map((sk) => (
              <button
                key={sk.name}
                className="add-skill-btn"
                onClick={() => onEnableSkill(sk.name)}
              >
                + {sk.name}
              </button>
            ))}
        </div>
      </div>
      <div className="agent-detail-transcript">
        <h4>Transcript</h4>
        {agent.transcript.length === 0 ? (
          <p className="transcript-empty">No messages yet.</p>
        ) : (
          agent.transcript.map((msg, i) => (
            <div
              key={i}
              className={`transcript-message transcript-${msg.role}`}
            >
              <span className="transcript-role">{msg.role}</span>
              <p>{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AgentsTab() {
  const {
    agents,
    skills,
    loading,
    error,
    createAgent,
    runAgent,
    stopAgent,
    archiveAgent,
    enableSkill,
    disableSkill,
  } = useAgents();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [promptInput, setPromptInput] = useState<Record<string, string>>({});

  const selectedAgent = agents.find((a) => a.slug === selectedSlug) ?? null;

  const handleCreate = async (name: string, slug: string, agentSkills: string[]) => {
    await createAgent(name, slug, agentSkills);
    setShowCreate(false);
  };

  const handleRun = async (slug: string) => {
    const prompt = promptInput[slug] || "Execute your available skills and report back.";
    await runAgent(slug, prompt);
  };

  if (error) {
    return (
      <div className="agents-tab">
        <div className="agent-error">Error: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="agents-tab">
        <div className="agent-loading">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="agents-tab">
      <div className="agents-toolbar">
        <h2>Agents</h2>
        <button
          className="settings-save-btn"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "New Agent"}
        </button>
      </div>

      {showCreate && (
        <CreateAgentForm skills={skills} onCreate={handleCreate} />
      )}

      <div className="agents-layout">
        <div className="agents-list">
          {agents.length === 0 ? (
            <p className="agents-empty">No agents yet. Create one to get started.</p>
          ) : (
            agents.map((agent) => (
              <AgentCard
                key={agent.slug}
                agent={agent}
                selected={selectedSlug === agent.slug}
                onSelect={() => setSelectedSlug(agent.slug)}
                onRun={() => {
                  setSelectedSlug(agent.slug);
                  handleRun(agent.slug);
                }}
                onStop={() => stopAgent(agent.slug)}
                onArchive={() => archiveAgent(agent.slug)}
              />
            ))
          )}
        </div>

        {selectedAgent && (
          <div className="agents-detail-panel">
            <AgentDetail
              agent={selectedAgent}
              skills={skills}
              onRun={() => handleRun(selectedAgent.slug)}
              onStop={() => stopAgent(selectedAgent.slug)}
              onArchive={() => archiveAgent(selectedAgent.slug)}
              onEnableSkill={(skill) => enableSkill(selectedAgent.slug, skill)}
              onDisableSkill={(skill) => disableSkill(selectedAgent.slug, skill)}
            />
            <div className="agent-prompt-area">
              <input
                className="prompt-input"
                placeholder="Enter a prompt for the agent..."
                value={promptInput[selectedAgent.slug] || ""}
                onChange={(e) =>
                  setPromptInput((prev) => ({
                    ...prev,
                    [selectedAgent.slug]: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentsTab;
