"use client";

import { apiJson } from "@/lib/api-client";
import { cachedJson } from "@/lib/cached-json";
import { errorMessage } from "@/lib/error-message";
import { formatNumber } from "@/lib/format";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Row {
  id: string;
  companyId: string;
  tradeId: string;
  headcount: number;
  hours: string;
}
interface Option {
  id: string;
  name: string;
}

interface Props {
  projectId: string;
  logId: string;
  rows: Row[];
  locked: boolean;
  onChange: (rows: Row[]) => void;
}

/** Manpower for a daily log (plan E4): pick company + trade, step the headcount, done. Every change saves at once. */
export function ManpowerEditor({ projectId, logId, rows, locked, onChange }: Props) {
  const t = useTranslations("DailyLog");
  const te = useTranslations("Errors");
  const locale = useLocale();
  const [companies, setCompanies] = useState<Option[]>([]);
  const [trades, setTrades] = useState<Option[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [tradeId, setTradeId] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Companies come from the project members: the /companies lookup needs budget access, which a superintendent does not have.
    cachedJson<{ companyId: string | null; companyName: string | null }[]>(`/projects/${projectId}/members`)
      .then((members) => {
        const seen = new Map<string, string>();
        for (const m of members) if (m.companyId && m.companyName) seen.set(m.companyId, m.companyName);
        setCompanies([...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => undefined);
    cachedJson<Option[]>(`/projects/${projectId}/trades`).then(setTrades).catch(() => undefined);
  }, [projectId]);

  const nameOf = (list: Option[], id: string): string => list.find((o) => o.id === id)?.name ?? "—";

  async function save(next: Row[]): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/daily-logs/${logId}`, {
        method: "PATCH",
        body: JSON.stringify({ manpower: next.map((r) => ({ companyId: r.companyId, tradeId: r.tradeId, headcount: r.headcount, hours: Number(r.hours) })) }),
      });
      // PATCH returns the bare log row; read the rows back so the list shows exactly what the server stored.
      const fresh = await apiJson<{ manpower: Row[] }>(`/daily-logs/${logId}`);
      onChange(fresh.manpower);
    } catch (err) {
      setError(errorMessage(err, te));
    } finally {
      setBusy(false);
    }
  }

  const step = "hit-task w-12 shrink-0 rounded-lg border-3 border-ink bg-white text-xl font-extrabold disabled:opacity-40";
  const total = rows.reduce((n, r) => n + r.headcount, 0);

  return (
    <section className="mt-6" aria-label={t("manpowerSection")}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-navy-800">{t("manpowerSection")}</h2>
        <span className="text-sm text-ink/70">{t("manpowerTotal", { count: total, formatted: formatNumber(total, locale) })}</span>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-maroon-700">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={row.id || i} className="flex items-center gap-2 rounded-xl border-3 border-ink bg-white p-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{nameOf(companies, row.companyId)}</div>
              <div className="truncate text-ink/70">{nameOf(trades, row.tradeId)}</div>
            </div>
            {!locked && (
              <button type="button" aria-label={t("fewer")} disabled={busy || row.headcount <= 1} className={step} onClick={() => void save(rows.map((r, j) => (j === i ? { ...r, headcount: r.headcount - 1 } : r)))}>
                −
              </button>
            )}
            <span className="w-8 text-center text-lg font-bold" dir="ltr">
              {row.headcount}
            </span>
            {!locked && (
              <>
                <button type="button" aria-label={t("more")} disabled={busy} className={step} onClick={() => void save(rows.map((r, j) => (j === i ? { ...r, headcount: r.headcount + 1 } : r)))}>
                  +
                </button>
                <button type="button" aria-label={t("removeRow")} disabled={busy} className={step} onClick={() => void save(rows.filter((_, j) => j !== i))}>
                  ×
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {!locked && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border-3 border-dashed border-ink p-2">
          <select aria-label={t("company")} value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="hit-task rounded-lg border-3 border-ink bg-white px-2">
            <option value="">{t("company")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label={t("trade")} value={tradeId} onChange={(e) => setTradeId(e.target.value)} className="hit-task rounded-lg border-3 border-ink bg-white px-2">
            <option value="">{t("trade")}</option>
            {trades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t("fewer")} className={step} disabled={headcount <= 1} onClick={() => setHeadcount((n) => n - 1)}>
              −
            </button>
            <span className="w-10 text-center text-lg font-bold" dir="ltr">
              {headcount}
            </span>
            <button type="button" aria-label={t("more")} className={step} onClick={() => setHeadcount((n) => n + 1)}>
              +
            </button>
            <button
              type="button"
              disabled={busy || !companyId || !tradeId}
              onClick={() => {
                void save([...rows, { id: "", companyId, tradeId, headcount, hours: "8" }]).then(() => setHeadcount(1));
              }}
              className="hit-task flex-1 rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 px-3 font-bold text-white disabled:opacity-50"
            >
              {t("addManpower")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
