import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type SafetyObservationCategory = "unsafe_condition" | "unsafe_act" | "near_miss" | "good_catch";
type SafetyObservationStatus = "open" | "resolved";

interface SafetyObservation {
  id: string;
  observedAt: string;
  category: SafetyObservationCategory;
  status: SafetyObservationStatus;
  description: string;
}

function categoryLabel(category: SafetyObservationCategory): string {
  return {
    unsafe_condition: i18n.t("safety.categoryUnsafeCondition"),
    unsafe_act: i18n.t("safety.categoryUnsafeAct"),
    near_miss: i18n.t("safety.categoryNearMiss"),
    good_catch: i18n.t("safety.categoryGoodCatch"),
  }[category];
}

function statusLabel(status: SafetyObservationStatus): string {
  return { open: i18n.t("safety.statusOpen"), resolved: i18n.t("safety.statusResolved") }[status];
}

/** View-only on mobile in this release — see docs/ROADMAP.md's Phase 9 gate report. */
export default function MobileSafetyObservationsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [observations, setObservations] = useState<SafetyObservation[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<SafetyObservation[]>(`/safety-observations?projectId=${id}`)
      .then(setObservations)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("safety.observationsTab") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("safety.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!observations && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {observations && observations.length === 0 && <Text style={styles.empty}>{i18n.t("safety.emptyObservations")}</Text>}
      <FlatList
        data={observations ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>{categoryLabel(item.category)}</Text>
              <Text style={styles.badge}>{statusLabel(item.status)}</Text>
            </View>
            <Text style={styles.cardText}>{item.description}</Text>
            <Text style={styles.dateText}>{item.observedAt.slice(0, 10)}</Text>
          </View>
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
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  cardText: { fontSize: 13, color: "#080f1c" },
  dateText: { fontSize: 12, color: "#182a51" },
  viewOnlyNote: { margin: 16, marginBottom: 8, fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8 },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
