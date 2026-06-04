# ClickyX Onboarding Media

Place the following files in this directory:

| Filename | Usage | Format |
|----------|-------|--------|
| `intro.mp4` | Onboarding wizard intro animation | MP4, H.264, ≤5MB |
| `welcome.jpg` | Welcome screen background image | JPEG, 660×400px |

These files are **not included in the repository**.

## Video requirements

- Format: MP4 (H.264, AAC audio or muted)
- Resolution: 660×400 or 1320×800 @2x
- Duration: 5–15 seconds, looping
- File size: ≤5MB

## Fallback

If `intro.mp4` is missing or cannot be played, the `OnboardingIntro` component
in `src/components/OnboardingMedia.tsx` automatically shows an animated
SVG illustration instead. No build step required.
