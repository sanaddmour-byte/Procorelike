"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearStoredAuth, loadStoredAuth } from "@/lib/auth-storage";
import { LanguageToggle } from "./LanguageToggle";

export function Header() {
  const t = useTranslations("Common");
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(loadStoredAuth() !== null);
  }, []);

  function handleLogout(): void {
    clearStoredAuth();
    router.push("/");
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
      <span className="text-lg font-semibold">{t("appName")}</span>
      <div className="flex items-center gap-4">
        <LanguageToggle />
        {authed && (
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-slate-600 hover:underline"
          >
            {t("logout")}
          </button>
        )}
      </div>
    </header>
  );
}
