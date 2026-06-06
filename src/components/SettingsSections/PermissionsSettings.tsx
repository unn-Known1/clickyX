import { useState, useEffect, useCallback } from "react";
import { commands } from "../../bindings";

interface PermissionStatus {
  permission: string;
  granted: boolean;
  description: string;
}

const PERMISSION_LIST = ["microphone", "screen_recording", "notifications", "camera", "accessibility"];

function PermissionsSettings() {
  const [statuses, setStatuses] = useState<Record<string, PermissionStatus>>({});
  const [requesting, setRequesting] = useState<string | null>(null);

  const checkAll = useCallback(async () => {
    const results: Record<string, PermissionStatus> = {};
    for (const perm of PERMISSION_LIST) {
      try {
        results[perm] = await commands.checkPermission(perm);
      } catch (e) {
        console.error(`Failed to check ${perm}:`, e);
      }
    }
    setStatuses(results);
  }, []);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  const requestPerm = useCallback(async (permission: string) => {
    setRequesting(permission);
    try {
      const granted = await commands.requestPermission(permission);
      setStatuses((prev) => ({
        ...prev,
        [permission]: {
          ...prev[permission],
          granted,
          description: granted ? "Granted" : "Denied",
        },
      }));
    } catch (e) {
      console.error(`Failed to request ${permission}:`, e);
    } finally {
      setRequesting(null);
    }
  }, []);

  const labelMap: Record<string, string> = {
    microphone: "Microphone",
    screen_recording: "Screen Recording",
    notifications: "Notifications",
    camera: "Camera",
    accessibility: "Accessibility",
  };

  return (
    <section className="settings-section">
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
