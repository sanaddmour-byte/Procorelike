"use client";

import { Header } from "@/components/Header";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { saveStoredAuth, type StoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const t = useTranslations("Login");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: { email: string; password: string; totpCode?: string } = { email, password };
      if (totpCode) body.totpCode = totpCode;
      const data = await apiJson<StoredAuth>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      saveStoredAuth(data);
      router.replace(`/${locale}/projects`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "totp_required") {
        setNeedsTotp(true);
        setError(t("totpRequired"));
      } else {
        setError(t("invalidCredentials"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("email")}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("password")}
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          {needsTotp && (
            <label className="flex flex-col gap-1 text-sm">
              {t("totpLabel")}
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {submitting ? tc("loading") : t("submit")}
          </button>
        </form>
      </main>
    </>
  );
}
