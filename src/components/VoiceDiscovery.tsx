import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface VoiceInfo {
  id: string;
  provider: string;
  name: string;
  description: string;
  accent_color: string;
  gender: string;
  style: string;
  language: string;
  tier: string;
}

interface VoiceProvider {
  id: string;
  name: string;
  tier: string;
  requires_key: boolean;
}

interface AudioConfig {
  tts_provider: string;
  selected_voice_id: string;
}

interface VoiceDiscoveryProps {
  audioConfig: AudioConfig;
  onSelected?: (voiceId: string, accent: string) => void;
}

function VoiceOrbitNode({
  voice,
  index,
  total,
  radius,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  voice: VoiceInfo;
  index: number;
  total: number;
  radius: number;
  selected: boolean;
  hovered: boolean;
  onHover: (v: VoiceInfo | null) => void;
  onSelect: (v: VoiceInfo) => void;
}) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  const scale = selected ? 1.4 : hovered ? 1.2 : 1;
  return (
    <div
      className={`orbit-node ${selected ? "orbit-node-selected" : ""} ${hovered ? "orbit-node-hovered" : ""}`}
      style={{
        position: "absolute",
        left: `calc(50% + ${x}px - 28px)`,
        top: `calc(50% + ${y}px - 28px)`,
        transform: `scale(${scale})`,
        transition: "transform 0.2s ease-out, left 0.3s ease-out, top 0.3s ease-out",
      }}
      onMouseEnter={() => onHover(voice)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(voice)}
    >
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle
          cx="28"
          cy="28"
          r="22"
          fill={voice.accent_color}
          fillOpacity="0.25"
          stroke={voice.accent_color}
          strokeWidth={selected ? 3 : 1.5}
        />
        <circle
          cx="28"
          cy="28"
          r="14"
          fill="none"
          stroke={voice.accent_color}
          strokeWidth="1.5"
          opacity="0.5"
        />
        <text
          x="28"
          y="32"
          textAnchor="middle"
          fill="#fff"
          fontSize="11"
          fontWeight="600"
        >
          {voice.name.charAt(0)}
        </text>
      </svg>
      {selected && (
        <div className="orbit-node-selected-ring" />
      )}
    </div>
  );
}

export default function VoiceDiscovery({ audioConfig, onSelected }: VoiceDiscoveryProps) {
  const [providers, setProviders] = useState<VoiceProvider[]>([]);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(audioConfig.tts_provider);
  const [hovered, setHovered] = useState<VoiceInfo | null>(null);
  const [selected, setSelected] = useState<string>(audioConfig.selected_voice_id);
  const [dragging, setDragging] = useState(false);
  const [orbitRotation, setOrbitRotation] = useState(0);
  const orbitRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; rot: number } | null>(null);

  useEffect(() => {
    invoke<VoiceProvider[]>("get_voice_providers")
      .then((p) => {
        setProviders(p);
        if (p.length > 0 && !p.some((x) => x.id === selectedProvider)) {
          setSelectedProvider(p[0].id);
        }
      })
      .catch((e) => console.error("Failed to load providers:", e));
  }, []);

  useEffect(() => {
    if (!selectedProvider) return;
    invoke<VoiceInfo[]>("get_voices", { provider: selectedProvider })
      .then(setVoices)
      .catch((e) => console.error("Failed to load voices:", e));
  }, [selectedProvider]);

  const onSelect = useCallback(async (v: VoiceInfo) => {
    setSelected(v.id);
    try {
      await invoke("select_voice", { voiceId: v.id, accentColor: v.accent_color });
      onSelected?.(v.id, v.accent_color);
    } catch (e) {
      console.error("Failed to select voice:", e);
    }
  }, [onSelected]);

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, rot: orbitRotation };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const newRot = dragStart.current.rot + dx * 0.5;
    setOrbitRotation(newRot);
    if (voices.length > 0) {
      const segWidth = 360 / voices.length;
      const idx = Math.round(((newRot % 360) + 360) % 360 / segWidth) % voices.length;
      const focused = voices[(voices.length - idx) % voices.length];
      if (focused && focused.id !== selected) {
        onSelect(focused);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    dragStart.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const selectedVoice = voices.find((v) => v.id === selected) ?? voices[0];
  const previewVoice = hovered ?? selectedVoice;

  return (
    <div className="voice-discovery">
      <div className="voice-discovery-header">
        <select
          className="setting-select"
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.tier === "free" ? "(free)" : ""}
            </option>
          ))}
        </select>
        <span className="voice-discovery-hint">
          {voices.length} voice{voices.length === 1 ? "" : "s"} — drag the orbit to discover
        </span>
      </div>

      <div
        className="voice-orbit"
        ref={orbitRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <div className="orbit-center">
          <div className="orbit-center-inner">
            {previewVoice ? (
              <>
                <div className="orbit-preview-name" style={{ color: previewVoice.accent_color }}>
                  {previewVoice.name}
                </div>
                <div className="orbit-preview-desc">{previewVoice.description}</div>
                <div className="orbit-preview-meta">
                  <span className="orbit-tag">{previewVoice.gender}</span>
                  <span className="orbit-tag">{previewVoice.style}</span>
                  <span className="orbit-tag">{previewVoice.language}</span>
                </div>
              </>
            ) : (
              <div className="orbit-preview-name">Select a voice</div>
            )}
          </div>
        </div>

        {voices.map((v, i) => {
          const rotatedIndex = (i + Math.round(orbitRotation / (360 / Math.max(voices.length, 1)))) % voices.length;
          return (
            <VoiceOrbitNode
              key={v.id}
              voice={v}
              index={rotatedIndex}
              total={voices.length}
              radius={140}
              selected={v.id === selected}
              hovered={hovered?.id === v.id}
              onHover={setHovered}
              onSelect={onSelect}
            />
          );
        })}
      </div>

      <div className="voice-list">
        {voices.map((v) => (
          <button
            key={v.id}
            className={`voice-list-item ${v.id === selected ? "active" : ""}`}
            onClick={() => onSelect(v)}
            style={{ borderLeftColor: v.accent_color }}
          >
            <span className="voice-list-name" style={{ color: v.accent_color }}>
              {v.name}
            </span>
            <span className="voice-list-desc">{v.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
