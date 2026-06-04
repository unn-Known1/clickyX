/**
 * OnboardingMedia — intro video with animated SVG fallback.
 *
 * Attempts to play /onboarding/intro.mp4. If the file is missing or
 * the browser cannot play it, falls back to an animated SVG illustration.
 *
 * Place an MP4 at public/onboarding/intro.mp4 to enable the video.
 * See public/onboarding/README.md for asset requirements.
 */
import { useState } from "react";

function OnboardingIllustration() {
  return (
    <div className="onboarding-illustration">
      <div className="onboarding-logo">✦</div>
      <div className="onboarding-rings" />
    </div>
  );
}

export function OnboardingIntro() {
  const [videoError, setVideoError] = useState(false);

  if (videoError) {
    return <OnboardingIllustration />;
  }

  return (
    <video
      src="/onboarding/intro.mp4"
      autoPlay
      muted
      loop
      playsInline
      onError={() => setVideoError(true)}
      className="onboarding-video"
      aria-hidden="true"
    />
  );
}
