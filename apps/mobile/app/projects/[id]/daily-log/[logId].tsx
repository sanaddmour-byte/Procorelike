import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getDailyLog, updateDailyLogNotes, type LocalDailyLog } from "@/lib/db/daily-log-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

interface ConflictInfo {
  field: string;
  client: unknown;
  server: unknown;
}

export default function DailyLogDetailScreen() {
  useRequireAuth();
  const { logId } = useLocalSearchParams<{ id: string; logId: string }>();

  const [log, setLog] = useState<LocalDailyLog | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDailyLog(logId).then((row) => {
      setLog(row);
      setNotes(row?.notes ?? "");
    });
  }, [logId]);

  async function handleBlur(): Promise<void> {
    if (!log || notes === (log.notes ?? "")) return;
    setSaving(true);
    try {
      await updateDailyLogNotes(logId, notes);
      setLog(await getDailyLog(logId));
    } finally {
      setSaving(false);
    }
  }

  if (!log) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const conflicts = (log.conflictData as ConflictInfo[] | null) ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: log.logDate }} />

      {log.syncStatus === "conflict" && conflicts.length > 0 && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictTitle}>{i18n.t("dailyLog.conflict")}</Text>
          {conflicts.map((c) => (
            <Text key={c.field} style={styles.conflictLine}>
              {c.field}: {i18n.t("common.save")} = &ldquo;{String(c.client)}&rdquo; · server = &ldquo;{String(c.server)}&rdquo;
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.label}>{i18n.t("dailyLog.logDate")}</Text>
      <Text style={styles.value}>{log.logDate}</Text>

      <Text style={styles.label}>{i18n.t("dailyLog.notes")}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        onBlur={() => void handleBlur()}
        editable={!log.lockedAt}
        multiline
        placeholder={i18n.t("dailyLog.notesPlaceholder")}
      />
      {saving && <ActivityIndicator style={{ marginTop: 8 }} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, color: "#13213f", marginTop: 12 },
  value: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  input: { borderWidth: 3, borderColor: "#171310", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textArea: { minHeight: 160, textAlignVertical: "top" },
  conflictBanner: { backgroundColor: "#fbebec", borderRadius: 8, padding: 12, gap: 4, marginBottom: 8 },
  conflictTitle: { color: "#5c1620", fontWeight: "700", fontFamily: "Poppins_700Bold" },
  conflictLine: { color: "#451018", fontSize: 12 },
});
