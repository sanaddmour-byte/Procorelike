import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

type PaymentApplicationStatus = "draft" | "submitted" | "certified" | "paid";

interface PaymentApplicationLineDetail {
  sovLineId: string;
  description: string;
  pctCompletePrevious: string;
  pctCompleteThisPeriod: string;
  netThisPeriod: number;
}

interface PaymentApplicationDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PaymentApplicationStatus;
  lines: PaymentApplicationLineDetail[];
  totalNetThisPeriod: number;
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
export default function MobilePaymentApplicationDetailScreen() {
  useRequireAuth();
  const { paymentApplicationId } = useLocalSearchParams<{ id: string; paymentApplicationId: string }>();
  const [application, setApplication] = useState<PaymentApplicationDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiJson<PaymentApplicationDetail>(`/payment-applications/${paymentApplicationId}`)
      .then(setApplication)
      .catch(() => setError(true));
  }, [paymentApplicationId]);

  if (!application && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("billing.title") }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {application && (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {application.periodStart.slice(0, 10)} — {application.periodEnd.slice(0, 10)}
            </Text>
            <Text style={styles.badge}>{statusLabel(application.status)}</Text>
          </View>

          <FlatList
            data={application.lines}
            keyExtractor={(l) => l.sovLineId}
            contentContainerStyle={styles.list}
            ListFooterComponent={
              application.lines.length > 0 ? (
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>{i18n.t("billing.totalNetThisPeriod")}</Text>
                  <Text style={styles.totalAmount}>{application.totalNetThisPeriod.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.lineCard}>
                <Text style={styles.lineDescription}>{item.description}</Text>
                <View style={styles.lineRow}>
                  <Text style={styles.lineLabel}>
                    {i18n.t("billing.pctPrevious")}: {Number(item.pctCompletePrevious)}%
                  </Text>
                  <Text style={styles.lineLabel}>
                    {i18n.t("billing.pctThisPeriod")}: {Number(item.pctCompleteThisPeriod)}%
                  </Text>
                </View>
                <Text style={styles.lineNet}>
                  {i18n.t("billing.netThisPeriod")}: {item.netThisPeriod.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  badge: { fontSize: 12, fontFamily: "Poppins_600SemiBold", backgroundColor: colors.orange100, color: colors.orange900, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  list: { gap: 8, paddingBottom: 24 },
  lineCard: { borderWidth: 3, borderColor: colors.ink, borderRadius: 8, padding: 12, backgroundColor: colors.white, gap: 4 },
  lineDescription: { fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  lineRow: { flexDirection: "row", justifyContent: "space-between" },
  lineLabel: { fontSize: 12, color: colors.navy600 },
  lineNet: { fontSize: 13, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  totalCard: { borderWidth: 3, borderColor: colors.ink, borderRadius: 12, backgroundColor: colors.orange50, padding: 16, marginTop: 8 },
  totalLabel: { fontSize: 13, color: colors.navy700 },
  totalAmount: { fontSize: 22, fontWeight: "800", fontFamily: "Poppins_800ExtraBold", color: colors.navy900 },
  error: { padding: 16, color: colors.maroon700 },
});
