import { useState, useCallback } from "react";
import { useAgents, AgentInfo, SkillInfo } from "../hooks/useAgents";
import { agentStatusColor, agentStatusLabel } from "../utils/agentStatus";
import { useAppContext } from "../context/AppContext";
import { commands } from "../bindings";
import { SkeletonList } from "./SkeletonLoader";
import { Sounds } from "../utils/sounds";

function AgentCard({
  agent, selected, onSelect, onRun, onStop, onArchive, onPopOut, dragOver,
  onDragOver, onDragLeave, onDrop,
}: {
  agent: AgentInfo; selected: boolean;
  onSelect: () => void; onRun: () => void; onStop: () => void; onArchive: () => void;
  onPopOut: () => void;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const label = agentStatusLabel(agent.state);
  return (
    <div
      className={`agent-card ${selected ? "agent-card-selected" : ""} ${dragOver ? "drag-over" : ""}`}
      onClick={onSelect}
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="agent-card-header">
        <span className="agent-status-dot" style={{ backgroundColor: agentStatusColor(agent.state) }} />
        <span className="agent-card-name">{agent.name}</span>
        <span className="agent-card-slug">{agent.slug}</span>
      </div>
      <div className="agent-card-status">{label}</div>
      <div className="agent-card-skills">
        {agent.skills.map((s) => <span key={s} className="agent-skill-badge">{s}</span>)}
      </div>
      <div className="agent-card-actions">
        {label === "running" ? (
          <button className="agent-btn agent-btn-stop" onClick={(e) => { e.stopPropagation(); onStop(); }}>Stop</button>
        ) : ["idle", "paused", "done", "error"].includes(label) ? (
          <button className="agent-btn agent-btn-run" onClick={(e) => { e.stopPropagation(); onRun(); }}>Run</button>
        ) : null}
        {label !== "archived" && (
          <button className="agent-btn agent-btn-archive" onClick={(e) => { e.stopPropagation(); onArchive(); }}>Archive</button>
        )}
        {label === "running" && (
          <button
            className="agent-btn agent-btn-popout"
            onClick={(e) => { e.stopPropagation(); onPopOut(); }}
            title="Pop out HUD"
            aria-label="Open agent HUD in floating window"
          >
            ↗ HUD
          </button>
        )}
      </div>
    </div>
  );
}

function CreateAgentForm({ skills, onCreate }: {
  skills: SkillInfo[];
  onCreate: (name: string, slug: string, selectedSkills: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState("");

  const handleNameChange = (v: string) => {
    setName(v);
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    onCreate(name.trim(), slug.trim(), selectedSkills);
    setName(""); setSlug(""); setSelectedSkills([]); setSkillSearch("");
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName],
    );
  };

  const filteredSkills = skills.filter(
    (s) => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase()),
  );

  return (
    <form className="create-agent-form" onSubmit={handleSubmit}>
      <h3>Create Agent</h3>
      <input className="settings-input" placeholder="Agent name" value={name}
        onChange={(e) => handleNameChange(e.target.value)} />
      <input className="settings-input" placeholder="Slug (auto-derived)" value={slug}
        onChange={(e) => setSlug(e.target.value)} />
      {skills.length > 0 && (
        <div className="skill-selector">
          <label>Skills:</label>
          {skills.length > 5 && (
            <input className="settings-input" placeholder="Search skills…" value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)} style={{ marginBottom: 4 }} />
          )}
          <div className="skill-checkboxes">
            {filteredSkills.map((skill) => (
              <label key={skill.name} className="skill-checkbox">
                <input type="checkbox" checked={selectedSkills.includes(skill.name)}
                  onChange={() => toggleSkill(skill.name)} />
                <span>{skill.name}</span>
                <span className="skill-perm">{skill.permission_class}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <button type="submit" className="settings-save-btn">Create Agent</button>
    </form>
  );
}

function AgentDetail({
  agent, skills, onRun, onStop, onArchive, onEnableSkill, onDisableSkill,
}: {
  agent: AgentInfo; skills: SkillInfo[];
  onRun: () => void; onStop: () => void; onArchive: () => void;
  onEnableSkill: (s: string) => void; onDisableSkill: (s: string) => void;
}) {
  const { showToast } = useAppContext();
  const label = agentStatusLabel(agent.state);

  const copyTranscript = useCallback(() => {
    const text = agent.transcript.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    navigator.clipboard.writeText(text).then(() => showToast("Transcript copied", "success")).catch(() => {});
  }, [agent.transcript, showToast]);

  return (
    <div className="agent-detail">
      <div className="agent-detail-header">
        <h3>{agent.name}</h3>
        <span className="agent-status-dot agent-status-dot-lg"
          style={{ backgroundColor: agentStatusColor(agent.state) }} />
        <span className="agent-detail-status">{label}</span>
      </div>
      <div className="agent-detail-meta">
        <span>Slug: {agent.slug}</span>
        <span>ID: {agent.id}</span>
        <span>Updated: {new Date(agent.updated_at).toLocaleString()}</span>
      </div>
      <div className="agent-detail-actions">
        {label === "running"
          ? <button className="agent-btn agent-btn-stop" onClick={onStop}>Stop</button>
          : <button className="agent-btn agent-btn-run" onClick={onRun}>Run</button>}
        <button className="agent-btn agent-btn-archive" onClick={onArchive}>Archive</button>
      </div>
      <div className="agent-detail-skills">
        <h4>Skills</h4>
        <div className="agent-detail-skills-list">
          {agent.skills.map((s) => (
            <span key={s} className="agent-skill-badge">
              {s}
              <button className="skill-remove" onClick={() => onDisableSkill(s)} aria-label={`Remove ${s}`}>&times;</button>
            </span>
          ))}
        </div>
        <div className="agent-add-skills">
          {skills.filter((sk) => !agent.skills.includes(sk.name)).map((sk) => (
            <button key={sk.name} className="add-skill-btn" onClick={() => onEnableSkill(sk.name)}>
              + {sk.name}
            </button>
          ))}
        </div>
      </div>
      <div className="agent-detail-transcript">
        <div className="transcript-header">
          <h4>Transcript</h4>
          {agent.transcript.length > 0 && (
            <button className="btn-small" onClick={copyTranscript} title="Copy transcript">Copy</button>
          )}
        </div>
        {agent.transcript.length === 0 ? (
          <p className="transcript-empty">No messages yet.</p>
        ) : (
          agent.transcript.map((msg, i) => (
            <div key={i} className={`transcript-message transcript-${msg.role}`}>
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
    agents, skills, loading, error,
    createAgent, runAgent, stopAgent, archiveAgent, enableSkill, disableSkill, attachFiles,
  } = useAgents();

  const { showToast } = useAppContext();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [promptInput, setPromptInput] = useState<Record<string, string>>({});
  const [agentSearch, setAgentSearch] = useState("");

  // ── Drag-drop per-card state ────────────────────────────────────────────────
  const [dragOverSlug, setDragOverSlug] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.slug === selectedSlug) ?? null;

  const handleCreate = async (name: string, slug: string, agentSkills: string[]) => {
    try {
      await createAgent(name, slug, agentSkills);
      setShowCreate(false);
      showToast(`Agent "${name}" created`, "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleRun = async (slug: string) => {
    const prompt = promptInput[slug] || "Execute your available skills and report back.";
    try {
      await runAgent(slug, prompt);
      void Sounds.agentLaunch();
      showToast("Agent started", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handlePopOut = async (slug: string) => {
    try {
      await commands.openAgentHud(slug);
    } catch (e) {
      showToast(`Failed to open HUD: ${String(e)}`, "error");
    }
  };

  const handleFileDrop = async (slug: string, files: File[]) => {
    if (files.length === 0) return;
    const paths = files.map((f) => (f as File & { path?: string }).path || f.name);
    try {
      await attachFiles(slug, paths);
      showToast(`Attached ${files.length} file(s) to agent`, "success");
    } catch (e) {
      showToast(`Failed to attach files: ${String(e)}`, "error");
    }
  };

  const filteredAgents = agents.filter(
    (a) => !agentSearch ||
      a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      a.slug.toLowerCase().includes(agentSearch.toLowerCase()),
  );

  if (error) return <div className="agents-tab"><div className="agent-error">Error: {error}</div></div>;
  if (loading) return <div className="agents-tab" style={{ padding: 12 }}><SkeletonList count={3} /></div>;

  return (
    <div className="agents-tab">
      <div className="agents-toolbar">
        <h2>Agents</h2>
        <button className="settings-save-btn" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "New Agent"}
        </button>
      </div>

      {showCreate && <CreateAgentForm skills={skills} onCreate={handleCreate} />}

      {agents.length > 3 && (
        <input
          className="search-input"
          placeholder="Search agents…"
          value={agentSearch}
          onChange={(e) => setAgentSearch(e.target.value)}
          aria-label="Search agents"
        />
      )}

      <div className="agents-layout">
        <div className="agents-list">
          {filteredAgents.length === 0 ? (
            <p className="agents-empty">
              {agentSearch ? "No agents match." : "No agents yet. Create one to get started."}
            </p>
          ) : (
            filteredAgents.map((agent) => (
              <AgentCard
                key={agent.slug}
                agent={agent}
                selected={selectedSlug === agent.slug}
                onSelect={() => setSelectedSlug(agent.slug)}
                onRun={() => { setSelectedSlug(agent.slug); handleRun(agent.slug); }}
                onStop={() => stopAgent(agent.slug)}
                onArchive={() => archiveAgent(agent.slug)}
                onPopOut={() => handlePopOut(agent.slug)}
                dragOver={dragOverSlug === agent.slug}
                onDragOver={(e) => { e.preventDefault(); setDragOverSlug(agent.slug); }}
                onDragLeave={() => setDragOverSlug(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSlug(null);
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length > 0) {
                    handleFileDrop(agent.slug, files);
                  }
                }}
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
              onEnableSkill={(s) => enableSkill(selectedAgent.slug, s)}
              onDisableSkill={(s) => disableSkill(selectedAgent.slug, s)}
            />
            <div className="agent-prompt-area">
              <input
                className="prompt-input"
                placeholder="Override prompt for this agent…"
                value={promptInput[selectedAgent.slug] || ""}
                onChange={(e) =>
                  setPromptInput((prev) => ({ ...prev, [selectedAgent.slug]: e.target.value }))
                }
                aria-label="Agent prompt override"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentsTab;
