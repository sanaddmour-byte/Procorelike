import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createDailyLog } from "@/lib/db/daily-log-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewDailyLogScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [logDate, setLogDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const log = await createDailyLog({ projectId: id, logDate, notes: notes || undefined });
      router.replace(`/projects/${id}/daily-log/${log.id}`);
    } catch {
      setError(i18n.t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("dailyLog.newButton") }} />
      <Text style={styles.label}>{i18n.t("dailyLog.logDate")}</Text>
      <TextInput style={styles.input} value={logDate} onChangeText={setLogDate} placeholder="YYYY-MM-DD" />

      <Text style={styles.label}>{i18n.t("dailyLog.notes")}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        placeholder={i18n.t("dailyLog.notesPlaceholder")}
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={() => void handleSave()} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t("common.save")}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff", padding: 16, gap: 6 },
  label: { fontSize: 13, color: "#13213f", marginTop: 8 },
  input: { borderWidth: 3, borderColor: "#171310", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textArea: { minHeight: 120, textAlignVertical: "top" },
  error: { marginTop: 8, color: "#5c1620" },
  button: { marginTop: 20, backgroundColor: "#182a51", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
});
