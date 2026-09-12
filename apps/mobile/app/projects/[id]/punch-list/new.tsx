import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createPunchItem } from "@/lib/db/punch-item-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

const PRIORITIES = ["low", "medium", "high"] as const;

export default function NewPunchItemScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [saving, setSaving] = useState(false);

  function priorityLabel(p: (typeof PRIORITIES)[number]): string {
    return { low: i18n.t("punchList.priorityLow"), medium: i18n.t("punchList.priorityMedium"), high: i18n.t("punchList.priorityHigh") }[p];
  }

  async function handleSave(): Promise<void> {
    if (!description.trim()) return;
    setSaving(true);
    try {
      const item = await createPunchItem({ projectId: id, description: description.trim(), priority });
      router.replace(`/projects/${id}/punch-list/${item.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("punchList.newButton") }} />

      <Text style={styles.label}>{i18n.t("punchList.description")}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.t("punchList.descriptionPlaceholder")}
        multiline
      />

      <Text style={styles.label}>{i18n.t("punchList.priority")}</Text>
      <View style={styles.priorityRow}>
        {PRIORITIES.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPriority(p)}
            style={[styles.priorityChip, priority === p && styles.priorityChipActive]}
          >
            <Text style={[styles.priorityChipText, priority === p && styles.priorityChipTextActive]}>{priorityLabel(p)}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.button, (saving || !description.trim()) && styles.buttonDisabled]}
        onPress={() => void handleSave()}
        disabled={saving || !description.trim()}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t("common.save")}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff", padding: 16, gap: 6 },
  label: { fontSize: 13, color: "#13213f", marginTop: 8 },
  input: { borderWidth: 3, borderColor: "#171310", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  priorityRow: { flexDirection: "row", gap: 8 },
  priorityChip: { borderWidth: 3, borderColor: "#171310", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  priorityChipActive: { backgroundColor: "#182a51", borderColor: "#171310" },
  priorityChipText: { fontSize: 13, color: "#13213f" },
  priorityChipTextActive: { color: "#fff" },
  button: { marginTop: 20, backgroundColor: "#182a51", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
});
