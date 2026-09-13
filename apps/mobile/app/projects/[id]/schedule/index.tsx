import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type ScheduleTaskStatus = "not_started" | "in_progress" | "complete" | "delayed";

interface ScheduleTask {
  id: string;
  name: string;
  status: ScheduleTaskStatus;
  percentComplete: number;
  startDate: string;
  endDate: string;
}

function statusLabel(status: ScheduleTaskStatus): string {
  return {
    not_started: i18n.t("schedule.statusNotStarted"),
    in_progress: i18n.t("schedule.statusInProgress"),
    complete: i18n.t("schedule.statusComplete"),
    delayed: i18n.t("schedule.statusDelayed"),
  }[status];
}

/** View-only on mobile in this release — see docs/ROADMAP.md's Phase 9 gate report. */
export default function MobileScheduleListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tasks, setTasks] = useState<ScheduleTask[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<ScheduleTask[]>(`/schedule-tasks?projectId=${id}`)
      .then(setTasks)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("schedule.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("schedule.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!tasks && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {tasks && tasks.length === 0 && <Text style={styles.empty}>{i18n.t("schedule.empty")}</Text>}
      <FlatList
        data={tasks ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/schedule/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.badge}>{statusLabel(item.status)}</Text>
              </View>
              <Text style={styles.dateRange}>
                {item.startDate.slice(0, 10)} – {item.endDate.slice(0, 10)}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${item.percentComplete}%` }]} />
              </View>
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
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 6 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dateRange: { fontSize: 12, color: "#182a51" },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: "#fbf4e8", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#182a51" },
  viewOnlyNote: { margin: 16, marginBottom: 0, fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8 },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
