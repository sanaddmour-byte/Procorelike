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
      if (err instanceof ApiClientError) {
        if (err.code === "totp_required") {
          setNeedsTotp(true);
          setError(t("totpRequired"));
        } else {
          setError(t("invalidCredentials"));
        }
      } else {
        // A request that never got a response at all (wrong/unreachable
        // NEXT_PUBLIC_API_URL, network failure, CORS block) -- distinct from
        // a real 401 from the server, which comes through as ApiClientError.
        setError(tc("errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col gap-4 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-6 shadow-brutal"
        >
          <label className="flex flex-col gap-1 text-sm font-semibold text-navy-800">
            {t("email")}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2 font-normal focus:outline-none focus:shadow-focus"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-navy-800">
            {t("password")}
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2 font-normal focus:outline-none focus:shadow-focus"
            />
          </label>
          {needsTotp && (
            <label className="flex flex-col gap-1 text-sm font-semibold text-navy-800">
              {t("totpLabel")}
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2 font-normal focus:outline-none focus:shadow-focus"
              />
            </label>
          )}
          {error && <p className="rounded-lg border-3 border-maroon-700 bg-gradient-to-b from-maroon-50 to-maroon-100 p-2 text-sm font-semibold text-maroon-800">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-orange-400 to-orange-600 brutal-interactive px-3 py-2 font-bold text-ink disabled:opacity-50"
          >
            {submitting ? tc("loading") : t("submit")}
          </button>
        </form>
      </main>
    </>
  );
}
