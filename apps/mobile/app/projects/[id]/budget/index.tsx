import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

interface BudgetLineItem {
  id: string;
  originalAmount: string;
  approvedChangesAmount: string;
  forecastToComplete: string;
  projectedAmount: string;
}

function money(value: string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** View-only on mobile in this release -- see docs/ROADMAP.md's Phase 6 gate report. */
export default function MobileBudgetListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lineItems, setLineItems] = useState<BudgetLineItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<BudgetLineItem[]>(`/budget-line-items?projectId=${id}`)
      .then(setLineItems)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("budget.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("budget.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!lineItems && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {lineItems && lineItems.length === 0 && <Text style={styles.empty}>{i18n.t("budget.empty")}</Text>}
      <FlatList
        data={lineItems ?? []}
        keyExtractor={(li) => li.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const revised = Number(item.originalAmount) + Number(item.approvedChangesAmount);
          const variance = revised - Number(item.projectedAmount);
          return (
            <View style={styles.card}>
              <Row label={i18n.t("budget.originalAmount")} value={money(item.originalAmount)} />
              <Row label={i18n.t("budget.approvedChanges")} value={money(item.approvedChangesAmount)} />
              <Row label={i18n.t("budget.revisedBudget")} value={revised.toLocaleString(undefined, { minimumFractionDigits: 2 })} />
              <Row label={i18n.t("budget.forecastToComplete")} value={money(item.forecastToComplete)} />
              <Row label={i18n.t("budget.projectedAmount")} value={money(item.projectedAmount)} />
              <Row label={i18n.t("budget.variance")} value={variance.toLocaleString(undefined, { minimumFractionDigits: 2 })} negative={variance < 0} />
            </View>
          );
        }}
      />
    </View>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, negative && styles.rowValueNegative]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  viewOnlyNote: { fontSize: 11, color: colors.orange900, backgroundColor: colors.orange50, padding: 10, margin: 16, marginBottom: 0, borderRadius: 8 },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 6, backgroundColor: colors.white },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 13, color: colors.navy600 },
  rowValue: { fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  rowValueNegative: { color: colors.maroon700 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
