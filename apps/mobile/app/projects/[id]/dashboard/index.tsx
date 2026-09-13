import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

interface Dashboard {
  rfis?: { total: number; open: number; overdue: number };
  punchList?: { total: number; byStatus: Record<string, number> };
  budget?: { revisedTotal: number; projectedTotal: number; varianceTotal: number };
  changeOrders?: { total: number; byStatus: Record<string, number> };
}

function money(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MobileDashboardScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<Dashboard>(`/projects/${id}/dashboard`)
      .then(setDashboard)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: i18n.t("dashboard.title") }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!dashboard && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}

      {dashboard?.rfis && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{i18n.t("dashboard.rfis")}</Text>
          <View style={styles.tileRow}>
            <Tile label={i18n.t("dashboard.rfisTotal")} value={String(dashboard.rfis.total)} />
            <Tile label={i18n.t("dashboard.rfisOpen")} value={String(dashboard.rfis.open)} />
            <Tile label={i18n.t("dashboard.rfisOverdue")} value={String(dashboard.rfis.overdue)} negative />
          </View>
        </View>
      )}

      {dashboard?.punchList && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{i18n.t("dashboard.punchList")}</Text>
          <View style={styles.tileRow}>
            {Object.entries(dashboard.punchList.byStatus).map(([status, count]) => (
              <Tile key={status} label={status} value={String(count)} />
            ))}
          </View>
        </View>
      )}

      {dashboard?.budget && (
        <View style={[styles.card, styles.budgetCard]}>
          <Text style={styles.cardTitle}>{i18n.t("dashboard.budget")}</Text>
          <View style={styles.tileRow}>
            <Tile label={i18n.t("dashboard.budgetRevised")} value={money(dashboard.budget.revisedTotal)} />
            <Tile label={i18n.t("dashboard.budgetProjected")} value={money(dashboard.budget.projectedTotal)} />
            <Tile label={i18n.t("dashboard.budgetVariance")} value={money(dashboard.budget.varianceTotal)} negative={dashboard.budget.varianceTotal < 0} />
          </View>
        </View>
      )}

      {dashboard?.changeOrders && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{i18n.t("dashboard.changeOrders")}</Text>
          <View style={styles.tileRow}>
            {Object.entries(dashboard.changeOrders.byStatus).map(([status, count]) => (
              <Tile key={status} label={status} value={String(count)} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Tile({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, negative && styles.tileValueNegative]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 16, gap: 14 },
  card: { borderWidth: 1, borderColor: colors.ink, borderRadius: 12, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, backgroundColor: colors.white, padding: 16, gap: 10 },
  budgetCard: { backgroundColor: colors.orange50 },
  cardTitle: { fontSize: 13, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy700, textTransform: "uppercase" },
  tileRow: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  tile: { minWidth: 70 },
  tileValue: { fontSize: 20, fontWeight: "800", fontFamily: "Poppins_800ExtraBold", color: colors.navy900 },
  tileValueNegative: { color: colors.maroon700 },
  tileLabel: { fontSize: 11, color: colors.navy600 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
