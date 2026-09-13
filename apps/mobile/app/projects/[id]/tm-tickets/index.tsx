import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type TmTicketStatus = "draft" | "submitted" | "approved" | "rejected";

interface TmTicket {
  id: string;
  ticketNumber: string;
  workDate: string;
  description: string;
  status: TmTicketStatus;
}

function statusLabel(status: TmTicketStatus): string {
  return {
    draft: i18n.t("tmTickets.statusDraft"),
    submitted: i18n.t("tmTickets.statusSubmitted"),
    approved: i18n.t("tmTickets.statusApproved"),
    rejected: i18n.t("tmTickets.statusRejected"),
  }[status];
}

/** View-only on mobile in this release — see docs/ROADMAP.md's Phase 10 gate report. */
export default function MobileTmTicketsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tickets, setTickets] = useState<TmTicket[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<TmTicket[]>(`/tm-tickets?projectId=${id}`)
      .then(setTickets)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("tmTickets.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("tmTickets.viewOnlyNote")}</Text>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!tickets && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {tickets && tickets.length === 0 && <Text style={styles.empty}>{i18n.t("tmTickets.empty")}</Text>}
      <FlatList
        data={tickets ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/tm-tickets/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.ticketNumber}
                </Text>
                <Text style={styles.badge}>{statusLabel(item.status)}</Text>
              </View>
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
              <Text style={styles.dateText}>{item.workDate.slice(0, 10)}</Text>
            </Pressable>
          </Link>
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
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  description: { fontSize: 13, color: "#080f1c" },
  dateText: { fontSize: 12, color: "#182a51" },
  viewOnlyNote: { margin: 16, marginBottom: 8, fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8 },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
