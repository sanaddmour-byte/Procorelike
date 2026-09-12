import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getCachedTemplateItems, type LocalChecklistTemplateItem } from "@/lib/db/checklist-template-repo";
import {
  completeInspection,
  getInspection,
  getResponses,
  setResponse,
  type LocalInspection,
  type LocalInspectionResponse,
} from "@/lib/db/inspection-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

function responseValue(responses: LocalInspectionResponse[], templateItemId: string): Record<string, unknown> | undefined {
  return responses.find((r) => r.templateItemId === templateItemId)?.value;
}

export default function MobileInspectionDetailScreen() {
  useRequireAuth();
  const { inspectionId } = useLocalSearchParams<{ id: string; inspectionId: string }>();

  const [inspection, setInspection] = useState<LocalInspection | null>(null);
  const [items, setItems] = useState<LocalChecklistTemplateItem[]>([]);
  const [responses, setResponses] = useState<LocalInspectionResponse[]>([]);
  const [signedByName, setSignedByName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const loaded = await getInspection(inspectionId);
    setInspection(loaded);
    if (loaded) {
      setItems(await getCachedTemplateItems(loaded.templateId));
      setResponses(await getResponses(inspectionId));
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAnswer(templateItemId: string, value: Record<string, unknown>): Promise<void> {
    await setResponse(inspectionId, templateItemId, value);
    setResponses(await getResponses(inspectionId));
  }

  async function handleComplete(): Promise<void> {
    if (!signedByName.trim()) return;
    setBusy(true);
    try {
      await completeInspection(inspectionId, signedByName.trim());
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!inspection) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const editable = inspection.status === "in_progress";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: inspection.id.slice(0, 8) }} />
      <Text style={styles.status}>
        {inspection.status === "completed" ? i18n.t("inspections.statusCompleted") : i18n.t("inspections.statusInProgress")}
      </Text>
      <Text style={styles.offlineNote}>{i18n.t("inspections.offlineNote")}</Text>

      <Text style={styles.sectionTitle}>{i18n.t("inspections.checklist")}</Text>
      {items.map((item) => {
        const value = responseValue(responses, item.id);
        return (
          <View key={item.id} style={styles.card}>
            <Text style={styles.prompt}>{item.prompt}</Text>

            {item.responseType === "pass_fail" && (
              <View style={styles.row}>
                <Pressable
                  disabled={!editable}
                  onPress={() => void handleAnswer(item.id, { type: "pass_fail", passed: true })}
                  style={[styles.choice, value?.type === "pass_fail" && value.passed === true && styles.choicePass]}
                >
                  <Text style={value?.type === "pass_fail" && value.passed === true ? styles.choiceTextActive : styles.choiceText}>
                    {i18n.t("inspections.pass")}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={!editable}
                  onPress={() => void handleAnswer(item.id, { type: "pass_fail", passed: false })}
                  style={[styles.choice, value?.type === "pass_fail" && value.passed === false && styles.choiceFail]}
                >
                  <Text style={value?.type === "pass_fail" && value.passed === false ? styles.choiceTextActive : styles.choiceText}>
                    {i18n.t("inspections.fail")}
                  </Text>
                </Pressable>
              </View>
            )}

            {item.responseType === "na" && (
              <Pressable disabled={!editable} onPress={() => void handleAnswer(item.id, { type: "na" })} style={[styles.choice, value?.type === "na" && styles.choiceActive]}>
                <Text style={value?.type === "na" ? styles.choiceTextActive : styles.choiceText}>{i18n.t("inspections.na")}</Text>
              </Pressable>
            )}

            {item.responseType === "numeric" && (
              <TextInput
                editable={editable}
                keyboardType="numeric"
                defaultValue={value?.type === "numeric" ? String(value.number) : ""}
                onEndEditing={(e) => void handleAnswer(item.id, { type: "numeric", number: Number(e.nativeEvent.text) })}
                placeholder={i18n.t("inspections.numberPlaceholder")}
                style={styles.input}
              />
            )}

            {item.responseType === "signature" && (
              <TextInput
                editable={editable}
                defaultValue={value?.type === "signature" ? String(value.signedByName) : ""}
                onEndEditing={(e) => void handleAnswer(item.id, { type: "signature", signedByName: e.nativeEvent.text })}
                placeholder={i18n.t("inspections.signaturePlaceholder")}
                style={styles.input}
              />
            )}

            {item.responseType === "photo" && <Text style={styles.unsupported}>{i18n.t("inspections.offlineNote")}</Text>}
          </View>
        );
      })}

      {editable && (
        <View style={styles.signOffCard}>
          <Text style={styles.label}>{i18n.t("inspections.signedByName")}</Text>
          <TextInput value={signedByName} onChangeText={setSignedByName} style={styles.input} />
          <Pressable
            disabled={busy || !signedByName.trim()}
            onPress={() => void handleComplete()}
            style={[styles.completeButton, (busy || !signedByName.trim()) && styles.buttonDisabled]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.completeButtonText}>{i18n.t("inspections.completeInspection")}</Text>}
          </Pressable>
        </View>
      )}

      {inspection.status === "completed" && (
        <Text style={styles.signedOff}>
          {i18n.t("inspections.signedOffBy")}: {inspection.signedByName}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  status: { fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: "#13213f" },
  offlineNote: { fontSize: 11, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8, marginVertical: 6 },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginTop: 8, marginBottom: 4 },
  card: { borderWidth: 3, borderColor: "#171310", borderRadius: 8, padding: 12, gap: 8, marginBottom: 8 },
  prompt: { fontSize: 14, fontWeight: "500", fontFamily: "Poppins_500Medium", color: "#080f1c" },
  row: { flexDirection: "row", gap: 8 },
  choice: { borderWidth: 3, borderColor: "#171310", borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start" },
  choicePass: { backgroundColor: "#059669", borderColor: "#059669" },
  choiceFail: { backgroundColor: "#731c29", borderColor: "#731c29" },
  choiceActive: { backgroundColor: "#182a51", borderColor: "#171310" },
  choiceText: { fontSize: 13, color: "#13213f" },
  choiceTextActive: { fontSize: 13, color: "#fff", fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  input: { borderWidth: 3, borderColor: "#171310", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  unsupported: { fontSize: 12, color: "#9a3412" },
  signOffCard: { borderWidth: 3, borderColor: "#171310", borderRadius: 8, padding: 12, gap: 8, marginTop: 8, marginBottom: 16 },
  label: { fontSize: 13, color: "#13213f" },
  completeButton: { backgroundColor: "#182a51", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  completeButtonText: { color: "#fff", fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  signedOff: { fontSize: 13, color: "#13213f", marginTop: 8, marginBottom: 24 },
});
