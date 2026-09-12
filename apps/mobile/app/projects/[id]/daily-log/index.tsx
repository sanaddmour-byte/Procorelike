import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { listDailyLogs, type LocalDailyLog } from "@/lib/db/daily-log-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

function statusLabel(log: LocalDailyLog): string {
  if (log.syncStatus === "conflict") return i18n.t("dailyLog.conflict");
  if (log.syncStatus === "pending") return i18n.t("dailyLog.pending");
  return i18n.t("dailyLog.synced");
}

export default function DailyLogListScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);

  const refresh = useCallback(async () => {
    setLogs(await listDailyLogs(id));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: i18n.t("dailyLog.title"),
          headerRight: () => (
            <Link href={`/projects/${id}/daily-log/new`} asChild>
              <Pressable>
                <Text style={styles.headerButton}>{i18n.t("dailyLog.newButton")}</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <SyncStatusBar projectId={id} onSynced={refresh} />
      {logs.length === 0 && <Text style={styles.empty}>{i18n.t("dailyLog.empty")}</Text>}
      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/daily-log/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.logDate}</Text>
                <Text
                  style={[
                    styles.badge,
                    item.syncStatus === "conflict" && styles.badgeConflict,
                    item.syncStatus === "pending" && styles.badgePending,
                  ]}
                >
                  {statusLabel(item)}
                </Text>
              </View>
              {item.notes && (
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {item.notes}
                </Text>
              )}
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 16, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardSubtitle: { fontSize: 13, color: "#64748b" },
  badge: { fontSize: 11, backgroundColor: "#e2e8f0", color: "#334155", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgePending: { backgroundColor: "#fef3c7", color: "#92400e" },
  badgeConflict: { backgroundColor: "#fee2e2", color: "#991b1b" },
  empty: { padding: 16, color: "#64748b" },
  headerButton: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
