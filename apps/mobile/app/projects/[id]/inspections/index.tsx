import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { apiJson } from "@/lib/api-client";
import { cacheChecklistTemplate, listCachedTemplates } from "@/lib/db/checklist-template-repo";
import { listInspections, type LocalInspection } from "@/lib/db/inspection-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

interface RemoteTemplate {
  id: string;
  title: string;
}

interface RemoteTemplateDetail extends RemoteTemplate {
  items: { id: string; prompt: string; responseType: "pass_fail" | "na" | "numeric" | "photo" | "signature"; order: number }[];
}

function statusLabel(status: LocalInspection["status"]): string {
  return status === "completed" ? i18n.t("inspections.statusCompleted") : i18n.t("inspections.statusInProgress");
}

/** Caches every project template (with items) for offline use — best-effort, silently skipped when there's no connection. Called opportunistically whenever this screen loads online, same "cache while you can" idea as any reference data a field app needs before going offline. */
async function refreshTemplateCache(projectId: string): Promise<void> {
  const templates = await apiJson<RemoteTemplate[]>(`/checklist-templates?projectId=${projectId}`);
  for (const template of templates) {
    const detail = await apiJson<RemoteTemplateDetail>(`/checklist-templates/${template.id}`);
    await cacheChecklistTemplate({ id: template.id, projectId, title: template.title }, detail.items);
  }
}

export default function MobileInspectionsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inspections, setInspections] = useState<LocalInspection[]>([]);
  const [hasCachedTemplates, setHasCachedTemplates] = useState(true);

  const refresh = useCallback(async () => {
    setInspections(await listInspections(id));
    setHasCachedTemplates((await listCachedTemplates(id)).length > 0);
  }, [id]);

  useEffect(() => {
    if (!auth) return;
    refreshTemplateCache(id)
      .catch(() => undefined)
      .finally(() => void refresh());
  }, [auth, id, refresh]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: i18n.t("inspections.title"),
          headerRight: () => (
            <Link href={`/projects/${id}/inspections/new`} asChild>
              <Pressable>
                <Text style={styles.headerButton}>{i18n.t("inspections.newButton")}</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <SyncStatusBar projectId={id} onSynced={refresh} />
      {!hasCachedTemplates && <Text style={styles.hint}>{i18n.t("inspections.noTemplates")}</Text>}
      {inspections.length === 0 && <Text style={styles.empty}>{i18n.t("inspections.empty")}</Text>}
      <FlatList
        data={inspections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/inspections/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.id.slice(0, 8)}</Text>
                <Text
                  style={[
                    styles.badge,
                    item.syncStatus === "conflict" && styles.badgeConflict,
                    item.syncStatus === "pending" && styles.badgePending,
                  ]}
                >
                  {statusLabel(item.status)}
                </Text>
              </View>
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
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  badge: { fontSize: 11, backgroundColor: "#e2e8f0", color: "#334155", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgePending: { backgroundColor: "#fef3c7", color: "#92400e" },
  badgeConflict: { backgroundColor: "#fee2e2", color: "#991b1b" },
  empty: { padding: 16, color: "#64748b" },
  hint: { margin: 16, padding: 10, backgroundColor: "#fef3c7", color: "#92400e", borderRadius: 8, fontSize: 12 },
  headerButton: { color: "#fff", fontSize: 13, fontWeight: "600", marginRight: 4 },
});
