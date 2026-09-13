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
  const [logs, setLogs] = useState<LocalDailyLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLogs(await listDailyLogs(id));
    } catch {
      setError(i18n.t("common.errorGeneric"));
    }
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
      {error && <Text style={styles.error}>{error}</Text>}
      {!logs && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {logs && logs.length === 0 && <Text style={styles.empty}>{i18n.t("dailyLog.empty")}</Text>}
      <FlatList
        data={logs ?? []}
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
  container: { flex: 1, backgroundColor: "#ffffff" },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  cardSubtitle: { fontSize: 13, color: "#182a51" },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgePending: { backgroundColor: "#fff4e6", color: "#9a3412" },
  badgeConflict: { backgroundColor: "#fbebec", color: "#5c1620" },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#5c1620" },
  headerButton: { color: "#fff", fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
});
