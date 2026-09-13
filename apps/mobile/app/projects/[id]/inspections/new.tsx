import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { listCachedTemplates, type LocalChecklistTemplate } from "@/lib/db/checklist-template-repo";
import { createInspection } from "@/lib/db/inspection-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export default function NewInspectionScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [templates, setTemplates] = useState<LocalChecklistTemplate[] | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    listCachedTemplates(id).then(setTemplates);
  }, [id]);

  async function handleSelect(templateId: string): Promise<void> {
    setCreatingId(templateId);
    try {
      const inspection = await createInspection({ projectId: id, templateId });
      router.replace(`/projects/${id}/inspections/${inspection.id}`);
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("inspections.newButton") }} />
      <Text style={styles.label}>{i18n.t("inspections.selectTemplate")}</Text>
      {templates === null && <ActivityIndicator style={{ marginTop: 16 }} />}
      {templates !== null && templates.length === 0 && <Text style={styles.hint}>{i18n.t("inspections.noTemplates")}</Text>}
      <FlatList
        data={templates ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => void handleSelect(item.id)} disabled={creatingId !== null}>
            {creatingId === item.id ? <ActivityIndicator /> : <Text style={styles.cardTitle}>{item.title}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  label: { fontSize: 13, color: "#13213f", padding: 16, paddingBottom: 0 },
  hint: { margin: 16, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8, fontSize: 12 },
  list: { padding: 16, gap: 10 },
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
});
