import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

type SafetyIncidentSeverity = "near_miss" | "minor" | "serious" | "critical";
type SafetyIncidentStatus = "open" | "investigating" | "closed";

interface SafetyIncident {
  id: string;
  occurredAt: string;
  severity: SafetyIncidentSeverity;
  status: SafetyIncidentStatus;
  description: string;
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

/** View-only on mobile in this release — see docs/ROADMAP.md's Phase 9 gate report. */
export default function MobileSafetyIncidentsListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [incidents, setIncidents] = useState<SafetyIncident[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    apiJson<SafetyIncident[]>(`/safety-incidents?projectId=${id}`)
      .then(setIncidents)
      .catch(() => setError(true));
  }, [auth, id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("safety.title") }} />
      <Text style={styles.viewOnlyNote}>{i18n.t("safety.viewOnlyNote")}</Text>
      <Link href={`/projects/${id}/safety/observations`} asChild>
        <Pressable style={styles.observationsLink}>
          <Text style={styles.observationsLinkText}>{i18n.t("safety.observationsTab")} →</Text>
        </Pressable>
      </Link>
      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!incidents && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {incidents && incidents.length === 0 && <Text style={styles.empty}>{i18n.t("safety.emptyIncidents")}</Text>}
      <FlatList
        data={incidents ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/safety/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.description}
                </Text>
              </View>
              <View style={styles.badgeRow}>
                <Text style={styles.badgeSeverity}>{severityLabel(item.severity)}</Text>
                <Text style={styles.badge}>{statusLabel(item.status)}</Text>
              </View>
              <Text style={styles.dateText}>{item.occurredAt.slice(0, 10)}</Text>
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
  card: { borderWidth: 1, borderColor: "#171310", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#171310", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, padding: 16, gap: 6 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1 },
  badgeRow: { flexDirection: "row", gap: 6 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#ffe4bf", color: "#7c2d12", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeSeverity: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: "#fbebec", color: "#5c1620", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dateText: { fontSize: 12, color: "#182a51" },
  observationsLink: { marginHorizontal: 16, marginBottom: 12, alignSelf: "flex-start" },
  observationsLinkText: { fontSize: 13, fontWeight: "600", fontFamily: "Poppins_600SemiBold", color: "#182a51" },
  viewOnlyNote: { margin: 16, marginBottom: 8, fontSize: 12, color: "#9a3412", backgroundColor: "#fff4e6", padding: 10, borderRadius: 8 },
  empty: { padding: 16, color: "#182a51" },
  error: { padding: 16, color: "#731c29" },
});
