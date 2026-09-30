import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { enqueueRequest, isNetworkError } from "@/lib/sync/request-queue";
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
  const { id, rfiId } = useLocalSearchParams<{ id: string; rfiId: string }>();
  const [rfi, setRfi] = useState<RfiDetail | null>(null);
  const [error, setError] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    apiJson<RfiDetail>(`/rfis/${rfiId}`)
      .then(setRfi)
      .catch(() => setError(true));
  }, [auth, rfiId]);

  async function sendAnswer(): Promise<void> {
    const responseText = answer.trim();
    if (!responseText) return;
    setSending(true);
    setNotice(null);
    try {
      try {
        await apiJson(`/rfis/${rfiId}/responses`, { method: "POST", body: JSON.stringify({ responseText, isOfficial: false }) });
        setNotice(i18n.t("rfis.answerSent"));
        setRfi(await apiJson<RfiDetail>(`/rfis/${rfiId}`));
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        // No connection: keep the answer on the device and send it on the next sync.
        await enqueueRequest({ projectId: id, method: "POST", path: `/rfis/${rfiId}/responses`, body: { responseText, isOfficial: false }, label: `${i18n.t("rfis.answerQueued")} ${rfi?.number ?? ""}` });
        setNotice(i18n.t("rfis.answerQueued"));
      }
      setAnswer("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setNotice(i18n.t("common.errorGeneric"));
    } finally {
      setSending(false);
    }
  }

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

      {(rfi.status === "open" || rfi.status === "answered") && (
        <View style={styles.answerBox}>
          <Text style={styles.sectionTitle}>{i18n.t("rfis.yourAnswer")}</Text>
          <TextInput style={styles.answerInput} value={answer} onChangeText={setAnswer} multiline placeholder={i18n.t("rfis.answerPlaceholder")} />
          {notice && <Text style={styles.hint}>{notice}</Text>}
          <Pressable accessibilityRole="button" onPress={() => void sendAnswer()} disabled={sending || !answer.trim()} style={[styles.sendButton, (sending || !answer.trim()) && { opacity: 0.6 }]}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>{i18n.t("rfis.sendAnswer")}</Text>}
          </Pressable>
        </View>
      )}
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
  hint: { fontSize: 13, color: "#182a51" },
  officialBadge: { alignSelf: "flex-start", fontSize: 11, backgroundColor: "#182a51", color: "#fff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  error: { fontSize: 13, color: "#731c29" },
  answerBox: { gap: 8, marginTop: 8 },
  answerInput: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, padding: 12, minHeight: 100, textAlignVertical: "top", fontSize: 15 },
  sendButton: { minHeight: 56, borderRadius: 8, backgroundColor: "#182a51", alignItems: "center", justifyContent: "center" },
  sendButtonText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
