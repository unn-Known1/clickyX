import { useState, useRef, useCallback, useEffect } from "react";

interface KeyCaptureProps {
  value: string;
  onChange: (hotkey: string) => void;
  placeholder?: string;
}

/**
 * Key-capture input — press any key combination to set the hotkey.
 * Displays like a text field but intercepts keydown events.
 */
export function HotkeyInput({ value, onChange, placeholder = "Click and press keys…" }: KeyCaptureProps) {
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState(value);
  const inputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setPreview(value); }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore standalone modifiers
    if (["Control", "Shift", "Alt", "Meta", "OS"].includes(e.key)) {
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey)  parts.push("Ctrl");
    if (e.metaKey)  parts.push("Meta");
    if (e.altKey)   parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    // Format the key
    let key = e.key;
    if (key === " ") key = "Space";
    else if (key.length === 1) key = key.toUpperCase();

    parts.push(key);
    const combo = parts.join("+");
    setPreview(combo);
    onChange(combo);
    setCapturing(false);
    inputRef.current?.blur();
  }, [onChange]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
  }, []);

  const presetHotkeys = [
    "Ctrl+Alt+Space",
    "Ctrl+Shift+Space",
    "Ctrl+Option+Space",
    "Shift+F9",
    "F9",
  ];

  return (
    <div className="hotkey-capture-wrap">
      <button
        ref={inputRef}
        type="button"
        className={`hotkey-capture-btn ${capturing ? "capturing" : ""}`}
        onFocus={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        aria-label={capturing ? "Press your hotkey combination" : `Current hotkey: ${preview || "none"}`}
      >
        {capturing ? (
          <span className="hotkey-capture-hint">Press keys now…</span>
        ) : (
          <span className="hotkey-capture-value">{preview || placeholder}</span>
        )}
      </button>
      <div className="hotkey-presets">
        {presetHotkeys.map(h => (
          <button
            key={h}
            type="button"
            className={`hotkey-preset-chip ${preview === h ? "active" : ""}`}
            onClick={() => { setPreview(h); onChange(h); }}
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
