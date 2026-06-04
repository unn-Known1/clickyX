import { useState, useEffect, useRef, Suspense, lazy } from "react";
import { commands, Model3DTask } from "../bindings";
import { useAppContext } from "../context/AppContext";

// Lazy-load Three.js to avoid bundle bloat when feature is unused
const ThreeViewer = lazy(() => import("./ThreeModelViewer"));

const STYLES = ["low_poly_stylized", "clay", "voxel", "game_asset", "realistic"] as const;
type ModelStyle = typeof STYLES[number];

export default function ModelGeneratorTab() {
  const { showToast } = useAppContext();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ModelStyle>("low_poly_stylized");
  const [task, setTask] = useState<Model3DTask | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | undefined>(undefined);

  // Poll task status
  useEffect(() => {
    if (!task || task.status === "success" || task.status === "failed") {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const updated = await commands.get3dModelTask(task.task_id);
        setTask(updated);
        if (updated.status === "success") showToast("3D model ready!", "success");
        if (updated.status === "failed") showToast("3D model generation failed", "error");
      } catch {/* ignore */}
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [task, showToast]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setTask(null);
    try {
      const newTask = await commands.generate3dModel(prompt.trim(), style);
      setTask(newTask);
      showToast("Generation started…", "info");
    } catch (err) {
      showToast(`Failed: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="model-gen-tab">
      <h2>3D Model Generator</h2>
      <p className="settings-hint">
        Powered by Tripo3D. Enter a prompt to generate a 3D model (GLB format).
      </p>

      <form className="model-gen-form" onSubmit={handleGenerate}>
        <textarea
          className="settings-textarea"
          placeholder="Describe your 3D model… (e.g. 'a low-poly forest cottage with a red roof')"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={loading}
        />
        <div className="form-row">
          <label>Style:</label>
          <select
            className="setting-select"
            value={style}
            onChange={(e) => setStyle(e.target.value as ModelStyle)}
            disabled={loading}
          >
            {STYLES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={!prompt.trim() || loading}
        >
          {loading ? "Starting…" : "Generate Model"}
        </button>
      </form>

      {task && (
        <div className="model-gen-status">
          <div className="setting-row">
            <label>Status</label>
            <span className={`status-badge ${task.status === "success" ? "available" : task.status === "failed" ? "unavailable" : "unauthenticated"}`}>
              {task.status === "pending" && "Queued…"}
              {task.status === "processing" && "Processing…"}
              {task.status === "success" && "Ready!"}
              {task.status === "failed" && "Failed"}
            </span>
          </div>
          <div className="setting-row">
            <label>Prompt</label>
            <span className="setting-value" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {task.prompt}
            </span>
          </div>

          {(task.status === "pending" || task.status === "processing") && (
            <div className="model-gen-spinner">
              <div className="skeleton-loader" style={{ height: 8, width: "60%", margin: "8px auto" }} />
              <p className="settings-hint" style={{ textAlign: "center" }}>
                Generating… this usually takes 30–120 seconds.
              </p>
            </div>
          )}

          {task.status === "success" && task.model_url && (
            <div className="model-gen-viewer">
              <Suspense fallback={<div className="skeleton-loader" style={{ height: 300 }} />}>
                <ThreeViewer modelUrl={task.model_url} />
              </Suspense>
              <a
                className="btn-primary"
                href={task.model_url}
                download={`model-${task.task_id}.glb`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8 }}
              >
                Download GLB
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
