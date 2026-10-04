import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { MOUSE_ACTIONS, type MouseAction } from "../../hooks/useMouseFollowActions";
import {
  BURST_SIZE_PX,
  MAX_EFFECT_OPTIONS,
  TRAIL_DOTS,
  useMouseAnimationSettings,
  type BurstScale,
  type FollowSetting,
  type TrailSetting,
} from "../../hooks/useMouseAnimationSettings";

/**
 * Settings for the overlay's mouse-follow animations.
 *
 * Purely local preferences (persisted to localStorage by
 * `useMouseAnimationSettings`) — no backend round-trip, and the overlay window
 * reads them synchronously at mount.
 */
export function MouseAnimationsSettings() {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const { settings, update, setActionEnabled, reset } = useMouseAnimationSettings();

  const onReset = useCallback(() => {
    reset();
    showToast(t("mouseAnimations.resetDone"), "success");
  }, [reset, showToast, t]);

  const disabled = !settings.enabled;

  return (
    <section className="settings-section elevated-card">
      <h3>{t("mouseAnimations.title")}</h3>
      <p className="settings-hint">{t("mouseAnimations.hint")}</p>

      <div className="setting-row">
        <label htmlFor="ma-enabled">{t("mouseAnimations.enabled")}</label>
        <input
          id="ma-enabled"
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </div>

      <div className="setting-row">
        <label htmlFor="ma-trail">{t("mouseAnimations.trail")}</label>
        <select
          id="ma-trail"
          className="setting-select"
          disabled={disabled}
          value={settings.trail}
          onChange={(e) => update({ trail: e.target.value as TrailSetting })}
        >
          <option value="off">{t("mouseAnimations.trailOff")}</option>
          <option value="short">{t("mouseAnimations.trailShort")}</option>
          <option value="medium">{t("mouseAnimations.trailMedium")}</option>
          <option value="long">{t("mouseAnimations.trailLong")}</option>
        </select>
        <span className="setting-value">
          {TRAIL_DOTS[settings.trail] > 0
            ? t("mouseAnimations.dots", { n: TRAIL_DOTS[settings.trail] })
            : ""}
        </span>
      </div>

      <div className="setting-row">
        <label htmlFor="ma-follow">{t("mouseAnimations.follow")}</label>
        <select
          id="ma-follow"
          className="setting-select"
          disabled={disabled}
          value={settings.follow}
          onChange={(e) => update({ follow: e.target.value as FollowSetting })}
        >
          <option value="instant">{t("mouseAnimations.followInstant")}</option>
          <option value="smooth">{t("mouseAnimations.followSmooth")}</option>
          <option value="lazy">{t("mouseAnimations.followLazy")}</option>
        </select>
      </div>

      <div className="setting-row">
        <label htmlFor="ma-scale">{t("mouseAnimations.burstScale")}</label>
        <select
          id="ma-scale"
          className="setting-select"
          disabled={disabled}
          value={settings.burstScale}
          onChange={(e) => update({ burstScale: e.target.value as BurstScale })}
        >
          <option value="small">{t("mouseAnimations.scaleSmall")}</option>
          <option value="normal">{t("mouseAnimations.scaleNormal")}</option>
          <option value="large">{t("mouseAnimations.scaleLarge")}</option>
        </select>
        <span className="setting-value">{BURST_SIZE_PX[settings.burstScale]}px</span>
      </div>

      <div className="setting-row">
        <label htmlFor="ma-max">{t("mouseAnimations.maxEffects")}</label>
        <select
          id="ma-max"
          className="setting-select"
          disabled={disabled}
          value={settings.maxEffects}
          onChange={(e) => update({ maxEffects: Number(e.target.value) })}
        >
          {MAX_EFFECT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-row">
        <label htmlFor="ma-halo">{t("mouseAnimations.halo")}</label>
        <input
          id="ma-halo"
          type="checkbox"
          disabled={disabled}
          checked={settings.halo}
          onChange={(e) => update({ halo: e.target.checked })}
        />
      </div>

      <div className="setting-row">
        <label htmlFor="ma-idle">{t("mouseAnimations.idlePulse")}</label>
        <input
          id="ma-idle"
          type="checkbox"
          disabled={disabled}
          checked={settings.idlePulse}
          onChange={(e) => update({ idlePulse: e.target.checked })}
        />
      </div>

      <div className="setting-row">
        <label htmlFor="ma-sounds">{t("mouseAnimations.sounds")}</label>
        <input
          id="ma-sounds"
          type="checkbox"
          disabled={disabled}
          checked={settings.sounds}
          onChange={(e) => update({ sounds: e.target.checked })}
        />
      </div>

      <div className="setting-row">
        <label htmlFor="ma-accent">{t("mouseAnimations.accent")}</label>
        <input
          id="ma-accent"
          type="color"
          disabled={disabled}
          value={settings.accent || "#4fc3f7"}
          onChange={(e) => update({ accent: e.target.value })}
        />
        <button
          type="button"
          className="setting-action-btn"
          disabled={disabled || !settings.accent}
          onClick={() => update({ accent: "" })}
        >
          {t("mouseAnimations.accentReset")}
        </button>
      </div>

      <h4>{t("mouseAnimations.perAction")}</h4>
      {MOUSE_ACTIONS.map((action: MouseAction) => (
        <div className="setting-row" key={action}>
          <label htmlFor={`ma-action-${action}`}>
            {t(`mouseAnimations.actions.${action}`)}
          </label>
          <input
            id={`ma-action-${action}`}
            type="checkbox"
            disabled={disabled}
            checked={settings.actions[action] !== false}
            onChange={(e) => setActionEnabled(action, e.target.checked)}
          />
        </div>
      ))}

      <button type="button" className="setting-action-btn primary" onClick={onReset}>
        {t("mouseAnimations.reset")}
      </button>
    </section>
  );
}

export default MouseAnimationsSettings;