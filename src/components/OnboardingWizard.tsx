import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { OnboardingIntro } from "./OnboardingMedia";

interface PermissionStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  osHint: string;
}

const STEPS: PermissionStep[] = [
  {
    id: "microphone",
    title: "Microphone Access",
    description: "Allow ClickyX to hear your voice commands for push-to-talk and always-on voice mode.",
    icon: "🎤",
    osHint: "Windows: Settings > Privacy & Security > Microphone\nmacOS: System Settings > Privacy & Security > Microphone\nLinux: Ensure PulseAudio/ALSA is configured",
  },
  {
    id: "screen_recording",
    title: "Screen Recording",
    description: "Enable screen capture so ClickyX can see your screen and provide contextual assistance.",
    icon: "🖥️",
    osHint: "Windows: Settings > Privacy & Security > Screen Capture\nmacOS: System Settings > Privacy & Security > Screen Recording\nLinux: Ensure PipeWire or X11 sharing is enabled",
  },
  {
    id: "accessibility",
    title: "Accessibility Access",
    description: "Grant accessibility permissions for global keyboard shortcuts and automation features.",
    icon: "⌨️",
    osHint: "Windows: Settings > Accessibility > Keyboard\nmacOS: System Settings > Privacy & Security > Accessibility\nLinux: Install at-spi2-core for accessibility bridge",
  },
  {
    id: "camera",
    title: "Camera Access",
    description: "Optional: allow ClickyX to use your camera for visual context features.",
    icon: "📷",
    osHint: "Windows: Settings > Privacy & Security > Camera\nmacOS: System Settings > Privacy & Security > Camera\nLinux: Ensure V4L2 device is accessible",
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Receive desktop notifications for agent task completion, reminders, and updates.",
    icon: "🔔",
    osHint: "Windows: Settings > System > Notifications\nmacOS: System Settings > Notifications\nLinux: Ensure D-Bus notification service is running",
  },
];

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    checkAllPermissions();
  }, []);

  async function checkAllPermissions() {
    const results: Record<string, boolean> = {};
    for (const step of STEPS) {
      try {
        results[step.id] = await invoke<boolean>("check_permission", { permission: step.id });
      } catch {
        results[step.id] = false;
      }
    }
    setPermissions(results);
  }

  async function requestCurrentPermission() {
    const step = STEPS[currentStep];
    try {
      await invoke("request_permission", { permission: step.id });
      const result = await invoke<boolean>("check_permission", { permission: step.id });
      setPermissions(prev => ({ ...prev, [step.id]: result }));
    } catch (e) {
      console.error(`Permission request failed for ${step.id}:`, e);
    }
  }

  async function handleFinish() {
    setCompleting(true);
    try {
      await invoke("update_config", {
        config: { onboarding_completed: true },
      });
    } catch (e) {
      console.error("Failed to save onboarding state:", e);
    }
    onComplete();
  }

  function isStepAccessible(idx: number) {
    if (idx === 0) return true;
    return permissions[STEPS[idx - 1].id] === true;
  }

  const step = STEPS[currentStep];
  const granted = permissions[step?.id];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <h1>Welcome to ClickyX</h1>
          <p className="onboarding-subtitle">
            Your cross-platform AI companion. Let's get you set up.
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
            Step {currentStep + 1} of {STEPS.length}
          </span>
        </div>

        <div className="onboarding-step-content">
          {currentStep === 0 && <OnboardingIntro />}
          <div className="onboarding-step-icon">{step.icon}</div>
          <h2>{step.title}</h2>
          <p>{step.description}</p>
          <div className="onboarding-permission-status">
            {granted === true ? (
              <span className="permission-granted">✅ Granted</span>
            ) : granted === false ? (
              <span className="permission-denied">❌ Not granted</span>
            ) : (
              <span className="permission-unknown">⏳ Checking...</span>
            )}
          </div>
          <button
            className="onboarding-action-btn"
            onClick={requestCurrentPermission}
            disabled={granted === true}
          >
            {granted === true ? "Granted" : "Grant Permission"}
          </button>
          <details className="onboarding-os-hint">
            <summary>OS-specific instructions</summary>
            <pre>{step.osHint}</pre>
          </details>
        </div>

        <div className="onboarding-footer">
          <button className="onboarding-skip-btn" onClick={onSkip}>
            Skip
          </button>
          <div className="onboarding-nav-btns">
            <button
              className="onboarding-prev-btn"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              Previous
            </button>
            {currentStep < STEPS.length - 1 ? (
              <button
                className="onboarding-next-btn"
                onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
                disabled={!isStepAccessible(currentStep + 1)}
              >
                Next
              </button>
            ) : (
              <button
                className="onboarding-finish-btn"
                onClick={handleFinish}
                disabled={completing}
              >
                {completing ? "Saving..." : "Get Started!"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
