import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../../bindings";
import type { PermissionStatus } from "../../bindings";

const PERMISSION_LIST = ["microphone", "screen_recording", "notifications", "camera", "accessibility"];

function PermissionsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState<string | null>(null);

  // P1 (H-7): server data via react-query, not a sequential useEffect loop.
  const { data: statuses = {} } = useQuery<Record<string, PermissionStatus>>({
    queryKey: ["permissions"],
    queryFn: async () => {
      const results: Record<string, PermissionStatus> = {};
      for (const perm of PERMISSION_LIST) {
        try {
          results[perm] = await commands.checkPermission(perm);
        } catch (e) {
          console.error(`Failed to check ${perm}:`, e);
        }
      }
      return results;
    },
    staleTime: 30_000,
  });

  const requestPerm = useCallback(async (permission: string) => {
    setRequesting(permission);
    try {
      const granted = await commands.requestPermission(permission);
      queryClient.setQueryData<Record<string, PermissionStatus>>(["permissions"], (prev) => ({
        ...(prev ?? {}),
        [permission]: {
          ...(prev?.[permission] ?? { permission, description: "" }),
          granted,
          description: granted ? t("perms.granted") : t("perms.denied"),
        },
      }));
    } catch (e) {
      console.error(`Failed to request ${permission}:`, e);
    } finally {
      setRequesting(null);
    }
  }, [queryClient]);

  const labelMap: Record<string, string> = {
    microphone: t("perms.microphone"),
    screen_recording: t("perms.screen_recording"),
    notifications: t("perms.notifications"),
    camera: t("perms.camera"),
    accessibility: t("perms.accessibility"),
  };

  return (
    <section className="settings-section elevated-card">
      <h3>{t("perms.title")}</h3>
      {PERMISSION_LIST.map((perm) => {
        const status = statuses[perm];
        return (
          <div key={perm} className="setting-row">
            <div className="permission-info">
              <span className="permission-label">{labelMap[perm] || perm}</span>
              {status && (
                <span className={`permission-badge ${status.granted ? "granted" : "denied"}`}>
                  {status.granted ? t("perms.granted") : t("perms.denied")}
                </span>
              )}
            </div>
            <button
              className="permission-request-btn"
              onClick={() => requestPerm(perm)}
              disabled={requesting === perm || status?.granted}
            >
              {requesting === perm ? t("perms.requesting") : status?.granted ? t("perms.ok") : t("perms.request")}
            </button>
          </div>
        );
      })}
    </section>
  );
}

export default PermissionsSettings;
