import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type SafetyIncidentSeverity = "near_miss" | "minor" | "serious" | "critical";
type SafetyIncidentStatus = "open" | "investigating" | "closed";

interface SafetyIncidentDetail {
  id: string;
  occurredAt: string;
  severity: SafetyIncidentSeverity;
  status: SafetyIncidentStatus;
  description: string;
  injuredPersonName: string | null;
  correctiveAction: string | null;
}

function severityLabel(severity: SafetyIncidentSeverity): string {
  return {
    near_miss: i18n.t("safety.severityNearMiss"),
    minor: i18n.t("safety.severityMinor"),
    serious: i18n.t("safety.severitySerious"),
    critical: i18n.t("safety.severityCritical"),
  }[severity];
}

function statusLabel(status: SafetyIncidentStatus): string {
  return {
    open: i18n.t("safety.statusOpen"),
    investigating: i18n.t("safety.statusInvestigating"),
    closed: i18n.t("safety.statusClosed"),
  }[status];
}

export default function MobileSafetyIncidentDetailScreen() {
  const auth = useRequireAuth();
  const { id, incidentId } = useLocalSearchParams<{ id: string; incidentId: string }>();
  const [incident, setIncident] = useState<SafetyIncidentDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<SafetyIncidentDetail[]>(`/safety-incidents?projectId=${id}`)
      .then((rows) => setIncident(rows.find((r) => r.id === incidentId) ?? null))
      .catch(() => setError(true));
  }, [auth, id, incidentId]);

  if (!incident) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: severityLabel(incident.severity) }} />
      <Text style={styles.title}>{severityLabel(incident.severity)}</Text>
      <Text style={styles.subtitle}>
        {statusLabel(incident.status)} · {incident.occurredAt.slice(0, 10)}
        {incident.injuredPersonName ? ` · ${incident.injuredPersonName}` : ""}
      </Text>

      <Text style={styles.viewOnlyNote}>{i18n.t("safety.viewOnlyNote")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardText}>{incident.description}</Text>
      </View>

      {incident.correctiveAction && (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("safety.correctiveAction")}</Text>
          <View style={styles.card}>
            <Text style={styles.cardText}>{incident.correctiveAction}</Text>
          </View>
        </>
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
  error: { fontSize: 13, color: "#731c29" },
});
