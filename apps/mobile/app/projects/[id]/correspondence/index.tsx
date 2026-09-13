import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type CorrespondenceStatus = "draft" | "sent" | "acknowledged" | "closed";

interface CorrespondenceItem {
  id: string;
  correspondenceNumber: string;
  subject: string;
  status: CorrespondenceStatus;
}

function statusLabel(status: CorrespondenceStatus): string {
  return {
    draft: i18n.t("correspondence.statusDraft"),
    sent: i18n.t("correspondence.statusSent"),
    acknowledged: i18n.t("correspondence.statusAcknowledged"),
    closed: i18n.t("correspondence.statusClosed"),
  }[status];
}

/** View-only on mobile in this release — see docs/ROADMAP.md's Phase 10 gate report. */
export default function MobileCorrespondenceListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<CorrespondenceItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<CorrespondenceItem[]>(`/correspondence?projectId=${id}`)
      .then(setItems)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("correspondence.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("correspondence.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!items && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {items && items.length === 0 && <Text style={styles.empty}>{i18n.t("correspondence.empty")}</Text>}
      <FlatList
        data={items ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/correspondence/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.correspondenceNumber} — {item.subject}
                </Text>
                <Text style={styles.badge}>{statusLabel(item.status)}</Text>
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
  list: { padding: 16, paddingTop: 0, gap: 12 },
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  viewOnlyNote: { margin: 16, marginBottom: 8, fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8 },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
