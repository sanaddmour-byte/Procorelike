import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

type PaymentApplicationStatus = "draft" | "submitted" | "certified" | "paid";

interface PaymentApplication {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PaymentApplicationStatus;
}

function statusLabel(status: PaymentApplicationStatus): string {
  return {
    draft: i18n.t("billing.statusDraft"),
    submitted: i18n.t("billing.statusSubmitted"),
    certified: i18n.t("billing.statusCertified"),
    paid: i18n.t("billing.statusPaid"),
  }[status];
}

/** View-only on mobile in this release -- see docs/ROADMAP.md's Phase 6 gate report. */
export default function MobileBillingListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [applications, setApplications] = useState<PaymentApplication[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<PaymentApplication[]>(`/payment-applications?projectId=${id}`)
      .then(setApplications)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("billing.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("billing.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!applications && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {applications && applications.length === 0 && <Text style={styles.empty}>{i18n.t("billing.empty")}</Text>}
      <FlatList
        data={applications ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/billing/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>
                  {item.periodStart.slice(0, 10)} — {item.periodEnd.slice(0, 10)}
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
  container: { flex: 1, backgroundColor: colors.cream },
  viewOnlyNote: { fontSize: 11, color: colors.orange900, backgroundColor: colors.orange50, padding: 10, margin: 16, marginBottom: 0, borderRadius: 8 },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 3, borderColor: colors.ink, borderRadius: 8, padding: 16, gap: 4, backgroundColor: colors.white },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1, color: colors.navy900 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: colors.orange100, color: colors.orange900, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
