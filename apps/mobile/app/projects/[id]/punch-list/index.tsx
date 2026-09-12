import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { listPunchItems, type LocalPunchItem } from "@/lib/db/punch-item-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

function statusLabel(status: LocalPunchItem["status"]): string {
  return {
    open: i18n.t("punchList.statusOpen"),
    ready_for_review: i18n.t("punchList.statusReadyForReview"),
    approved: i18n.t("punchList.statusApproved"),
    closed: i18n.t("punchList.statusClosed"),
  }[status];
}

function syncLabel(item: LocalPunchItem): string {
  if (item.syncStatus === "conflict") return i18n.t("punchList.conflict");
  if (item.syncStatus === "pending") return i18n.t("punchList.pending");
  return i18n.t("punchList.synced");
}

export default function PunchListScreen() {
  useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<LocalPunchItem[]>([]);

  const refresh = useCallback(async () => {
    setItems(await listPunchItems(id));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: i18n.t("punchList.title"),
          headerRight: () => (
            <Link href={`/projects/${id}/punch-list/new`} asChild>
              <Pressable>
                <Text style={styles.headerButton}>{i18n.t("punchList.newButton")}</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <SyncStatusBar projectId={id} onSynced={refresh} />
      {items.length === 0 && <Text style={styles.empty}>{i18n.t("punchList.empty")}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/punch-list/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.number ? `${item.number} — ` : ""}
                  {item.description}
                </Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.status}>{statusLabel(item.status)}</Text>
                <Text
                  style={[
                    styles.badge,
                    item.syncStatus === "conflict" && styles.badgeConflict,
                    item.syncStatus === "pending" && styles.badgePending,
                  ]}
                >
                  {syncLabel(item)}
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
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 16, gap: 6 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  status: { fontSize: 12, color: "#334155" },
  badge: { fontSize: 11, backgroundColor: "#e2e8f0", color: "#334155", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgePending: { backgroundColor: "#fef3c7", color: "#92400e" },
  badgeConflict: { backgroundColor: "#fee2e2", color: "#991b1b" },
  empty: { padding: 16, color: "#64748b" },
  headerButton: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
