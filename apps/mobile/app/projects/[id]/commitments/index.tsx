import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

interface Commitment {
  id: string;
  number: string;
  title: string;
  type: "subcontract" | "po";
}

function typeLabel(type: Commitment["type"]): string {
  return type === "po" ? i18n.t("commitments.typePo") : i18n.t("commitments.typeSubcontract");
}

/** View-only on mobile in this release -- see docs/ROADMAP.md's Phase 6 gate report. */
export default function MobileCommitmentsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [commitments, setCommitments] = useState<Commitment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<Commitment[]>(`/commitments?projectId=${id}`)
      .then(setCommitments)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("commitments.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("commitments.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!commitments && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {commitments && commitments.length === 0 && <Text style={styles.empty}>{i18n.t("commitments.empty")}</Text>}
      <FlatList
        data={commitments ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/commitments/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.number} — {item.title}
                </Text>
                <Text style={styles.badge}>{typeLabel(item.type)}</Text>
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
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1, color: colors.navy900 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: colors.orange100, color: colors.orange900, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
