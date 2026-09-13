"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { uploadAttachment } from "@/lib/upload";
import type { SubmittalResponseCode } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Review {
  id: string;
  reviewerUserId: string;
  sequenceOrder: number;
  isParallel: boolean;
  responseCode: SubmittalResponseCode | null;
  reviewedAt: string | null;
}

interface Revision {
  id: string;
  revisionNumber: number;
  attachmentId: string;
  submittedDate: string;
  reviews: Review[];
}

interface Package {
  id: string;
  packageNumber: number;
  revisions: Revision[];
}

interface SubmittalDetail {
  id: string;
  projectId: string;
  number: string;
  title: string;
  status: "draft" | "in_review" | "approved" | "closed";
  ballInCourtUserId: string | null;
  packages: Package[];
}

interface Member {
  userId: string;
  name: string;
}

interface ReviewerDraft {
  reviewerUserId: string;
  sequenceOrder: number;
  isParallel: boolean;
}

function statusLabel(status: SubmittalDetail["status"], t: (key: string) => string): string {
  return { draft: t("statusDraft"), in_review: t("statusInReview"), approved: t("statusApproved"), closed: t("statusClosed") }[status];
}

function responseCodeLabel(code: SubmittalResponseCode | null, t: (key: string) => string): string {
  if (!code) return t("pending");
  return {
    approved: t("responseApproved"),
    approved_as_noted: t("responseApprovedAsNoted"),
    revise_resubmit: t("responseReviseResubmit"),
    rejected: t("responseRejected"),
  }[code];
}

const RESPONSE_CODES: SubmittalResponseCode[] = ["approved", "approved_as_noted", "revise_resubmit", "rejected"];

export default function SubmittalDetailScreen() {
  const t = useTranslations("Submittals");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; submittalId: string }>();
  const currentUserId = loadStoredAuth()?.user.id ?? null;

  const [submittal, setSubmittal] = useState<SubmittalDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revisionFormPackageId, setRevisionFormPackageId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submittedDate, setSubmittedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reviewers, setReviewers] = useState<ReviewerDraft[]>([{ reviewerUserId: "", sequenceOrder: 1, isParallel: false }]);

  const load = useCallback(async () => {
    try {
      const detail = await apiJson<SubmittalDetail>(`/submittals/${params.submittalId}`);
      setSubmittal(detail);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.submittalId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [router, locale, load, params.id]);

  function memberName(userId: string | null): string {
    if (!userId) return t("unassigned");
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  async function handleNewPackage(): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/submittals/${params.submittalId}/packages`, { method: "POST" });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  function updateReviewer(index: number, patch: Partial<ReviewerDraft>): void {
    setReviewers((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleUploadRevision(e: FormEvent, packageId: string): Promise<void> {
    e.preventDefault();
    if (!file || !submittal) return;
    const validReviewers = reviewers.filter((r) => r.reviewerUserId);
    if (validReviewers.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const attachmentId = await uploadAttachment({
        projectId: submittal.projectId,
        ownerType: "submittal_revision",
        ownerId: submittal.id,
        file,
      });
      await apiJson(`/submittals/packages/${packageId}/revisions`, {
        method: "POST",
        body: JSON.stringify({ attachmentId, submittedDate, reviewers: validReviewers }),
      });
      setFile(null);
      setReviewers([{ reviewerUserId: "", sequenceOrder: 1, isParallel: false }]);
      setRevisionFormPackageId(null);
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitReview(revisionId: string, responseCode: SubmittalResponseCode): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/submittals/revisions/${revisionId}/reviews`, { method: "POST", body: JSON.stringify({ responseCode }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/submittals/${params.submittalId}/close`, { method: "POST" });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (!submittal) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/submittals`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>

        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            {submittal.number} — {submittal.title}
          </h1>
          {submittal.status === "approved" && (
            <button onClick={() => void handleClose()} disabled={busy} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("close")}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-navy-600">
          {statusLabel(submittal.status, t)} · {t("ballInCourt")}: {memberName(submittal.ballInCourtUserId)}
        </p>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{t("packages")}</h2>
          <button onClick={() => void handleNewPackage()} disabled={busy} className="rounded-lg border-3 border-ink px-3 py-1.5 text-sm text-navy-800">
            {t("newPackage")}
          </button>
        </div>

        {submittal.packages.length === 0 && <p className="text-navy-600">{t("noPackages")}</p>}
        <div className="flex flex-col gap-6">
          {submittal.packages.map((pkg) => (
            <div key={pkg.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium">
                  {t("package")} #{pkg.packageNumber}
                </h3>
                <button
                  onClick={() => setRevisionFormPackageId((cur) => (cur === pkg.id ? null : pkg.id))}
                  className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800"
                >
                  {t("uploadRevision")}
                </button>
              </div>

              {revisionFormPackageId === pkg.id && (
                <form onSubmit={(e) => void handleUploadRevision(e, pkg.id)} className="mb-4 flex flex-col gap-3 rounded bg-orange-50 p-3">
                  <label className="flex flex-col gap-1 text-sm">
                    {t("submittedDate")}
                    <input
                      type="date"
                      required
                      value={submittedDate}
                      onChange={(e) => setSubmittedDate(e.target.value)}
                      className="rounded-lg border-3 border-ink px-3 py-2"
                    />
                  </label>
                  <input required type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />

                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">{t("reviewers")}</span>
                    {reviewers.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <select
                          value={r.reviewerUserId}
                          onChange={(e) => updateReviewer(i, { reviewerUserId: e.target.value })}
                          className="rounded-lg border-3 border-ink px-2 py-1 text-sm"
                        >
                          <option value="">{t("reviewer")}</option>
                          {members.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={r.sequenceOrder}
                          onChange={(e) => updateReviewer(i, { sequenceOrder: Number(e.target.value) })}
                          className="w-16 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                          title={t("sequenceOrder")}
                        />
                        <label className="flex items-center gap-1 text-xs text-navy-700">
                          <input type="checkbox" checked={r.isParallel} onChange={(e) => updateReviewer(i, { isParallel: e.target.checked })} />
                          {t("parallel")}
                        </label>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setReviewers((prev) => [...prev, { reviewerUserId: "", sequenceOrder: prev.length + 1, isParallel: false }])}
                      className="self-start text-xs text-navy-700 underline"
                    >
                      {t("addReviewer")}
                    </button>
                  </div>

                  <button type="submit" disabled={busy || !file} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                    {busy ? t("uploading") : t("uploadRevision")}
                  </button>
                </form>
              )}

              <ul className="flex flex-col gap-3">
                {pkg.revisions.map((rev) => (
                  <li key={rev.id} className="rounded border border-orange-200 p-3">
                    <p className="mb-2 text-sm font-medium">
                      {t("revisions")} #{rev.revisionNumber} — {rev.submittedDate.slice(0, 10)}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {rev.reviews.map((review) => (
                        <li key={review.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            {memberName(review.reviewerUserId)}
                            {review.isParallel ? ` (${t("parallel")})` : ` (#${review.sequenceOrder})`}
                          </span>
                          {review.reviewerUserId === currentUserId && !review.reviewedAt ? (
                            <div className="flex flex-wrap gap-1">
                              {RESPONSE_CODES.map((code) => (
                                <button
                                  key={code}
                                  onClick={() => void handleSubmitReview(rev.id, code)}
                                  disabled={busy}
                                  className="rounded-lg border-3 border-ink px-2 py-0.5 text-xs text-navy-800 disabled:opacity-50"
                                >
                                  {responseCodeLabel(code, t)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                              {responseCodeLabel(review.responseCode, t)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
