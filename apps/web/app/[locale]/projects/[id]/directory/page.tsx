"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson, ApiClientError } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { PROJECT_ROLES } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

interface Member {
  userId: string;
  name: string;
  email: string;
  businessPhone: string | null;
  mobilePhone: string | null;
  role: string;
  companyId: string;
  companyName: string;
}

interface DirectoryCompany {
  companyId: string;
  name: string;
  type: string;
  roleOnProject: string | null;
}

type Tab = "people" | "companies";

export default function DirectoryPage() {
  const t = useTranslations("Directory");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [tab, setTab] = useState<Tab>("people");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [companies, setCompanies] = useState<DirectoryCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteRole, setInviteRole] = useState<string>(PROJECT_ROLES[0]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [editingPhonesFor, setEditingPhonesFor] = useState<string | null>(null);
  const [businessPhoneDraft, setBusinessPhoneDraft] = useState("");
  const [mobilePhoneDraft, setMobilePhoneDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    const stored = loadStoredAuth();
    if (!stored) {
      router.replace(`/${locale}/login`);
      return;
    }
    setCurrentUserId(stored.user.id);

    apiJson<Member[]>(`/projects/${params.id}/members`)
      .then(setMembers)
      .catch(() => setError(tc("errorGeneric")));

    apiJson<DirectoryCompany[]>(`/projects/${params.id}/directory-companies`)
      .then(setCompanies)
      .catch(() => setError(tc("errorGeneric")));

    // Opportunistic admin probe: this endpoint is directory:admin-gated,
    // so success/failure tells us whether to show admin-only actions
    // (Invite, per-person contact edit) without a dedicated "am I admin" route.
    apiJson(`/projects/${params.id}/member-permissions`)
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, [router, locale, params.id, tc]);

  function startEditPhones(m: Member): void {
    setEditingPhonesFor(m.userId);
    setBusinessPhoneDraft(m.businessPhone ?? "");
    setMobilePhoneDraft(m.mobilePhone ?? "");
  }

  async function saveMyPhones(e: FormEvent): Promise<void> {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const updated = await apiJson<{ businessPhone: string | null; mobilePhone: string | null }>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          businessPhone: businessPhoneDraft || null,
          mobilePhone: mobilePhoneDraft || null,
        }),
      });
      setMembers((prev) =>
        prev
          ? prev.map((m) => (m.userId === editingPhonesFor ? { ...m, businessPhone: updated.businessPhone, mobilePhone: updated.mobilePhone } : m))
          : prev,
      );
      setEditingPhonesFor(null);
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitInvite(e: FormEvent): Promise<void> {
    e.preventDefault();
    setInviteError(null);
    setInviteSubmitting(true);
    try {
      const result = await apiJson<{ inviteToken: string }>("/auth/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, companyId: inviteCompanyId, projectId: params.id, role: inviteRole }),
      });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setInviteLink(`${origin}/${locale}/accept-invite?token=${result.inviteToken}`);
      setInviteEmail("");
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? err.code : tc("errorGeneric"));
    } finally {
      setInviteSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects`} className="text-sm text-navy-700 underline">
          {t("back")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          {isAdmin && tab === "people" && (
            <button
              type="button"
              onClick={() => setShowInviteForm((v) => !v)}
              className="rounded-lg border-3 border-ink bg-maroon-600 px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_0_#1a1a1a] transition-transform hover:-translate-y-0.5"
            >
              {t("invitePerson")}
            </button>
          )}
        </div>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="mb-4 mt-4 flex gap-1 border-b-3 border-ink">
          <button
            type="button"
            onClick={() => setTab("people")}
            className={`px-3 py-2 text-sm font-bold ${tab === "people" ? "border-b-4 border-maroon-600 text-maroon-700" : "text-navy-600"}`}
          >
            {t("peopleTab")}
          </button>
          <button
            type="button"
            onClick={() => setTab("companies")}
            className={`px-3 py-2 text-sm font-bold ${tab === "companies" ? "border-b-4 border-maroon-600 text-maroon-700" : "text-navy-600"}`}
          >
            {t("companiesTab")}
          </button>
        </div>

        {showInviteForm && isAdmin && (
          <form onSubmit={submitInvite} className="mb-6 rounded-xl border-3 border-ink bg-cream p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <h2 className="mb-3 font-bold text-navy-900">{t("invitePerson")}</h2>
            {inviteError && <p className="mb-2 text-sm text-maroon-700">{inviteError}</p>}
            {inviteLink && (
              <div className="mb-3 rounded-lg border-2 border-ink bg-white p-2 text-xs">
                <p className="font-semibold">{t("inviteLinkLabel")}</p>
                <p className="break-all">{inviteLink}</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                {t("inviteEmail")}
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border-2 border-ink px-2 py-1"
                />
              </label>
              <label className="text-sm">
                {t("inviteCompany")}
                <select
                  required
                  value={inviteCompanyId}
                  onChange={(e) => setInviteCompanyId(e.target.value)}
                  className="mt-1 w-full rounded-lg border-2 border-ink px-2 py-1"
                >
                  <option value="">{t("inviteCompanyPlaceholder")}</option>
                  {companies?.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t("inviteRole")}
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border-2 border-ink px-2 py-1"
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={inviteSubmitting}
              className="mt-3 rounded-lg border-3 border-ink bg-navy-700 px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_0_#1a1a1a] disabled:opacity-50"
            >
              {inviteSubmitting ? tc("saving") : t("sendInvite")}
            </button>
          </form>
        )}

        {tab === "people" && (
          <>
            {!members && !error && <p>{tc("loading")}</p>}
            {members && members.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
            {members && members.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink">
                      <th className="py-2 text-start">{t("name")}</th>
                      <th className="py-2 text-start">{t("email")}</th>
                      <th className="py-2 text-start">{t("businessPhone")}</th>
                      <th className="py-2 text-start">{t("mobilePhone")}</th>
                      <th className="py-2 text-start">{t("role")}</th>
                      <th className="py-2 text-start">{t("company")}</th>
                      <th className="py-2 text-start" />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.userId} className="border-b border-orange-200 align-top">
                        <td className="py-2">{m.name}</td>
                        <td className="py-2">{m.email}</td>
                        {editingPhonesFor === m.userId ? (
                          <td colSpan={2} className="py-2">
                            <form onSubmit={saveMyPhones} className="flex flex-wrap items-center gap-2">
                              <input
                                type="tel"
                                placeholder={t("businessPhone")}
                                value={businessPhoneDraft}
                                onChange={(e) => setBusinessPhoneDraft(e.target.value)}
                                className="w-32 rounded border-2 border-ink px-1 py-0.5 text-xs"
                              />
                              <input
                                type="tel"
                                placeholder={t("mobilePhone")}
                                value={mobilePhoneDraft}
                                onChange={(e) => setMobilePhoneDraft(e.target.value)}
                                className="w-32 rounded border-2 border-ink px-1 py-0.5 text-xs"
                              />
                              <button type="submit" disabled={profileSaving} className="text-xs font-bold text-navy-700 underline">
                                {tc("saving")}
                              </button>
                              <button type="button" onClick={() => setEditingPhonesFor(null)} className="text-xs text-navy-500 underline">
                                {tc("cancel")}
                              </button>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="py-2">{m.businessPhone ?? "—"}</td>
                            <td className="py-2">{m.mobilePhone ?? "—"}</td>
                          </>
                        )}
                        <td className="py-2">{m.role}</td>
                        <td className="py-2">{m.companyName}</td>
                        <td className="py-2">
                          {m.userId === currentUserId && editingPhonesFor !== m.userId && (
                            <button type="button" onClick={() => startEditPhones(m)} className="text-xs font-bold text-navy-700 underline">
                              {t("editContact")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "companies" && (
          <>
            {!companies && !error && <p>{tc("loading")}</p>}
            {companies && companies.length === 0 && <p className="text-navy-600">{t("noCompanies")}</p>}
            {companies && companies.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink">
                      <th className="py-2 text-start">{t("companyName")}</th>
                      <th className="py-2 text-start">{t("companyType")}</th>
                      <th className="py-2 text-start">{t("companyRole")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr key={c.companyId} className="border-b border-orange-200">
                        <td className="py-2">{c.name}</td>
                        <td className="py-2">{c.type}</td>
                        <td className="py-2">{c.roleOnProject ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
