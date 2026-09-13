import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type CorrespondenceStatus = "draft" | "sent" | "acknowledged" | "closed";

interface CorrespondenceDetail {
  id: string;
  correspondenceNumber: string;
  subject: string;
  body: string;
  status: CorrespondenceStatus;
  responseRequiredBy: string | null;
}

function statusLabel(status: CorrespondenceStatus): string {
  return {
    draft: i18n.t("correspondence.statusDraft"),
    sent: i18n.t("correspondence.statusSent"),
    acknowledged: i18n.t("correspondence.statusAcknowledged"),
    closed: i18n.t("correspondence.statusClosed"),
  }[status];
}

export default function MobileCorrespondenceDetailScreen() {
  const auth = useRequireAuth();
  const { id, correspondenceId } = useLocalSearchParams<{ id: string; correspondenceId: string }>();
  const [item, setItem] = useState<CorrespondenceDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<CorrespondenceDetail[]>(`/correspondence?projectId=${id}`)
      .then((rows) => setItem(rows.find((r) => r.id === correspondenceId) ?? null))
      .catch(() => setError(true));
  }, [auth, id, correspondenceId]);

  if (!item) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: item.correspondenceNumber }} />
      <Text style={styles.title}>{item.subject}</Text>
      <Text style={styles.subtitle}>{statusLabel(item.status)}</Text>

      <Text style={styles.viewOnlyNote}>{i18n.t("correspondence.viewOnlyNote")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardText}>{item.body}</Text>
      </View>
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
  error: { fontSize: 13, color: "#731c29" },
});
