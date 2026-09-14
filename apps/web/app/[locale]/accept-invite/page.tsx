"use client";

import { Header } from "@/components/Header";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { saveStoredAuth, type StoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const t = useTranslations("AcceptInvite");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token") ?? "";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiJson<StoredAuth>("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ inviteToken, name, password }),
      });
      saveStoredAuth(data);
      router.replace(`/${locale}/projects`);
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === "invalid_invite" ? t("invalidInvite") : tc("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        {!inviteToken ? (
          <p className="text-maroon-700">{t("missingToken")}</p>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex flex-col gap-4 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-6 shadow-brutal"
          >
            <label className="flex flex-col gap-1 text-sm font-semibold text-navy-800">
              {t("name")}
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2 font-normal focus:outline-none focus:shadow-focus"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-navy-800">
              {t("password")}
              <input
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2 font-normal focus:outline-none focus:shadow-focus"
              />
            </label>
            {error && <p className="rounded-lg border-3 border-maroon-700 bg-gradient-to-b from-maroon-50 to-maroon-100 p-2 text-sm font-semibold text-maroon-800">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-orange-400 to-orange-600 brutal-interactive px-3 py-2 font-bold text-ink disabled:opacity-50"
            >
              {submitting ? tc("loading") : t("submit")}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
