import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type RfiStatus = "draft" | "open" | "answered" | "closed";

interface RfiResponse {
  id: string;
  responseText: string;
  isOfficial: boolean;
  createdAt: string;
}

interface RfiDetail {
  id: string;
  number: string;
  subject: string;
  question: string;
  status: RfiStatus;
  ballInCourtUserId: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  responses: RfiResponse[];
}

function statusLabel(status: RfiStatus): string {
  return {
    draft: i18n.t("rfis.statusDraft"),
    open: i18n.t("rfis.statusOpen"),
    answered: i18n.t("rfis.statusAnswered"),
    closed: i18n.t("rfis.statusClosed"),
  }[status];
}

export default function MobileRfiDetailScreen() {
  const auth = useRequireAuth();
  const { rfiId } = useLocalSearchParams<{ id: string; rfiId: string }>();
  const [rfi, setRfi] = useState<RfiDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<RfiDetail>(`/rfis/${rfiId}`)
      .then(setRfi)
      .catch(() => setError(true));
  }, [auth, rfiId]);

  if (!rfi) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: rfi.number }} />
      <Text style={styles.title}>{rfi.subject}</Text>
      <Text style={styles.subtitle}>
        {statusLabel(rfi.status)}
        {rfi.isOverdue ? ` · ${i18n.t("rfis.overdue")}` : ""}
      </Text>

      <Text style={styles.viewOnlyNote}>{i18n.t("rfis.viewOnlyNote")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardText}>{rfi.question}</Text>
      </View>

      <Text style={styles.sectionTitle}>{i18n.t("rfis.responses")}</Text>
      {rfi.responses.length === 0 && <Text style={styles.hint}>{i18n.t("rfis.noResponses")}</Text>}
      {rfi.responses.map((r) => (
        <View key={r.id} style={styles.card}>
          {r.isOfficial && <Text style={styles.officialBadge}>{i18n.t("rfis.official")}</Text>}
          <Text style={styles.cardText}>{r.responseText}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 13, color: "#64748b" },
  viewOnlyNote: { fontSize: 12, color: "#92400e", backgroundColor: "#fef3c7", padding: 10, borderRadius: 8, marginVertical: 8 },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 12, gap: 4, marginBottom: 4 },
  cardText: { fontSize: 14, color: "#0f172a" },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 13, color: "#64748b" },
  officialBadge: { alignSelf: "flex-start", fontSize: 11, backgroundColor: "#0f172a", color: "#fff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  error: { fontSize: 13, color: "#dc2626" },
});
