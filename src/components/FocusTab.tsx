import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";
import { useAppContext } from "../context/AppContext";
import { useFocus, formatFocusClock } from "../hooks/useFocus";

const WORK_PRESETS = [15, 25, 50] as const;
const BREAK_PRESETS = [5, 10] as const;

/** Circular progress dial — fills as the current phase elapses. */
function TimerRing({ progress, label }: { progress: number; label: string }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = circumference * (1 - clamped);
  return (
    <svg className="focus-ring" viewBox="0 0 120 120" role="img" aria-label={label}>
      <circle className="focus-ring-track" cx="60" cy="60" r={r} />
      <circle
        className="focus-ring-progress"
        cx="60"
        cy="60"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
      />
    </svg>
  );
}

function FocusTab() {
  const { t } = useTranslation();
  const { showToast, setActiveTab, requestPrompt } = useAppContext();
  const {
    config,
    updateConfig,
    phase,
    running,
    remainingMs,
    phaseTotalMs,
    intention,
    setIntention,
    start,
    pause,
    reset,
    skip,
    stats,
    parked,
    addParked,
    removeParked,
    clearParked,
  } = useFocus();

  const [thought, setThought] = useState("");

  const submitThought = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!thought.trim()) return;
      addParked(thought);
      setThought("");
    },
    [thought, addParked],
  );

  const planWithClickyX = useCallback(() => {
    const goal = intention.trim() || t("focus.planDefaultGoal");
    const prompt = t("focus.planPrompt", { goal });
    requestPrompt(prompt);
    setActiveTab("home");
    showToast(t("focus.planToast"), "info");
  }, [intention, requestPrompt, setActiveTab, showToast, t]);

  const progress = phaseTotalMs > 0 ? 1 - remainingMs / phaseTotalMs : 0;
  const isWork = phase === "work";

  return (
    <div className="focus-tab">
      <div className="focus-header">
        <div>
          <h1 className="focus-title">{t("focus.title")}</h1>
          <p className="focus-subtitle">{t("focus.subtitle")}</p>
        </div>
        {stats.streak > 0 && (
          <span className="focus-streak" title={t("focus.streakTitle", { n: stats.streak })}>
            <Icon name="bolt" size={12} />
            {t("focus.streakDays", { n: stats.streak })}
          </span>
        )}
      </div>

      <div className={`focus-timer-card ${isWork ? "focus-phase-work" : "focus-phase-break"}`}>
        <div className="focus-phase-label">
          <Icon name={isWork ? "bolt" : "clock"} size={12} />
          {t(isWork ? "focus.phaseWork" : "focus.phaseBreak")}
        </div>

        <div className="focus-dial">
          <TimerRing progress={progress} label={t(isWork ? "focus.phaseWork" : "focus.phaseBreak")} />
          <div className="focus-dial-center">
            <span className="focus-clock">{formatFocusClock(remainingMs)}</span>
            {intention.trim() && isWork && <span className="focus-dial-intention">{intention.trim()}</span>}
          </div>
        </div>

        <div className="focus-controls">
          <button
            type="button"
            className={`btn ${running ? "btn-secondary" : "btn-primary"} focus-main-btn`}
            onClick={running ? pause : start}
            aria-label={running ? t("focus.pause") : t("focus.start")}
          >
            <Icon name={running ? "stop" : "play"} size={14} />
            {running ? t("focus.pause") : t("focus.start")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={skip} aria-label={t("focus.skip")}>
            <Icon name="chevron-right" size={14} />
            {t("focus.skip")}
          </button>
          <button type="button" className="pin-toggle-btn" onClick={reset} aria-label={t("focus.reset")} title={t("focus.reset")}>
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      <label className="focus-field">
        <span className="focus-field-label">{t("focus.intention")}</span>
        <input
          className="focus-input"
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          placeholder={t("focus.intentionPlaceholder")}
          aria-label={t("focus.intention")}
        />
      </label>

      <button type="button" className="btn btn-secondary focus-plan-btn" onClick={planWithClickyX}>
        <Icon name="sparkle" size={13} />
        {t("focus.plan")}
      </button>

      <div className="focus-stats-row">
        <div className="focus-stat">
          <span className="focus-stat-value">{stats.todayMinutes}</span>
          <span className="focus-stat-label">{t("focus.statMinutes")}</span>
        </div>
        <div className="focus-stat">
          <span className="focus-stat-value">{stats.todaySessions}</span>
          <span className="focus-stat-label">{t("focus.statSessions")}</span>
        </div>
        <div className="focus-stat">
          <span className="focus-stat-value">{stats.streak}</span>
          <span className="focus-stat-label">{t("focus.statStreak")}</span>
        </div>
      </div>

      <section className="focus-durations" aria-label={t("focus.durations")}>
        <div className="focus-duration-group">
          <span className="focus-field-label">{t("focus.workLength")}</span>
          <div className="focus-preset-row">
            {WORK_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={`focus-preset ${config.workMinutes === m ? "active" : ""}`}
                onClick={() => updateConfig({ workMinutes: m })}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
        <div className="focus-duration-group">
          <span className="focus-field-label">{t("focus.breakLength")}</span>
          <div className="focus-preset-row">
            {BREAK_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={`focus-preset ${config.breakMinutes === m ? "active" : ""}`}
                onClick={() => updateConfig({ breakMinutes: m })}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="focus-dump" aria-label={t("focus.dumpTitle")}>
        <div className="focus-dump-head">
          <h2 className="focus-dump-title">
            <Icon name="file" size={12} />
            {t("focus.dumpTitle")}
          </h2>
          {parked.length > 0 && (
            <button type="button" className="focus-clear-btn" onClick={clearParked}>
              {t("focus.dumpClear")}
            </button>
          )}
        </div>
        <p className="focus-dump-hint">{t("focus.dumpHint")}</p>
        <form className="focus-dump-form" onSubmit={submitThought}>
          <input
            className="focus-input"
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            placeholder={t("focus.dumpPlaceholder")}
            aria-label={t("focus.dumpPlaceholder")}
          />
          <button type="submit" className="focus-dump-add" disabled={!thought.trim()} aria-label={t("focus.dumpAdd")}>
            <Icon name="plus" size={14} />
          </button>
        </form>
        {parked.length === 0 ? (
          <p className="focus-empty">{t("focus.dumpEmpty")}</p>
        ) : (
          <ul className="focus-dump-list" role="list">
            {parked.map((p) => (
              <li key={p.id} className="focus-dump-item">
                <span className="focus-dump-text">{p.text}</span>
                <button
                  type="button"
                  className="focus-dump-remove"
                  onClick={() => removeParked(p.id)}
                  aria-label={t("focus.dumpRemove")}
                >
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default FocusTab;
