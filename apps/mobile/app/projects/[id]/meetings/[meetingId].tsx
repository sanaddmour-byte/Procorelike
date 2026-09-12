import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

type MeetingItemStatus = "open" | "closed" | "converted";

interface MeetingItem {
  id: string;
  description: string;
  status: MeetingItemStatus;
}

interface MeetingDetail {
  id: string;
  title: string;
  occurredAt: string;
  items: MeetingItem[];
}

function statusLabel(status: MeetingItemStatus): string {
  return { open: i18n.t("meetings.statusOpen"), closed: i18n.t("meetings.statusClosed"), converted: i18n.t("meetings.statusConverted") }[status];
}

/** View-only on mobile in this release -- see docs/ROADMAP.md's Phase 7 gate report. */
export default function MobileMeetingDetailScreen() {
  useRequireAuth();
  const { meetingId } = useLocalSearchParams<{ id: string; meetingId: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiJson<MeetingDetail>(`/meetings/${meetingId}`)
      .then(setMeeting)
      .catch(() => setError(true));
  }, [meetingId]);

  if (!meeting && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: meeting?.title ?? "" }} />
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {meeting && (
        <>
          <Text style={styles.title}>{meeting.title}</Text>
          <Text style={styles.subtitle}>{new Date(meeting.occurredAt).toLocaleString()}</Text>
          <Text style={styles.sectionTitle}>{i18n.t("meetings.actionItems")}</Text>
          <FlatList
            data={meeting.items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.itemCard}>
                <Text style={styles.itemDescription}>{item.description}</Text>
                <Text style={styles.itemStatus}>{statusLabel(item.status)}</Text>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", fontFamily: "Poppins_700Bold", color: colors.navy900 },
  subtitle: { fontSize: 13, color: colors.navy600, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold", marginBottom: 8, color: colors.navy900 },
  list: { gap: 8, paddingBottom: 24 },
  itemCard: { borderWidth: 3, borderColor: colors.ink, borderRadius: 8, padding: 12, backgroundColor: colors.white, gap: 4 },
  itemDescription: { fontSize: 14, color: colors.navy900 },
  itemStatus: { fontSize: 11, fontFamily: "Poppins_600SemiBold", color: colors.orange900, backgroundColor: colors.orange100, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  error: { padding: 16, color: colors.maroon700 },
});
