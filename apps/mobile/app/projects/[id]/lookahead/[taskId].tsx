import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { createLocalProgressUpdate, listLocalProgressUpdates, type LocalScheduleProgressUpdate } from "@/lib/db/schedule-progress-repo";
import { i18n } from "@/lib/i18n";
import { brutalShadow, colors } from "@/lib/theme";
import { syncProject } from "@/lib/sync/sync-engine";
import { useRequireAuth } from "@/lib/use-require-auth";

interface CpmTask {
  id: string;
  name: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  percentComplete: number;
}

interface RecordLink {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
}

const LINKABLE_ROUTES: Record<string, (projectId: string, recordId: string) => string> = {
  rfi: (projectId, recordId) => `/projects/${projectId}/rfis/${recordId}`,
  submittal: (projectId, recordId) => `/projects/${projectId}/submittals/${recordId}`,
  punch_item: (projectId, recordId) => `/projects/${projectId}/punch-list/${recordId}`,
};

function linkedRecordLabel(type: string): string {
  return (
    {
      rfi: i18n.t("lookahead.linkedRfi"),
      submittal: i18n.t("lookahead.linkedSubmittal"),
      punch_item: i18n.t("lookahead.linkedPunchItem"),
    }[type] ?? type
  );
}

export default function MobileLookaheadTaskDetailScreen() {
  const auth = useRequireAuth();
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const [task, setTask] = useState<CpmTask | null>(null);
  const [links, setLinks] = useState<RecordLink[]>([]);
  const [localUpdates, setLocalUpdates] = useState<LocalScheduleProgressUpdate[]>([]);
  const [error, setError] = useState(false);

  const [percentComplete, setPercentComplete] = useState("");
  const [actualStart, setActualStart] = useState("");
  const [actualFinish, setActualFinish] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refreshLocalUpdates = useCallback(async () => {
    const all = await listLocalProgressUpdates(id);
    setLocalUpdates(all.filter((u) => u.taskId === taskId));
  }, [id, taskId]);

  useEffect(() => {
    if (!auth) return;
    apiJson<{ tasks: CpmTask[] }>(`/schedules/current?projectId=${id}`)
      .then((res) => setTask(res.tasks.find((t) => t.id === taskId) ?? null))
      .catch(() => setError(true));
    apiJson<RecordLink[]>(`/record-links?projectId=${id}&recordType=schedule_task&recordId=${taskId}`)
      .then(setLinks)
      .catch(() => setLinks([]));
    void refreshLocalUpdates();
  }, [auth, id, taskId, refreshLocalUpdates]);

  async function handleSubmit(): Promise<void> {
    const percent = percentComplete.trim() ? Number(percentComplete.trim()) : undefined;
    const start = actualStart.trim() || undefined;
    const finish = actualFinish.trim() || undefined;
    if (percent === undefined && !start && !finish) {
      setFormError(i18n.t("lookahead.submitRequiresOneField"));
      return;
    }
    setFormError(null);
    setSaving(true);
    setSubmitMessage(null);
    try {
      await createLocalProgressUpdate({
        projectId: id,
        taskId,
        proposedPercentComplete: percent,
        proposedActualStart: start,
        proposedActualFinish: finish,
        note: note.trim() || undefined,
      });
      setPercentComplete("");
      setActualStart("");
      setActualFinish("");
      setNote("");
      await refreshLocalUpdates();

      const result = await syncProject(id);
      setSubmitMessage(result.ranOffline ? i18n.t("lookahead.submittedOffline") : i18n.t("lookahead.submittedOnline"));
      await refreshLocalUpdates();
    } catch {
      setFormError(i18n.t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

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
        {task.plannedStart?.slice(0, 10) ?? "—"} – {task.plannedFinish?.slice(0, 10) ?? "—"}
      </Text>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${task.percentComplete}%` }]} />
        </View>
        <Text style={styles.percentText}>{task.percentComplete}%</Text>
      </View>

      <Text style={styles.sectionTitle}>{i18n.t("lookahead.linkedRecords")}</Text>
      {links.length === 0 && <Text style={styles.empty}>{i18n.t("lookahead.noLinkedRecords")}</Text>}
      {links.map((link) => {
        const otherType = link.sourceType === "schedule_task" ? link.targetType : link.sourceType;
        const otherId = link.sourceType === "schedule_task" ? link.targetId : link.sourceId;
        const route = LINKABLE_ROUTES[otherType]?.(id, otherId);
        const content = (
          <View style={styles.linkCard}>
            <Text style={styles.linkBadge}>{linkedRecordLabel(otherType)}</Text>
            <Text style={styles.linkId} numberOfLines={1}>
              {otherId}
            </Text>
          </View>
        );
        return route ? (
          <Link key={`${link.sourceType}-${link.sourceId}-${link.targetType}-${link.targetId}`} href={route} asChild>
            <Pressable>{content}</Pressable>
          </Link>
        ) : (
          <View key={`${link.sourceType}-${link.sourceId}-${link.targetType}-${link.targetId}`}>{content}</View>
        );
      })}

      <Text style={styles.sectionTitle}>{i18n.t("lookahead.submitProgress")}</Text>
      <Text style={styles.label}>{i18n.t("lookahead.percentComplete")}</Text>
      <TextInput
        style={styles.input}
        value={percentComplete}
        onChangeText={setPercentComplete}
        keyboardType="number-pad"
        placeholder="0-100"
      />
      <Text style={styles.label}>{i18n.t("lookahead.actualStart")}</Text>
      <TextInput style={styles.input} value={actualStart} onChangeText={setActualStart} placeholder="YYYY-MM-DD" />
      <Text style={styles.label}>{i18n.t("lookahead.actualFinish")}</Text>
      <TextInput style={styles.input} value={actualFinish} onChangeText={setActualFinish} placeholder="YYYY-MM-DD" />
      <Text style={styles.label}>{i18n.t("lookahead.note")}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={note}
        onChangeText={setNote}
        placeholder={i18n.t("lookahead.notePlaceholder")}
        multiline
      />

      {formError && <Text style={styles.error}>{formError}</Text>}
      {submitMessage && <Text style={styles.success}>{submitMessage}</Text>}
      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={() => void handleSubmit()} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t("lookahead.submit")}</Text>}
      </Pressable>

      {localUpdates.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("lookahead.myUpdates")}</Text>
          {localUpdates.map((u) => (
            <View key={u.id} style={styles.updateRow}>
              <Text style={styles.updateText}>
                {u.proposedPercentComplete !== null ? `${u.proposedPercentComplete}% · ` : ""}
                {u.note ?? ""}
              </Text>
              <Text style={styles.updateBadge}>
                {u.syncStatus === "pending"
                  ? i18n.t("lookahead.statusPendingSync")
                  : u.reviewStatus === "accepted"
                    ? i18n.t("lookahead.statusAccepted")
                    : u.reviewStatus === "rejected"
                      ? i18n.t("lookahead.statusRejected")
                      : i18n.t("lookahead.statusPendingReview")}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  subtitle: { fontSize: 13, color: colors.navy600 },
  sectionTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: colors.navy900, marginTop: 16 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  progressTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: colors.orange50, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.navy600 },
  percentText: { fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  label: { fontSize: 13, color: colors.navy700, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: colors.white },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  button: { marginTop: 16, backgroundColor: colors.navy600, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  error: { marginTop: 8, color: colors.maroon700 },
  success: { marginTop: 8, color: colors.navy700 },
  empty: { color: colors.navy600, fontSize: 13 },
  linkCard: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.ink, borderRadius: 8, backgroundColor: colors.white, padding: 10, marginTop: 6, ...brutalShadow(2) },
  linkBadge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: colors.orange100, color: colors.maroon700, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  linkId: { fontSize: 12, color: colors.navy700, flex: 1 },
  updateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.ink, borderRadius: 8, backgroundColor: colors.white, padding: 10, marginTop: 6, ...brutalShadow(2) },
  updateText: { fontSize: 13, color: colors.navy800, flex: 1 },
  updateBadge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", color: colors.maroon700 },
});
