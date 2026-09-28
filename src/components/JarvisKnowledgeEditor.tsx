import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "../bindings";
import type { JarvisKb } from "../bindings";
import { useAppContext } from "../context/AppContext";

/**
 * Local knowledge editor. The identity surface is intentionally small:
 * notes are tag-matched (≤5) and contacts title-matched — the contact
 * *name* is the match key and is never renamed in place (delete + re-add).
 */
export default function JarvisKnowledgeEditor() {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const [kb, setKb] = useState<JarvisKb | null>(null);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState("");
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    commands
      .jarvisGetKb()
      .then((v) => {
        if (!cancelled) setKb(v);
      })
      .catch((e) => {
        if (!cancelled) showToast(`${t("jkb.loadFailed")}: ${e}`, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast, t]);

  const persist = async (next: JarvisKb) => {
    try {
      const saved = await commands.jarvisSaveKb(next);
      setKb(saved);
      showToast(t("jkb.saved"), "success");
    } catch (e) {
      showToast(`${t("jkb.saveFailed")}: ${e}`, "error");
    }
  };

  const addNote = () => {
    if (!kb || !tag.trim() || !text.trim()) return;
    void persist({ ...kb, notes: [...kb.notes, { tag: tag.trim(), text: text.trim() }] });
    setTag("");
    setText("");
  };

  const removeNote = (idx: number) => {
    if (!kb) return;
    void persist({ ...kb, notes: kb.notes.filter((_, i) => i !== idx) });
  };

  const addContact = () => {
    if (!kb || !contact.trim()) return;
    void persist({ ...kb, contacts: [...kb.contacts, { name: contact.trim() }] });
    setContact("");
  };

  const removeContact = (idx: number) => {
    if (!kb) return;
    void persist({ ...kb, contacts: kb.contacts.filter((_, i) => i !== idx) });
  };

  const wipe = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      return;
    }
    try {
      await commands.jarvisWipe();
      setKb({ notes: [], contacts: [], history_opt_in: false });
      setConfirmWipe(false);
      showToast(t("jkb.wiped"), "success");
    } catch (e) {
      showToast(`${t("jkb.wipeFailed")}: ${e}`, "error");
    }
  };

  if (loading) return <p className="settings-hint">{t("common.loading")}</p>;
  if (!kb) return <p className="settings-error">{t("jkb.loadFailed")}</p>;

  return (
    <div className="settings-card">
      <h4>{t("jkb.title")}</h4>
      <p className="settings-hint">{t("jkb.hint")}</p>

      <ul className="jkb-list">
        {kb.notes.map((n, i) => (
          <li key={i}>
            <strong>{n.tag}:</strong> {n.text}
            <button onClick={() => removeNote(i)} aria-label={t("common.remove")}>×</button>
          </li>
        ))}
      </ul>
      <div className="settings-row">
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("jkb.tagPh")} aria-label={t("jkb.tagPh")} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("jkb.textPh")} aria-label={t("jkb.textPh")} />
        <button onClick={addNote} disabled={!tag.trim() || !text.trim()}>{t("common.add")}</button>
      </div>

      <ul className="jkb-list">
        {kb.contacts.map((c, i) => (
          <li key={i}>
            {c.name}
            <button onClick={() => removeContact(i)} aria-label={t("common.remove")}>×</button>
          </li>
        ))}
      </ul>
      <div className="settings-row">
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("jkb.contactPh")} aria-label={t("jkb.contactPh")} />
        <button onClick={addContact} disabled={!contact.trim()}>{t("common.add")}</button>
      </div>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={kb.history_opt_in}
          onChange={(e) => void persist({ ...kb, history_opt_in: e.target.checked })}
        />
        {t("jarvis.kbOptIn")}
      </label>

      <div className="settings-row">
        <button onClick={wipe} className="danger">
          {confirmWipe ? t("jkb.wipeConfirm") : t("jkb.wipe")}
        </button>
      </div>
    </div>
  );
}
