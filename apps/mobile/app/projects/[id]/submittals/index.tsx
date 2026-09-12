import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type SubmittalStatus = "draft" | "in_review" | "approved" | "closed";

interface Submittal {
  id: string;
  number: string;
  title: string;
  status: SubmittalStatus;
}

function statusLabel(status: SubmittalStatus): string {
  return {
    draft: i18n.t("submittals.statusDraft"),
    in_review: i18n.t("submittals.statusInReview"),
    approved: i18n.t("submittals.statusApproved"),
    closed: i18n.t("submittals.statusClosed"),
  }[status];
}

/** View-only on mobile in this release — see docs/ROADMAP.md's Phase 4 gate report. */
export default function MobileSubmittalsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [submittals, setSubmittals] = useState<Submittal[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<Submittal[]>(`/submittals?projectId=${id}`)
      .then(setSubmittals)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("submittals.title") }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!submittals && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {submittals && submittals.length === 0 && <Text style={styles.empty}>{i18n.t("submittals.empty")}</Text>}
      <FlatList
        data={submittals ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/submittals/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.number} — {item.title}
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
  container: { flex: 1, backgroundColor: "#ffffff" },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 3, borderColor: "#171310", borderRadius: 8, padding: 16, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
