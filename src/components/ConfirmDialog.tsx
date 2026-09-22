/**
 * ConfirmDialog — reusable destructive-action confirmation.
 * Rendered via the shared dialog backdrop/box styles.
 */
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const label = confirmLabel ?? t("common.delete");
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
        <button className="dialog-close" onClick={onCancel} aria-label={t("common.cancel")} title={t("common.cancel")}>
          <Icon name="close" size={14} />
        </button>
        <h2 className="confirm-dialog-title" id="confirm-title">
          {title}
        </h2>
        <p className="confirm-dialog-text" id="confirm-text">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={() => { onConfirm(); onCancel(); }}
            type="button"
            autoFocus
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
