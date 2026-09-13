import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type ScheduleTaskStatus = "not_started" | "in_progress" | "complete" | "delayed";

interface ScheduleTaskDetail {
  id: string;
  name: string;
  description: string | null;
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

export default function MobileScheduleTaskDetailScreen() {
  const auth = useRequireAuth();
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const [task, setTask] = useState<ScheduleTaskDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<ScheduleTaskDetail[]>(`/schedule-tasks?projectId=${id}`)
      .then((rows) => setTask(rows.find((r) => r.id === taskId) ?? null))
      .catch(() => setError(true));
  }, [auth, id, taskId]);

  if (!task) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: task.name }} />
      <Text style={styles.title}>{task.name}</Text>
      <Text style={styles.subtitle}>
        {statusLabel(task.status)} · {task.startDate.slice(0, 10)} – {task.endDate.slice(0, 10)}
      </Text>

      <Text style={styles.viewOnlyNote}>{i18n.t("schedule.viewOnlyNote")}</Text>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${task.percentComplete}%` }]} />
        </View>
        <Text style={styles.percentText}>{task.percentComplete}%</Text>
      </View>

      {task.description && (
        <View style={styles.card}>
          <Text style={styles.cardText}>{task.description}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold" },
  subtitle: { fontSize: 13, color: "#182a51" },
  viewOnlyNote: { fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8, marginVertical: 8 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  progressTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: "#fbf4e8", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#182a51" },
  percentText: { fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: "#080f1c" },
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 12, gap: 4, marginBottom: 4 },
  cardText: { fontSize: 14, color: "#080f1c" },
  error: { fontSize: 13, color: "#731c29" },
});
