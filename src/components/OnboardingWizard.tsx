import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "../bindings";
import { OnboardingIntro } from "./OnboardingMedia";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

interface PermissionStep {
  id: "microphone" | "screen_recording" | "accessibility" | "notifications";
  icon: IconName;
}

// NOTE (P1 CUT): no camera step — ClickyX uses screen capture (xcap), not a
// camera. A camera permission step trained users to distrust the product.
// Titles/descriptions/hints resolve through i18n (onboard.steps.<id>).
const STEPS: PermissionStep[] = [
  { id: "microphone", icon: "mic" },
  { id: "screen_recording", icon: "screen" },
  { id: "accessibility", icon: "keyboard" },
  { id: "notifications", icon: "bell" },
];

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    checkAllPermissions();

    // Recheck permissions when the window gains focus (e.g., after the user toggles privacy settings)
    window.addEventListener("focus", checkAllPermissions);
    return () => {
      window.removeEventListener("focus", checkAllPermissions);
    };
  }, []);

  async function checkAllPermissions() {
    const results: Record<string, boolean> = {};
    for (const step of STEPS) {
      try {
        results[step.id] = (await commands.checkPermission(step.id)).granted;
      } catch {
        results[step.id] = false;
      }
    }
    setPermissions(results);
  }

  async function requestCurrentPermission() {
    const step = STEPS[currentStep];
    try {
      await commands.requestPermission(step.id);
      const result = await commands.checkPermission(step.id);
      setPermissions(prev => ({ ...prev, [step.id]: result.granted }));
    } catch (e) {
      console.error(`Permission request failed for ${step.id}:`, e);
    }
  }

  async function handleFinish() {
    setCompleting(true);
    try {
      await commands.updateConfig({ onboarding_completed: true });
    } catch (e) {
      console.error("Failed to save onboarding state:", e);
    }
    onComplete();
  }

  function isStepAccessible(_idx: number) {
    return true;
  }

  const step = STEPS[currentStep];
  const granted = permissions[step?.id];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <h1>{t("onboard.welcome")}</h1>
          <p className="onboarding-subtitle">
            {t("onboard.subtitle")}
          </p>
        </div>

        <div className="onboarding-progress">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`onboarding-step-dot ${i === currentStep ? "active" : ""} ${permissions[STEPS[i].id] ? "completed" : ""}`}
              onClick={() => isStepAccessible(i) && setCurrentStep(i)}
            />
          ))}
          <span className="onboarding-step-count">
            {t("onboard.stepOf", { n: currentStep + 1, total: STEPS.length })}
          </span>
        </div>

        <div className="onboarding-step-content">
          {currentStep === 0 && <OnboardingIntro />}
          <div className="onboarding-step-icon">
            <Icon name={step.icon} size={40} />
          </div>
          <h2>{t(`onboard.steps.${step.id}.title`)}</h2>
          <p>{t(`onboard.steps.${step.id}.desc`)}</p>
          <div className="onboarding-permission-status">
            {granted === true ? (
              <span className="permission-granted">✅ {t("onboard.granted")}</span>
            ) : granted === false ? (
              <span className="permission-denied">❌ {t("onboard.notGranted")}</span>
            ) : (
              <span className="permission-unknown">⏳ {t("onboard.checking")}</span>
            )}
          </div>
          <button
            className="onboarding-action-btn"
            onClick={requestCurrentPermission}
            disabled={granted === true}
          >
            {granted === true ? t("onboard.granted") : t("onboard.grantPermission")}
          </button>
          <details className="onboarding-os-hint">
            <summary>{t("onboard.osInstructions")}</summary>
            <pre>{t(`onboard.steps.${step.id}.hint`)}</pre>
          </details>
        </div>

        <div className="onboarding-footer">
          <button className="onboarding-skip-btn" onClick={onSkip}>
            {t("onboard.skip")}
          </button>
          <div className="onboarding-nav-btns">
            <button
              className="onboarding-prev-btn"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              {t("onboard.previous")}
            </button>
            {currentStep < STEPS.length - 1 ? (
              <button
                className="onboarding-next-btn"
                onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
                disabled={!isStepAccessible(currentStep + 1)}
              >
                {t("onboard.next")}
              </button>
            ) : (
              <button
                className="onboarding-finish-btn"
                onClick={handleFinish}
                disabled={completing}
              >
                {completing ? t("onboard.saving") : t("onboard.getStarted")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
