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
    <header className="flex items-center justify-between border-b-3 border-ink bg-navy-900 px-6 py-4 text-white">
      <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
        <span className="inline-block h-3 w-3 rounded-sm border-2 border-white bg-orange-500" aria-hidden="true" />
        {t("appName")}
      </span>
      <div className="flex items-center gap-4">
        <LanguageToggle />
        {authed && (
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border-3 border-white bg-maroon-600 px-3 py-1.5 text-sm font-semibold text-white brutal-interactive"
          >
            {t("logout")}
          </button>
        )}
      </div>
    </header>
  );
}
