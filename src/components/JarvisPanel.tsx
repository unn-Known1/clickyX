import { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "../bindings";
import type { JarvisAnalyzeResult, RankResult } from "../bindings";
import { useAppContext } from "../context/AppContext";
import { useJarvis } from "../hooks/useJarvis";
import { useJarvisAutoTrigger } from "../hooks/useJarvisAutoTrigger";

type Phase = "idle" | "extracting" | "judging" | "drafting" | "ranking" | "done" | "error";

interface Turn {
  side: string;
  text: string;
}

function parseTurns(raw: string): Turn[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // Prefer JSON: [{side, text}].
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          side: String(e.side ?? "her"),
          text: String(e.text ?? "").slice(0, 2000),
        }))
        .filter((t) => t.text.trim().length > 0)
        .slice(0, 10);
    }
  } catch {
    // Fall through to line parsing.
  }
  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(her|me|them|you)\s*[:\-–]\s*(.*)$/i);
      return m
        ? { side: m[1].toLowerCase(), text: m[2].slice(0, 2000) }
        : { side: "her", text: line.slice(0, 2000) };
    })
    .slice(0, 10);
}

const EXTRACT_PROMPT =
  "Transcribe every visible chat bubble as JSON: [{\"side\": \"her\"|\"me\", \"text\": \"…\"}]. " +
  "\"her\" is the other party, \"me\" is the user. Output ONLY the JSON array, no commentary.";

export default function JarvisPanel() {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<JarvisAnalyzeResult | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [rank, setRank] = useState<RankResult | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [appTitle, setAppTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState<number | null>(null);

  const busy = phase !== "idle" && phase !== "done" && phase !== "error";

  // Opt-in auto-trigger (engine frames + auto_trigger + session change).
  const { status } = useJarvis();

  const analyzeOnce = async () => {
    setError(null);
    setResult(null);
    setDrafts([]);
    setRank(null);
    try {
      // 1. Extract (Rust-gated: blocklisted windows refuse before pixels move).
      setPhase("extracting");
      const focused = await commands.jarvisExtract();
      setAppTitle(focused.title);
      const dataUrl = `data:image/jpeg;base64,${focused.image_base64}`;

      // 2. Vision transcript (existing chat path; stateless single-turn).
      const raw = await commands.chatWithVision(EXTRACT_PROMPT, [dataUrl], null);
      const parsed = parseTurns(raw);
      if (parsed.length === 0) throw new Error(t("jpanel.noText"));
      setTurns(parsed);

      // 3. Judge (batched Jev call; fail-closed → copy-only on error).
      setPhase("judging");
      const messages = [
        {
          role: "user",
          content: parsed.map((x) => `${x.side}: ${x.text}`).join("\n"),
        },
      ];
      const verdict = await commands.jarvisAnalyze(focused.title, messages);
      setResult(verdict);

      // 4. Draft-3 (POINT execution disabled server-side; display only).
      setPhase("drafting");
      const d = await commands.jarvisDraft(focused.title, messages, [dataUrl], null, null);
      setDrafts(d);

      // 5. Rank (dependent Jev call; falls back to draft order).
      setPhase("ranking");
      try {
        const r = await commands.jarvisRank(d);
        setRank(r);
      } catch {
        setRank({ winner: 0, ranked: d.map((_, i) => ({ index: i, prob: 0 })) });
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const fillDraft = async (text: string, idx: number) => {
    setFilling(idx);
    try {
      const out = await commands.jarvisFill(text, appTitle);
      showToast(
        out.filled ? t("jpanel.filled") : t("jpanel.copyOnly", { mode: out.mode }),
        out.filled ? "success" : "info",
      );
    } catch (e) {
      showToast(`${t("jpanel.fillFailed")}: ${e}`, "error");
    } finally {
      setFilling(null);
    }
  };

  const copyDraft = async (text: string) => {
    try {
      await commands.jarvisCopy(text);
      showToast(t("jpanel.copied"), "success");
    } catch (e) {
      showToast(`${t("jpanel.copyFailed")}: ${e}`, "error");
    }
  };

  const danger = result ? Math.round(result.verdict.danger_1idx) : 0;

  // Auto-trigger subscription (no-op unless status gates pass inside the hook).
  useJarvisAutoTrigger(analyzeOnce);

  return (
    <section className="jarvis-panel glass-panel" aria-label={t("jpanel.title")}>
      <div className="jarvis-panel-head">
        <h3>{t("jpanel.title")}</h3>
        {status?.auto_trigger && <span className="jarvis-auto">{t("jpanel.auto", "Auto")}</span>}
        <button onClick={analyzeOnce} disabled={busy} aria-busy={busy}>
          {busy ? t("jpanel.working", { phase }) : t("jpanel.analyze")}
        </button>
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error} — {t("jpanel.copyOnlyHint")}
        </p>
      )}

      {result && (
        <div className="jarvis-verdict">
          <span
            className={`jarvis-danger danger-${Math.min(9, Math.max(1, danger))}`}
            title={t("jpanel.dangerTitle")}
          >
            {t("jpanel.danger", { n: danger })}
          </span>
          <span className="jarvis-intent">{result.verdict.intent}</span>
          <span className="jarvis-action">{result.verdict.best_action}</span>
          {!result.may_fill && (
            <span className="jarvis-nofill" title={result.fill_reason}>
              {t("jpanel.copyOnlyMode")}
            </span>
          )}
          <details className="jarvis-read">
            <summary>{t("jpanel.whatWasRead")}</summary>
            <ul>
              <li>{t("jpanel.readMessages", { n: result.what_was_read.messages })}</li>
              <li>{t("jpanel.readKb", { n: result.what_was_read.kb_notes, m: result.what_was_read.kb_contacts })}</li>
              <li>{t("jpanel.readCost", { c: result.what_was_read.cost_usd.toFixed(6) })}</li>
              {result.injection && <li>{t("jpanel.injectionFlag")}</li>}
              {result.money_or_secret && <li>{t("jpanel.moneyFlag")}</li>}
            </ul>
          </details>
        </div>
      )}

      {turns.length > 0 && (
        <ol className="jarvis-turns">
          {turns.map((x, i) => (
            <li key={i} className={`jarvis-turn-${x.side}`}>
              <strong>{x.side}:</strong> {x.text}
            </li>
          ))}
        </ol>
      )}

      {drafts.length > 0 && (
        <ol className="jarvis-drafts">
          {drafts.map((d, i) => {
            const prob = rank?.ranked.find((r) => r.index === i)?.prob;
            const winner = rank?.winner === i;
            const canFill = result?.may_fill ?? false;
            return (
              <li key={i} className={winner ? "jarvis-winner" : undefined}>
                <p>{d}</p>
                <div className="jarvis-draft-row">
                  {prob !== undefined && prob > 0 && (
                    <span className="jarvis-pct">{Math.round(prob * 100)}%</span>
                  )}
                  {winner && <span className="jarvis-rec">{t("jpanel.recommended")}</span>}
                  <button
                    onClick={() => fillDraft(d, i)}
                    disabled={!canFill || filling === i}
                    title={canFill ? t("jpanel.fill") : (result?.fill_reason ?? "")}
                  >
                    {t("jpanel.fill")}
                  </button>
                  <button onClick={() => copyDraft(d)}>{t("jpanel.copy")}</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
