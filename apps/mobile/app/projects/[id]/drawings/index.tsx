import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

interface Drawing {
  id: string;
  sheetNumber: string;
  discipline: string;
  title: string;
  currentRevisionId: string | null;
}

/**
 * Register browsing only, online-only — no local cache, unlike Daily Log /
 * Punch List. See docs/ARCHITECTURE.md §6: drawings weren't part of the
 * Phase 2 offline scope, and viewing a PDF or dropping a markup pin on
 * mobile in this release both require a connection.
 */
export default function MobileDrawingsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [drawings, setDrawings] = useState<Drawing[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<Drawing[]>(`/drawings?projectId=${id}`)
      .then(setDrawings)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("drawings.title") }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!drawings && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {drawings && drawings.length === 0 && <Text style={styles.empty}>{i18n.t("drawings.empty")}</Text>}
      <FlatList
        data={drawings ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/drawings/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.sheetNumber} — {item.title}
                </Text>
                <Text style={styles.badge}>{item.discipline}</Text>
              </View>
              {!item.currentRevisionId && <Text style={styles.hint}>{i18n.t("drawings.noRevisions")}</Text>}
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
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  hint: { fontSize: 12, color: "#9a3412" },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
