"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useProjectCurrency } from "@/lib/use-project-currency";
import { formatMoney, type BidInvitationStatus, type BidPackageStatus, type BidStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ProjectCompany {
  companyId: string;
  name: string;
}

interface BidInvitation {
  id: string;
  companyId: string;
  status: BidInvitationStatus;
}

interface Bid {
  id: string;
  companyId: string;
  amount: string;
  alternates: { description: string; amount: number }[];
  exclusions: string | null;
  status: BidStatus;
}

interface BidPackageDetail {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: BidPackageStatus;
  invitations: BidInvitation[];
  bids: Bid[];
}

const NEXT_STATUS: Record<BidPackageStatus, BidPackageStatus[]> = {
  draft: ["open"],
  open: ["closed"],
  closed: ["awarded", "canceled"],
  awarded: [],
  canceled: [],
};

export default function BidPackageDetailPage() {
  const t = useTranslations("Bidding");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; bidPackageId: string }>();
  const currency = useProjectCurrency(params.id);
  const money = (value: string): string => formatMoney(value, currency, locale);

  const [detail, setDetail] = useState<BidPackageDetail | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [bidCompanyId, setBidCompanyId] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidExclusions, setBidExclusions] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiJson<BidPackageDetail>(`/bid-packages/${params.bidPackageId}`);
      setDetail(data);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.bidPackageId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`)
      .then((rows) => {
        setCompanies(rows);
        setInviteCompanyId((c) => c || rows[0]?.companyId || "");
        setBidCompanyId((c) => c || rows[0]?.companyId || "");
      })
      .catch(() => undefined);
  }, [router, locale, load, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  function statusLabel(status: BidPackageStatus): string {
    return { draft: t("statusDraft"), open: t("statusOpen"), closed: t("statusClosed"), awarded: t("statusAwarded"), canceled: t("statusCanceled") }[status];
  }

  function bidStatusLabel(status: BidStatus): string {
    return { submitted: t("bidSubmitted"), shortlisted: t("bidShortlisted"), awarded: t("bidAwarded"), rejected: t("bidRejected") }[status];
  }

  async function handleTransition(toStatus: BidPackageStatus): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/bid-packages/${params.bidPackageId}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(): Promise<void> {
    if (!inviteCompanyId) return;
    setBusy(true);
    try {
      await apiJson(`/bid-packages/${params.bidPackageId}/invite`, { method: "POST", body: JSON.stringify({ companyId: inviteCompanyId }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogBid(): Promise<void> {
    if (!bidCompanyId || !bidAmount) return;
    setBusy(true);
    try {
      await apiJson(`/bid-packages/${params.bidPackageId}/bids`, {
        method: "POST",
        body: JSON.stringify({ companyId: bidCompanyId, amount: Number(bidAmount), exclusions: bidExclusions || undefined }),
      });
      setBidAmount("");
      setBidExclusions("");
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAward(bidId: string, createCommitment: boolean): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/bids/${bidId}/award`, { method: "POST", body: JSON.stringify({ createCommitment }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <>
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/bidding`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            {detail.number} — {detail.title}
          </h1>
          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(detail.status)}</span>
        </div>
        {error && <p className="text-maroon-700">{error}</p>}

        {NEXT_STATUS[detail.status].length > 0 && (
          <div className="mb-6 flex gap-2">
            {NEXT_STATUS[detail.status].map((next) => (
              <button
                key={next}
                onClick={() => void handleTransition(next)}
                disabled={busy}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {statusLabel(next)}
              </button>
            ))}
          </div>
        )}

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <h2 className="mb-2 text-sm font-bold text-navy-900">{t("invitations")}</h2>
          <div className="mb-3 flex gap-2">
            <select value={inviteCompanyId} onChange={(e) => setInviteCompanyId(e.target.value)} className="flex-1 rounded-lg border-3 border-ink px-3 py-2 text-sm">
              {companies.map((c) => (
                <option key={c.companyId} value={c.companyId}>
                  {c.name}
                </option>
              ))}
            </select>
            <button onClick={() => void handleInvite()} disabled={busy} className="rounded-lg border-3 border-ink bg-navy-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {t("inviteBidder")}
            </button>
          </div>
          {detail.invitations.length === 0 && <p className="text-sm text-navy-600">{t("noInvitations")}</p>}
          <ul className="flex flex-col gap-1">
            {detail.invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between text-sm">
                <span>{companyName(inv.companyId)}</span>
                <span className="text-navy-600">{inv.status}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <h2 className="mb-2 text-sm font-bold text-navy-900">{t("logBid")}</h2>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <select value={bidCompanyId} onChange={(e) => setBidCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2 text-sm">
              {companies.map((c) => (
                <option key={c.companyId} value={c.companyId}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder={t("bidAmount")}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2 text-sm"
            />
            <input
              placeholder={t("exclusions")}
              value={bidExclusions}
              onChange={(e) => setBidExclusions(e.target.value)}
              className="flex-1 rounded-lg border-3 border-ink px-3 py-2 text-sm"
            />
            <button onClick={() => void handleLogBid()} disabled={busy} className="rounded-lg border-3 border-ink bg-navy-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {t("logBidButton")}
            </button>
          </div>

          {detail.bids.length === 0 && <p className="text-sm text-navy-600">{t("noBids")}</p>}
          <ul className="flex flex-col gap-2">
            {detail.bids.map((bid) => (
              <li key={bid.id} className="rounded-lg border-2 border-orange-200 bg-white p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{companyName(bid.companyId)}</span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{bidStatusLabel(bid.status)}</span>
                </div>
                <p className="mt-1 text-navy-700">{money(bid.amount)}</p>
                {bid.exclusions && <p className="mt-1 text-xs text-navy-600">{bid.exclusions}</p>}
                {(bid.status === "submitted" || bid.status === "shortlisted") && (detail.status === "open" || detail.status === "closed") && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void handleAward(bid.id, false)}
                      disabled={busy}
                      className="rounded border-2 border-ink bg-navy-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {t("award")}
                    </button>
                    <button
                      onClick={() => void handleAward(bid.id, true)}
                      disabled={busy}
                      className="rounded border-2 border-ink px-2 py-1 text-xs font-semibold text-navy-800 disabled:opacity-50"
                    >
                      {t("awardAndCreateCommitment")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
