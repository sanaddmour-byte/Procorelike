import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

type ChangeOrderStatus = "draft" | "pending_approval" | "approved" | "rejected" | "void";

interface ChangeOrder {
  id: string;
  number: string;
  costImpact: string;
  status: ChangeOrderStatus;
}

function statusLabel(status: ChangeOrderStatus): string {
  return {
    draft: i18n.t("changeManagement.statusDraft"),
    pending_approval: i18n.t("changeManagement.statusPendingApproval"),
    approved: i18n.t("changeManagement.statusApproved"),
    rejected: i18n.t("changeManagement.statusRejected"),
    void: i18n.t("changeManagement.statusVoid"),
  }[status];
}

/** View-only on mobile in this release -- see docs/ROADMAP.md's Phase 6 gate report. */
export default function MobileChangeOrdersListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<ChangeOrder[]>(`/change-orders?projectId=${id}`)
      .then(setChangeOrders)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("changeManagement.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("changeManagement.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!changeOrders && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {changeOrders && changeOrders.length === 0 && <Text style={styles.empty}>{i18n.t("changeManagement.empty")}</Text>}
      <FlatList
        data={changeOrders ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/change-orders/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.number}</Text>
                <Text style={styles.badge}>{statusLabel(item.status)}</Text>
              </View>
              <Text style={styles.cardAmount}>{Number(item.costImpact).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  viewOnlyNote: { fontSize: 11, color: colors.orange900, backgroundColor: colors.orange50, padding: 10, margin: 16, marginBottom: 0, borderRadius: 8 },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 4, backgroundColor: colors.white },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  cardAmount: { fontSize: 13, color: colors.navy600 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: colors.orange100, color: colors.orange900, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
