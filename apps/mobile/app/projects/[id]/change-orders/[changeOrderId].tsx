import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

type ChangeOrderStatus = "draft" | "pending_approval" | "approved" | "rejected" | "void";

interface ApprovalEntry {
  role: string;
  approvedAt: string;
}

interface ChangeOrder {
  id: string;
  number: string;
  costImpact: string;
  timeImpactDays: number;
  status: ChangeOrderStatus;
  approvalChain: ApprovalEntry[];
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
export default function MobileChangeOrderDetailScreen() {
  useRequireAuth();
  const { changeOrderId } = useLocalSearchParams<{ id: string; changeOrderId: string }>();
  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiJson<ChangeOrder>(`/change-orders/${changeOrderId}`)
      .then(setCo)
      .catch(() => setError(true));
  }, [changeOrderId]);

  if (!co && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: co?.number ?? "" }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {co && (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{co.number}</Text>
            <Text style={styles.badge}>{statusLabel(co.status)}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.rowLabel}>{i18n.t("changeManagement.costImpact")}</Text>
            <Text style={styles.amount}>{Number(co.costImpact).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            <Text style={styles.rowLabel}>{i18n.t("changeManagement.timeImpactDays")}</Text>
            <Text style={styles.rowValue}>{co.timeImpactDays}</Text>
          </View>

          <Text style={styles.sectionTitle}>{i18n.t("changeManagement.approvalChain")}</Text>
          {co.approvalChain.length === 0 ? (
            <Text style={styles.empty}>{i18n.t("changeManagement.noApprovalsYet")}</Text>
          ) : (
            <FlatList
              data={co.approvalChain}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.approvalCard}>
                  <Text style={styles.approvalText}>
                    {item.role} — {new Date(item.approvedAt).toLocaleString()}
                  </Text>
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  badge: { fontSize: 12, fontFamily: "Poppins_600SemiBold", backgroundColor: colors.orange100, color: colors.orange900, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  card: { borderWidth: 1, borderColor: colors.ink, borderRadius: 12, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, backgroundColor: colors.white, padding: 16, marginBottom: 16, gap: 2 },
  rowLabel: { fontSize: 12, color: colors.navy600 },
  rowValue: { fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy900, marginBottom: 8 },
  amount: { fontSize: 20, fontWeight: "800", fontFamily: "Poppins_800ExtraBold", color: colors.navy900, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginBottom: 8, color: colors.navy900 },
  list: { gap: 8 },
  approvalCard: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 12, backgroundColor: colors.white },
  approvalText: { fontSize: 13, color: colors.navy900 },
  empty: { color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
