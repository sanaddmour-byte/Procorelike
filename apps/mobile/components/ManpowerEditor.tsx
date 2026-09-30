import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiJson } from "@/lib/api-client";
import { i18n } from "@/lib/i18n";
import { cachedLookup } from "@/lib/lookups";
import { enqueueRequest, isNetworkError } from "@/lib/sync/request-queue";
import { colors } from "@/lib/theme";

interface Row {
  companyId: string;
  tradeId: string;
  headcount: number;
  hours: number | string;
}
interface Option {
  id: string;
  name: string;
}

/**
 * Manpower for a daily log (plan E4, mobile M3): pick company + trade, step the headcount. Every change saves at once, or
 * is queued and sent on the next sync when there is no connection. The whole list is one queued write, so the newest wins.
 */
export function ManpowerEditor({ projectId, logId }: { projectId: string; logId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [trades, setTrades] = useState<Option[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [tradeId, setTradeId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void cachedLookup<{ manpower: Row[] }>(`/daily-logs/${logId}`).then((log) => setRows(log?.manpower ?? []));
    void cachedLookup<{ companyId: string | null; companyName: string | null }[]>(`/projects/${projectId}/members`).then((members) => {
      const seen = new Map<string, string>();
      for (const m of members ?? []) if (m.companyId && m.companyName) seen.set(m.companyId, m.companyName);
      setCompanies([...seen].map(([id, name]) => ({ id, name })));
    });
    void cachedLookup<Option[]>(`/projects/${projectId}/trades`).then((t) => setTrades(t ?? []));
  }, [projectId, logId]);

  const nameOf = (list: Option[], id: string): string => list.find((o) => o.id === id)?.name ?? "—";
  const total = rows.reduce((n, r) => n + r.headcount, 0);

  async function save(next: Row[]): Promise<void> {
    setRows(next);
    void Haptics.selectionAsync();
    const body = { manpower: next.map((r) => ({ companyId: r.companyId, tradeId: r.tradeId, headcount: r.headcount, hours: Number(r.hours) })) };
    try {
      await apiJson(`/daily-logs/${logId}`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice(null);
    } catch (err) {
      if (!isNetworkError(err)) {
        setNotice(i18n.t("common.errorGeneric"));
        return;
      }
      await enqueueRequest({ projectId, method: "PATCH", path: `/daily-logs/${logId}`, body, label: i18n.t("dailyLog.manpowerQueued"), dedupeKey: `manpower:${logId}` });
      setNotice(i18n.t("dailyLog.manpowerQueued"));
    }
  }

  function add(): void {
    if (!companyId || !tradeId) return;
    const existing = rows.find((r) => r.companyId === companyId && r.tradeId === tradeId);
    void save(existing ? rows.map((r) => (r === existing ? { ...r, headcount: r.headcount + 1 } : r)) : [...rows, { companyId, tradeId, headcount: 1, hours: 8 }]);
  }

  return (
    <View style={styles.section} accessibilityLabel={i18n.t("dailyLog.manpower")}>
      <View style={styles.header}>
        <Text style={styles.title}>{i18n.t("dailyLog.manpower")}</Text>
        <Text style={styles.total}>{i18n.t("dailyLog.manpowerTotal", { count: total })}</Text>
      </View>

      {rows.map((row, i) => (
        <View key={`${row.companyId}:${row.tradeId}`} style={styles.row}>
          <View style={styles.rowName}>
            <Text style={styles.company} numberOfLines={1}>{nameOf(companies, row.companyId)}</Text>
            <Text style={styles.trade} numberOfLines={1}>{nameOf(trades, row.tradeId)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t("dailyLog.fewer")} disabled={row.headcount <= 1} style={[styles.step, row.headcount <= 1 && styles.stepDisabled]} onPress={() => void save(rows.map((r, j) => (j === i ? { ...r, headcount: r.headcount - 1 } : r)))}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.count}>{row.headcount}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t("dailyLog.more")} style={styles.step} onPress={() => void save(rows.map((r, j) => (j === i ? { ...r, headcount: r.headcount + 1 } : r)))}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.label}>{i18n.t("dailyLog.company")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {companies.map((c) => (
          <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: companyId === c.id }} onPress={() => setCompanyId(c.id)} style={[styles.chip, companyId === c.id && styles.chipActive]}>
            <Text style={[styles.chipText, companyId === c.id && styles.chipTextActive]}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.label}>{i18n.t("dailyLog.trade")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {trades.map((t) => (
          <Pressable key={t.id} accessibilityRole="button" accessibilityState={{ selected: tradeId === t.id }} onPress={() => setTradeId(t.id)} style={[styles.chip, tradeId === t.id && styles.chipActive]}>
            <Text style={[styles.chipText, tradeId === t.id && styles.chipTextActive]}>{t.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={add} disabled={!companyId || !tradeId} style={[styles.addButton, (!companyId || !tradeId) && { opacity: 0.6 }]}>
        <Text style={styles.addButtonText}>{i18n.t("dailyLog.addCrew")}</Text>
      </Pressable>
      {notice && <Text style={styles.notice}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontFamily: "Poppins_600SemiBold", color: colors.navy900 },
  total: { fontSize: 13, color: colors.navy900 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.ink, borderRadius: 8, padding: 8 },
  rowName: { flex: 1 },
  company: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  trade: { fontSize: 12, color: colors.navy900 },
  step: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  stepDisabled: { opacity: 0.4 },
  stepText: { fontSize: 22, color: colors.navy900 },
  count: { minWidth: 28, textAlign: "center", fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  label: { fontSize: 13, color: colors.navy900, marginTop: 4 },
  chips: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: { minHeight: 48, borderWidth: 1, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, justifyContent: "center" },
  chipActive: { backgroundColor: colors.navy900 },
  chipText: { fontSize: 13, color: colors.navy900 },
  chipTextActive: { color: colors.white },
  addButton: { minHeight: 56, borderRadius: 8, backgroundColor: colors.navy900, alignItems: "center", justifyContent: "center" },
  addButtonText: { color: colors.white, fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  notice: { fontSize: 13, color: colors.navy900 },
});
