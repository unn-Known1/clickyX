import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../../bindings";
import type { PermissionStatus } from "../../bindings";

const PERMISSION_LIST = ["microphone", "screen_recording", "notifications", "camera", "accessibility"];

function PermissionsSettings() {
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
          description: granted ? "Granted" : "Denied",
        },
      }));
    } catch (e) {
      console.error(`Failed to request ${permission}:`, e);
    } finally {
      setRequesting(null);
    }
  }, [queryClient]);

  const labelMap: Record<string, string> = {
    microphone: "Microphone",
    screen_recording: "Screen Recording",
    notifications: "Notifications",
    camera: "Camera",
    accessibility: "Accessibility",
  };

  return (
    <section className="settings-section elevated-card">
      <h3>Permissions</h3>
      {PERMISSION_LIST.map((perm) => {
        const status = statuses[perm];
        return (
          <div key={perm} className="setting-row">
            <div className="permission-info">
              <span className="permission-label">{labelMap[perm] || perm}</span>
              {status && (
                <span className={`permission-badge ${status.granted ? "granted" : "denied"}`}>
                  {status.granted ? "Granted" : "Denied"}
                </span>
              )}
            </div>
            <button
              className="permission-request-btn"
              onClick={() => requestPerm(perm)}
              disabled={requesting === perm || status?.granted}
            >
              {requesting === perm ? "Requesting..." : status?.granted ? "OK" : "Request"}
            </button>
          </div>
        );
      })}
    </section>
  );
}

export default PermissionsSettings;
