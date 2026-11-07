import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { useChatGpt } from "../../hooks/useChatGpt";
import type { ChatGptStatus } from "../../hooks/useChatGpt";
import { CHATGPT_USAGE_URL } from "../../utils/aiProviders";

interface ChatGptPlanCardProps {
  /** Called after a successful sign-in (the parent switches the auth source). */
  onSignedIn?: (status: ChatGptStatus) => void;
  /** Called after sign-out (the backend has already reset the auth source). */
  onSignedOut?: () => void;
}

/**
 * "Sign in with ChatGPT": run the OpenAI side on the user's ChatGPT plan.
 * Shows the signed-in email, whether plan usage was granted, sign-out, and
 * plainly that voice (STT/TTS) still needs its own API keys.
 */
function ChatGptPlanCard({ onSignedIn, onSignedOut }: ChatGptPlanCardProps) {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const { status, isLoading, error, signIn, isSigningIn, signOut, isSigningOut } = useChatGpt();

  const handleSignIn = async () => {
    try {
      const next = await signIn();
      if (!next.plan_enabled) {
        showToast(t("providers.chatgptPlanNotGranted"), "info");
      } else {
        showToast(t("providers.chatgptSignedInToast"), "success");
      }
      onSignedIn?.(next);
    } catch (e) {
      // The backend's message is already user-facing (no tokens or bodies).
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleSignOut = async () => {
    try {
      const result = await signOut();
      showToast(
        result.revocation_confirmed
          ? t("providers.chatgptSignedOutToast")
          : t("providers.chatgptSignedOutUnconfirmed"),
        result.revocation_confirmed ? "success" : "info",
      );
      onSignedOut?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div className="ai-chatgpt-card" aria-label={t("providers.chatgptTitle")}>
      <span className="settings-hint">{t("providers.chatgptIntro")}</span>

      {isLoading && <div className="skeleton-loader" />}
      {error && !status && <div className="settings-error">{error}</div>}

      {status && !status.keychain_available && (
        <span className="settings-hint settings-hint-warn">{t("providers.chatgptNoKeychain")}</span>
      )}

      {status && !status.signed_in && (
        <div className="ai-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleSignIn()}
            disabled={isSigningIn || !status.keychain_available}
          >
            {isSigningIn ? t("providers.chatgptWaiting") : t("providers.chatgptSignIn")}
          </button>
        </div>
      )}
      {isSigningIn && <span className="settings-hint">{t("providers.chatgptWaitingHint")}</span>}

      {status?.signed_in && (
        <div className="ai-chatgpt-signed-in">
          <span className="settings-hint settings-hint-success">
            {status.email
              ? t("providers.chatgptSignedInAs", { email: status.email })
              : t("providers.chatgptSignedIn")}
          </span>
          {status.plan_enabled ? (
            <span className="settings-hint settings-hint-success">{t("providers.chatgptPlanOn")}</span>
          ) : (
            <span className="settings-hint settings-hint-warn">{t("providers.chatgptPlanOff")}</span>
          )}
          <div className="ai-actions">
            {!status.plan_enabled && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleSignIn()}
                disabled={isSigningIn}
              >
                {isSigningIn ? t("providers.chatgptWaiting") : t("providers.chatgptSignInAgain")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
            >
              {t("providers.chatgptSignOut")}
            </button>
          </div>
        </div>
      )}

      <a className="ai-doc-link" href={CHATGPT_USAGE_URL} target="_blank" rel="noopener noreferrer">
        {t("providers.chatgptUsageLink")}
      </a>
      <span className="settings-hint">{t("providers.chatgptVoiceNote")}</span>
    </div>
  );
}

export default ChatGptPlanCard;
