import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { brutalShadow, colors } from "@/lib/theme";
import { useRequireAuth } from "@/lib/use-require-auth";

type CommitmentStatus = "promised" | "confirmed" | "declined";

interface LookaheadPlan {
  id: string;
  weekStart: string;
  horizonWeeks: number;
}

interface Commitment {
  id: string;
  taskId: string;
  committedByCompanyId: string;
  promisedFinish: string;
  actualFinish: string | null;
  status: CommitmentStatus;
}

interface CompanyPpc {
  companyId: string;
  met: number;
  missed: number;
  pending: number;
  ppcPercent: number | null;
}

interface CompanyName {
  companyId: string;
  name: string;
}

function statusLabel(status: CommitmentStatus): string {
  return {
    promised: i18n.t("lookahead.commitmentStatusPromised"),
    confirmed: i18n.t("lookahead.commitmentStatusConfirmed"),
    declined: i18n.t("lookahead.commitmentStatusDeclined"),
  }[status];
}

export default function MobileLookaheadCommitmentsScreen() {
  const auth = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plans, setPlans] = useState<LookaheadPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [ppc, setPpc] = useState<CompanyPpc[]>([]);
  const [companies, setCompanies] = useState<CompanyName[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    apiJson<LookaheadPlan[]>(`/lookahead/plans?projectId=${id}`)
      .then((rows) => {
        setPlans(rows);
        const latest = rows[rows.length - 1];
        if (latest) setSelectedPlanId(latest.id);
      })
      .catch(() => setError(i18n.t("common.errorGeneric")));
    apiJson<CompanyName[]>(`/lookahead/companies?projectId=${id}`)
      .then(setCompanies)
      .catch(() => undefined);
  }, [auth, id]);

  useEffect(() => {
    if (!selectedPlanId) return;
    apiJson<Commitment[]>(`/lookahead/plans/${selectedPlanId}/commitments`)
      .then(setCommitments)
      .catch(() => setCommitments([]));
    apiJson<CompanyPpc[]>(`/lookahead/plans/${selectedPlanId}/ppc`)
      .then(setPpc)
      .catch(() => setPpc([]));
  }, [selectedPlanId]);

  function companyName(companyId: string): string {
    return companies.find((c) => c.companyId === companyId)?.name ?? companyId;
  }

  async function handleConfirmation(commitmentId: string, action: "confirm" | "decline"): Promise<void> {
    setActingId(commitmentId);
    setError(null);
    try {
      const updated = await apiJson<Commitment>(`/lookahead/commitments/${commitmentId}/${action}`, { method: "POST" });
      setCommitments((prev) => prev.map((c) => (c.id === commitmentId ? updated : c)));
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "not_committed_company") {
        setError(i18n.t("lookahead.notCommittedCompany"));
      } else {
        setError(i18n.t("common.errorGeneric"));
      }
    } finally {
      setActingId(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: i18n.t("lookahead.commitmentsTitle") }} />

      {plans.length > 1 && (
        <View style={styles.planRow}>
          {plans.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setSelectedPlanId(p.id)}
              style={[styles.planChip, selectedPlanId === p.id && styles.planChipActive]}
            >
              <Text style={[styles.planChipText, selectedPlanId === p.id && styles.planChipTextActive]}>{p.weekStart.slice(0, 10)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {plans.length === 0 && <Text style={styles.empty}>{i18n.t("lookahead.commitmentsEmpty")}</Text>}
      {selectedPlanId && commitments.length === 0 && <Text style={styles.empty}>{i18n.t("lookahead.commitmentsEmpty")}</Text>}

      {commitments.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.cardCompany}>{companyName(c.committedByCompanyId)}</Text>
          <Text style={styles.cardMeta}>
            {i18n.t("lookahead.commitmentStatusPromised")}: {c.promisedFinish.slice(0, 10)}
          </Text>
          <Text style={styles.cardStatus}>{statusLabel(c.status)}</Text>
          {c.status === "promised" && (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.confirmButton}
                onPress={() => void handleConfirmation(c.id, "confirm")}
                disabled={actingId === c.id}
              >
                {actingId === c.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>{i18n.t("lookahead.confirm")}</Text>}
              </Pressable>
              <Pressable
                style={styles.declineButton}
                onPress={() => void handleConfirmation(c.id, "decline")}
                disabled={actingId === c.id}
              >
                <Text style={styles.declineButtonText}>{i18n.t("lookahead.decline")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {ppc.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("lookahead.ppcTitle")}</Text>
          {ppc.map((row) => (
            <View key={row.companyId} style={styles.ppcRow}>
              <Text style={styles.ppcCompany}>{companyName(row.companyId)}</Text>
              <Text style={styles.ppcStat}>
                {i18n.t("lookahead.ppcMet")}: {row.met} · {i18n.t("lookahead.ppcMissed")}: {row.missed} · {i18n.t("lookahead.ppcPending")}: {row.pending}
              </Text>
              <Text style={styles.ppcPercent}>{row.ppcPercent !== null ? `${row.ppcPercent}%` : "—"}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 16, gap: 8 },
  planRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  planChip: { borderWidth: 1, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.white },
  planChipActive: { backgroundColor: colors.navy600 },
  planChipText: { fontSize: 13, color: colors.navy700 },
  planChipTextActive: { color: "#fff" },
  card: { borderWidth: 1, borderColor: colors.ink, borderRadius: 12, backgroundColor: colors.white, padding: 14, gap: 4, marginBottom: 4, ...brutalShadow(3) },
  cardCompany: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  cardMeta: { fontSize: 12, color: colors.navy600 },
  cardStatus: { fontSize: 12, fontFamily: "Poppins_600SemiBold", color: colors.maroon700 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  confirmButton: { flex: 1, backgroundColor: colors.navy600, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  confirmButtonText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  declineButton: { flex: 1, borderWidth: 1, borderColor: colors.ink, borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: colors.white },
  declineButtonText: { color: colors.maroon700, fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  sectionTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: colors.navy900, marginTop: 12 },
  ppcRow: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, backgroundColor: colors.white, padding: 10, marginTop: 6, gap: 2, ...brutalShadow(2) },
  ppcCompany: { fontSize: 13, fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  ppcStat: { fontSize: 11, color: colors.navy600 },
  ppcPercent: { fontSize: 16, fontFamily: "Poppins_700Bold", color: colors.navy800 },
  empty: { padding: 16, color: colors.navy600 },
  error: { padding: 12, color: colors.maroon700, backgroundColor: colors.maroon50, borderRadius: 8 },
});
