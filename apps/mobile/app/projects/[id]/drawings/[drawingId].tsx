import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

interface Revision {
  id: string;
  revisionCode: string;
  attachmentId: string;
  issuedDate: string;
  supersededAt: string | null;
}

export default function MobileDrawingDetailScreen() {
  const auth = useRequireAuth();
  const { drawingId } = useLocalSearchParams<{ id: string; drawingId: string }>();

  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    Promise.all([apiJson<Drawing>(`/drawings/${drawingId}`), apiJson<Revision[]>(`/drawings/${drawingId}/revisions`)])
      .then(([d, r]) => {
        setDrawing(d);
        setRevisions(r);
      })
      .catch(() => setError(i18n.t("common.errorGeneric")));
  }, [auth, drawingId]);

  const currentRevision = revisions?.find((r) => r.id === drawing?.currentRevisionId) ?? null;

  async function handleViewPdf(): Promise<void> {
    if (!currentRevision) return;
    setOpening(true);
    setError(null);
    try {
      const { downloadUrl } = await apiJson<{ downloadUrl: string }>(`/attachments/${currentRevision.attachmentId}/download`);
      await Linking.openURL(downloadUrl);
    } catch {
      setError(i18n.t("drawings.openFailed"));
    } finally {
      setOpening(false);
    }
  }

  if (!drawing || !revisions) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: drawing.sheetNumber }} />
      <Text style={styles.title}>
        {drawing.sheetNumber} — {drawing.title}
      </Text>
      <Text style={styles.subtitle}>{drawing.discipline}</Text>

      <Text style={styles.offlineNote}>{i18n.t("drawings.offlineNote")}</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {currentRevision ? (
        <Pressable style={[styles.button, opening && styles.buttonDisabled]} onPress={() => void handleViewPdf()} disabled={opening}>
          {opening ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t("drawings.viewCurrentPdf")}</Text>}
        </Pressable>
      ) : (
        <Text style={styles.hint}>{i18n.t("drawings.noRevisions")}</Text>
      )}

      <Text style={styles.sectionTitle}>{i18n.t("drawings.revisionHistory")}</Text>
      {revisions.length === 0 && <Text style={styles.hint}>{i18n.t("drawings.noRevisions")}</Text>}
      {revisions.map((rev) => (
        <View key={rev.id} style={styles.revisionRow}>
          <Text style={styles.revisionText}>
            {rev.revisionCode} — {rev.issuedDate.slice(0, 10)}
          </Text>
          <Text style={[styles.badge, !rev.supersededAt && styles.badgeCurrent]}>
            {rev.supersededAt ? i18n.t("drawings.superseded") : i18n.t("drawings.current")}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold" },
  subtitle: { fontSize: 13, color: "#182a51", marginBottom: 8 },
  offlineNote: { fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8, marginBottom: 8 },
  hint: { fontSize: 13, color: "#9a3412" },
  button: { backgroundColor: "#182a51", borderRadius: 8, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginTop: 16, marginBottom: 4 },
  revisionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 3,
    borderColor: "#171310",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  revisionText: { fontSize: 13, color: "#080f1c" },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeCurrent: { backgroundColor: "#182a51", color: "#fff" },
  error: { fontSize: 12, color: "#731c29", marginBottom: 8 },
});
