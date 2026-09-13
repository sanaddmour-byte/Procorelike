import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

interface CommitmentLineItem {
  id: string;
  description: string;
  scheduleOfValuesAmount: string;
}

interface CommitmentDetail {
  id: string;
  number: string;
  title: string;
  retentionPct: string;
  lineItems: CommitmentLineItem[];
  contractValue: number;
}

/** View-only on mobile in this release -- see docs/ROADMAP.md's Phase 6 gate report. */
export default function MobileCommitmentDetailScreen() {
  useRequireAuth();
  const { commitmentId } = useLocalSearchParams<{ id: string; commitmentId: string }>();
  const [commitment, setCommitment] = useState<CommitmentDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiJson<CommitmentDetail>(`/commitments/${commitmentId}`)
      .then(setCommitment)
      .catch(() => setError(true));
  }, [commitmentId]);

  if (!commitment && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: commitment?.number ?? "" }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {commitment && (
        <>
          <Text style={styles.title}>{commitment.title}</Text>
          <Text style={styles.subtitle}>
            {i18n.t("commitments.retentionPct")}: {commitment.retentionPct}%
          </Text>

          <View style={styles.contractValueCard}>
            <Text style={styles.contractValueLabel}>{i18n.t("commitments.contractValue")}</Text>
            <Text style={styles.contractValueAmount}>{commitment.contractValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
          </View>

          <Text style={styles.sectionTitle}>{i18n.t("commitments.lineItems")}</Text>
          {commitment.lineItems.length === 0 && <Text style={styles.empty}>{i18n.t("commitments.noLineItems")}</Text>}
          <FlatList
            data={commitment.lineItems}
            keyExtractor={(li) => li.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.lineCard}>
                <Text style={styles.lineDescription}>{item.description}</Text>
                <Text style={styles.lineAmount}>{Number(item.scheduleOfValuesAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
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
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  subtitle: { fontSize: 13, color: colors.navy600, marginBottom: 12 },
  contractValueCard: { borderWidth: 1, borderColor: colors.ink, borderRadius: 12, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, backgroundColor: colors.orange50, padding: 16, marginBottom: 16 },
  contractValueLabel: { fontSize: 13, color: colors.navy700 },
  contractValueAmount: { fontSize: 22, fontWeight: "800", fontFamily: "Poppins_800ExtraBold", color: colors.navy900 },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginBottom: 8, color: colors.navy900 },
  list: { gap: 8, paddingBottom: 24 },
  lineCard: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 12, backgroundColor: colors.white, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  lineDescription: { fontSize: 13, color: colors.navy900, flex: 1 },
  lineAmount: { fontSize: 13, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  empty: { color: colors.navy600, marginBottom: 8 },
  error: { padding: 16, color: colors.maroon700 },
});
