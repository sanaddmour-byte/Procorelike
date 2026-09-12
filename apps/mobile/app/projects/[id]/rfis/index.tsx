import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type RfiStatus = "draft" | "open" | "answered" | "closed";

interface Rfi {
  id: string;
  number: string;
  subject: string;
  status: RfiStatus;
  isOverdue: boolean;
}

function statusLabel(status: RfiStatus): string {
  return {
    draft: i18n.t("rfis.statusDraft"),
    open: i18n.t("rfis.statusOpen"),
    answered: i18n.t("rfis.statusAnswered"),
    closed: i18n.t("rfis.statusClosed"),
  }[status];
}

/** View-only on mobile in this release — see docs/ROADMAP.md's Phase 4 gate report. */
export default function MobileRfisListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rfis, setRfis] = useState<Rfi[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<Rfi[]>(`/rfis?projectId=${id}`)
      .then(setRfis)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("rfis.title") }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!rfis && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {rfis && rfis.length === 0 && <Text style={styles.empty}>{i18n.t("rfis.empty")}</Text>}
      <FlatList
        data={rfis ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/rfis/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.number} — {item.subject}
                </Text>
                <View style={styles.badgeRow}>
                  {item.isOverdue && <Text style={styles.badgeOverdue}>{i18n.t("rfis.overdue")}</Text>}
                  <Text style={styles.badge}>{statusLabel(item.status)}</Text>
                </View>
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
  badgeRow: { flexDirection: "row", gap: 6 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeOverdue: { fontSize: 11, backgroundColor: "#fbebec", color: "#5c1620", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
