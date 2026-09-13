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
  const [inspections, setInspections] = useState<LocalInspection[] | null>(null);
  const [hasCachedTemplates, setHasCachedTemplates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInspections(await listInspections(id));
      setHasCachedTemplates((await listCachedTemplates(id)).length > 0);
    } catch {
      setError(i18n.t("common.errorGeneric"));
    }
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
      {error && <Text style={styles.error}>{error}</Text>}
      {!inspections && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {inspections && inspections.length === 0 && <Text style={styles.empty}>{i18n.t("inspections.empty")}</Text>}
      <FlatList
        data={inspections ?? []}
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
  container: { flex: 1, backgroundColor: "#ffffff" },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgePending: { backgroundColor: "#fff4e6", color: "#9a3412" },
  badgeConflict: { backgroundColor: "#fbebec", color: "#5c1620" },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#5c1620" },
  hint: { margin: 16, padding: 10, backgroundColor: "#fff4e6", color: "#9a3412", borderRadius: 8, fontSize: 12 },
  headerButton: { color: "#fff", fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginRight: 4 },
});
