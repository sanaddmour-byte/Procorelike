import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { getLastSyncedAt, outboxCount } from "../lib/db/outbox-repo";
import { i18n } from "../lib/i18n";
import { syncProject, type SyncResult } from "../lib/sync/sync-engine";

interface Props {
  projectId: string;
  /** Called after a sync attempt completes (whether or not anything changed) so the screen can refresh its list from local storage. */
  onSynced?: () => void;
}

export function SyncStatusBar({ projectId, onSynced }: Props) {
  const [pending, setPending] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const refresh = useCallback(async () => {
    const [count, syncedAt] = await Promise.all([outboxCount(projectId), getLastSyncedAt()]);
    setPending(count);
    setLastSyncedAt(syncedAt);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSync(): Promise<void> {
    setSyncing(true);
    setLastResult(null);
    try {
      const result = await syncProject(projectId);
      setLastResult(result);
      await refresh();
      onSynced?.();
    } finally {
      setSyncing(false);
    }
  }

  const statusLine = lastResult?.ranOffline
    ? i18n.t("sync.offline")
    : pending > 0
      ? i18n.t("sync.pendingCount", { count: pending })
      : i18n.t("sync.upToDate");

  return (
    <View style={styles.bar}>
      <View style={styles.info}>
        <Text style={styles.status}>{statusLine}</Text>
        <Text style={styles.meta}>
          {i18n.t("sync.lastSynced")}: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : i18n.t("sync.never")}
        </Text>
        {lastResult && !lastResult.ranOffline && (
          <Text style={styles.meta}>
            {i18n.t("sync.result", { pushed: lastResult.pushed, pulled: lastResult.pulled, conflicts: lastResult.conflicts })}
          </Text>
        )}
      </View>
      <Pressable onPress={() => void handleSync()} disabled={syncing} style={[styles.button, syncing && styles.buttonDisabled]}>
        {syncing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonText}>{i18n.t("sync.syncNow")}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  info: { flex: 1, gap: 2 },
  status: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  meta: { fontSize: 11, color: "#64748b" },
  button: { backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, minWidth: 92, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
