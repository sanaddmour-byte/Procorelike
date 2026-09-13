import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type TmTicketStatus = "draft" | "submitted" | "approved" | "rejected";

interface LaborEntry {
  id: string;
  workerName: string;
  trade: string | null;
  hours: string;
  rate: string;
}
interface EquipmentEntry {
  id: string;
  description: string;
  hours: string;
  rate: string;
}
interface MaterialEntry {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

interface TmTicketDetail {
  id: string;
  ticketNumber: string;
  workDate: string;
  description: string;
  status: TmTicketStatus;
  rejectionReason: string | null;
  laborEntries: LaborEntry[];
  equipmentEntries: EquipmentEntry[];
  materialEntries: MaterialEntry[];
  totalAmount: number;
}

function statusLabel(status: TmTicketStatus): string {
  return {
    draft: i18n.t("tmTickets.statusDraft"),
    submitted: i18n.t("tmTickets.statusSubmitted"),
    approved: i18n.t("tmTickets.statusApproved"),
    rejected: i18n.t("tmTickets.statusRejected"),
  }[status];
}

export default function MobileTmTicketDetailScreen() {
  const auth = useRequireAuth();
  const { ticketId } = useLocalSearchParams<{ id: string; ticketId: string }>();
  const [ticket, setTicket] = useState<TmTicketDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<TmTicketDetail>(`/tm-tickets/${ticketId}`)
      .then(setTicket)
      .catch(() => setError(true));
  }, [auth, ticketId]);

  if (!ticket) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: ticket.ticketNumber }} />
      <Text style={styles.title}>{ticket.ticketNumber}</Text>
      <Text style={styles.subtitle}>
        {statusLabel(ticket.status)} · {ticket.workDate.slice(0, 10)}
      </Text>

      <Text style={styles.viewOnlyNote}>{i18n.t("tmTickets.viewOnlyNote")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardText}>{ticket.description}</Text>
      </View>

      {ticket.rejectionReason && (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("tmTickets.rejectionReason")}</Text>
          <View style={styles.card}>
            <Text style={styles.cardText}>{ticket.rejectionReason}</Text>
          </View>
        </>
      )}

      {ticket.laborEntries.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("tmTickets.labor")}</Text>
          {ticket.laborEntries.map((l) => (
            <View key={l.id} style={styles.card}>
              <Text style={styles.cardText}>
                {l.workerName}
                {l.trade ? ` (${l.trade})` : ""} — {Number(l.hours)}h × {Number(l.rate)}
              </Text>
            </View>
          ))}
        </>
      )}

      {ticket.equipmentEntries.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("tmTickets.equipment")}</Text>
          {ticket.equipmentEntries.map((e) => (
            <View key={e.id} style={styles.card}>
              <Text style={styles.cardText}>
                {e.description} — {Number(e.hours)}h × {Number(e.rate)}
              </Text>
            </View>
          ))}
        </>
      )}

      {ticket.materialEntries.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("tmTickets.materials")}</Text>
          {ticket.materialEntries.map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.cardText}>
                {m.description} — {Number(m.quantity)} {m.unit} × {Number(m.unitCost)}
              </Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.total}>
        {i18n.t("tmTickets.total")}: {ticket.totalAmount.toFixed(2)}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold" },
  subtitle: { fontSize: 13, color: "#182a51" },
  viewOnlyNote: { fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8, marginVertical: 8 },
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 12, gap: 4, marginBottom: 4 },
  cardText: { fontSize: 14, color: "#080f1c" },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginTop: 12, marginBottom: 4 },
  total: { fontSize: 16, fontWeight: "700", fontFamily: "Poppins_700Bold", marginTop: 12, color: "#080f1c" },
  error: { fontSize: 13, color: "#731c29" },
});
