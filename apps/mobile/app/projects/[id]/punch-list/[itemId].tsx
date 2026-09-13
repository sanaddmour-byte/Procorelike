import { PUNCH_ITEM_STATUS_TRANSITIONS, type PunchItemStatus } from "@siteops/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable } from "react-native";
import { apiJson } from "@/lib/api-client";
import {
  applyPunchItemTransitionLocally,
  getPunchItem,
  updatePunchItemDescription,
  type LocalPunchItem,
} from "@/lib/db/punch-item-repo";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

interface ConflictInfo {
  field: string;
  client: unknown;
  server: unknown;
}

function statusLabel(status: PunchItemStatus): string {
  return {
    open: i18n.t("punchList.statusOpen"),
    ready_for_review: i18n.t("punchList.statusReadyForReview"),
    approved: i18n.t("punchList.statusApproved"),
    closed: i18n.t("punchList.statusClosed"),
  }[status];
}

export default function PunchItemDetailScreen() {
  useRequireAuth();
  const { itemId } = useLocalSearchParams<{ id: string; itemId: string }>();

  const [item, setItem] = useState<LocalPunchItem | null>(null);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState<PunchItemStatus | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  async function load(): Promise<void> {
    const row = await getPunchItem(itemId);
    setItem(row);
    setDescription(row?.description ?? "");
  }

  useEffect(() => {
    void load();
  }, [itemId]);

  async function handleBlur(): Promise<void> {
    if (!item || description === item.description) return;
    setSaving(true);
    try {
      await updatePunchItemDescription(itemId, description);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(toStatus: PunchItemStatus): Promise<void> {
    setTransitionError(null);
    setTransitioning(toStatus);
    try {
      const updated = await apiJson<{ status: PunchItemStatus; serverRevision: number }>(`/punch-items/${itemId}/transition`, {
        method: "POST",
        body: JSON.stringify({ toStatus }),
      });
      await applyPunchItemTransitionLocally(itemId, updated.status, updated.serverRevision);
      await load();
    } catch {
      setTransitionError(i18n.t("common.errorGeneric"));
    } finally {
      setTransitioning(null);
    }
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const conflicts = (item.conflictData as ConflictInfo[] | null) ?? [];
  const canTransition = item.syncStatus === "synced";
  const nextStatuses = PUNCH_ITEM_STATUS_TRANSITIONS[item.status];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: item.number ?? statusLabel(item.status) }} />

      {item.syncStatus === "conflict" && conflicts.length > 0 && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictTitle}>{i18n.t("punchList.conflict")}</Text>
          {conflicts.map((c) => (
            <Text key={c.field} style={styles.conflictLine}>
              {c.field}: local = &ldquo;{String(c.client)}&rdquo; · server = &ldquo;{String(c.server)}&rdquo;
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.label}>{i18n.t("punchList.description")}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        onBlur={() => void handleBlur()}
        multiline
      />
      {saving && <ActivityIndicator style={{ marginTop: 8 }} />}

      <Text style={styles.label}>{i18n.t("punchList.priority")}</Text>
      <Text style={styles.value}>
        {{ low: i18n.t("punchList.priorityLow"), medium: i18n.t("punchList.priorityMedium"), high: i18n.t("punchList.priorityHigh") }[
          item.priority
        ]}
      </Text>

      <Text style={styles.label}>{i18n.t("punchList.title")}</Text>
      <Text style={styles.value}>{statusLabel(item.status)}</Text>

      {!canTransition && <Text style={styles.hint}>{i18n.t("sync.offline")}</Text>}
      {transitionError && <Text style={styles.error}>{transitionError}</Text>}

      {canTransition && nextStatuses.length > 0 && (
        <View style={styles.transitionRow}>
          {nextStatuses.map((s) => (
            <Pressable
              key={s}
              style={[styles.transitionButton, transitioning === s && styles.buttonDisabled]}
              onPress={() => void handleTransition(s)}
              disabled={transitioning !== null}
            >
              {transitioning === s ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.transitionButtonText}>{statusLabel(s)}</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, color: "#13213f", marginTop: 12 },
  value: { fontSize: 16, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
  input: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  conflictBanner: { backgroundColor: "#fbebec", borderRadius: 8, padding: 12, gap: 4, marginBottom: 8 },
  conflictTitle: { color: "#5c1620", fontWeight: "700", fontFamily: "Poppins_700Bold" },
  conflictLine: { color: "#451018", fontSize: 12 },
  hint: { fontSize: 12, color: "#9a3412", marginTop: 12 },
  error: { fontSize: 12, color: "#731c29", marginTop: 8 },
  transitionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  transitionButton: { backgroundColor: "#182a51", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  buttonDisabled: { opacity: 0.6 },
  transitionButtonText: { color: "#fff", fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold" },
});
