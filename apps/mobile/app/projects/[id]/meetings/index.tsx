import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

interface Meeting {
  id: string;
  title: string;
  occurredAt: string;
}

/** View-only on mobile in this release -- see docs/ROADMAP.md's Phase 7 gate report. */
export default function MobileMeetingsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<Meeting[]>(`/meetings?projectId=${id}`)
      .then((rows) => setMeetings(rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))))
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("meetings.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("meetings.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!meetings && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {meetings && meetings.length === 0 && <Text style={styles.empty}>{i18n.t("meetings.empty")}</Text>}
      <FlatList
        data={meetings ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/meetings/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.cardSubtitle}>{new Date(item.occurredAt).toLocaleString()}</Text>
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
  card: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, shadowColor: colors.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 4, backgroundColor: colors.white },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  cardSubtitle: { fontSize: 12, color: colors.navy600 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
