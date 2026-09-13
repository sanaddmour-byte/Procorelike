import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { apiJson } from "@/lib/api-client";
import { listLocalProgressUpdates, type LocalScheduleProgressUpdate } from "@/lib/db/schedule-progress-repo";
import { i18n } from "@/lib/i18n";
import { brutalShadow, colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

interface CpmTask {
  id: string;
  name: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  percentComplete: number;
  responsibleCompanyId: string | null;
}

interface CompanyName {
  companyId: string;
  name: string;
}

interface LookaheadView {
  taskIds: string[];
}

const HORIZON_WEEKS = 3;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MobileLookaheadListScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tasks, setTasks] = useState<CpmTask[] | null>(null);
  const [companies, setCompanies] = useState<CompanyName[]>([]);
  const [localUpdates, setLocalUpdates] = useState<LocalScheduleProgressUpdate[]>([]);
  const [error, setError] = useState(false);

  async function load(): Promise<void> {
    const [scheduleRes, viewRes, companiesRes] = await Promise.all([
      apiJson<{ tasks: CpmTask[] }>(`/schedules/current?projectId=${id}`).catch(() => null),
      apiJson<LookaheadView>(`/lookahead/view?projectId=${id}&weekStart=${todayIso()}&horizonWeeks=${HORIZON_WEEKS}`).catch(() => null),
      apiJson<CompanyName[]>(`/lookahead/companies?projectId=${id}`).catch(() => []),
    ]);
    setCompanies(companiesRes);
    if (!scheduleRes || !viewRes) {
      setTasks([]);
      return;
    }
    const inWindow = new Set(viewRes.taskIds);
    setTasks(scheduleRes.tasks.filter((t) => inWindow.has(t.id)));
  }

  useEffect(() => {
    if (!auth) return;
    load()
      .catch(() => setError(true));
    listLocalProgressUpdates(id).then(setLocalUpdates).catch(() => undefined);
  }, [auth, id]);

  function companyName(companyId: string | null): string {
    if (!companyId) return "—";
    return companies.find((c) => c.companyId === companyId)?.name ?? companyId;
  }

  function reviewStatusLabel(update: LocalScheduleProgressUpdate): string {
    if (update.syncStatus === "pending") return i18n.t("lookahead.statusPendingSync");
    if (update.reviewStatus === "accepted") return i18n.t("lookahead.statusAccepted");
    if (update.reviewStatus === "rejected") return i18n.t("lookahead.statusRejected");
    return i18n.t("lookahead.statusPendingReview");
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t("lookahead.title") }} />
      <SyncStatusBar projectId={id} onSynced={() => void load().then(() => listLocalProgressUpdates(id).then(setLocalUpdates))} />
      <View style={styles.actionsRow}>
        <Link href={`/projects/${id}/lookahead/commitments`} asChild>
          <Pressable style={styles.commitmentsButton}>
            <Text style={styles.commitmentsButtonText}>{i18n.t("lookahead.commitmentsTitle")}</Text>
          </Pressable>
        </Link>
      </View>

      {error && <Text style={styles.error}>{i18n.t("common.errorGeneric")}</Text>}
      {!tasks && !error && <Text style={styles.empty}>{i18n.t("common.loading")}</Text>}
      {tasks && tasks.length === 0 && <Text style={styles.empty}>{i18n.t("lookahead.empty")}</Text>}

      <FlatList
        data={tasks ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          localUpdates.length > 0 ? (
            <View style={styles.updatesSection}>
              <Text style={styles.sectionTitle}>{i18n.t("lookahead.myUpdates")}</Text>
              {localUpdates.map((u) => (
                <View key={u.id} style={styles.updateRow}>
                  <Text style={styles.updateText}>
                    {u.proposedPercentComplete !== null ? `${u.proposedPercentComplete}%` : ""} {u.note ?? ""}
                  </Text>
                  <Text style={styles.updateBadge}>{reviewStatusLabel(u)}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Link href={`/projects/${id}/lookahead/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.badge}>{item.percentComplete}%</Text>
              </View>
              <Text style={styles.dateRange}>
                {item.plannedStart?.slice(0, 10) ?? "—"} – {item.plannedFinish?.slice(0, 10) ?? "—"}
              </Text>
              <Text style={styles.company}>{companyName(item.responsibleCompanyId)}</Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  actionsRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 12 },
  commitmentsButton: { borderWidth: 1, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.white, ...brutalShadow(2) },
  commitmentsButtonText: { fontSize: 13, fontFamily: "Poppins_600SemiBold", color: colors.navy800 },
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: colors.ink, borderRadius: 12, backgroundColor: colors.white, padding: 16, gap: 6, ...brutalShadow(3) },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Poppins_600SemiBold", flex: 1, color: colors.navy900 },
  badge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", backgroundColor: colors.orange100, color: colors.maroon700, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dateRange: { fontSize: 12, color: colors.navy600 },
  company: { fontSize: 12, color: colors.navy700, fontFamily: "Poppins_600SemiBold" },
  updatesSection: { marginBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  updateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.ink, borderRadius: 8, backgroundColor: colors.white, padding: 10, ...brutalShadow(2) },
  updateText: { fontSize: 13, color: colors.navy800, flex: 1 },
  updateBadge: { fontSize: 11, fontFamily: "Poppins_600SemiBold", color: colors.maroon700 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 16, color: colors.maroon700 },
});
