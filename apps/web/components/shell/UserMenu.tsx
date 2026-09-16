"use client";

import { clearStoredAuth, loadStoredAuth } from "@/lib/auth-storage";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function UserMenu() {
  const t = useTranslations("Common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const auth = loadStoredAuth();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!auth) return null;

  function handleLogout(): void {
    clearStoredAuth();
    router.push("/");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={auth.user.name}
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/40 bg-gradient-to-b from-orange-400 to-orange-600 text-xs font-bold text-white"
      >
        {initials(auth.user.name)}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-40 mt-1 w-56 rounded-lg border-3 border-ink bg-white py-1 text-sm shadow-brutal-lg">
          <div className="border-b border-navy-100 px-3 py-2">
            <p className="truncate font-semibold text-navy-900">{auth.user.name}</p>
            <p className="truncate text-xs text-navy-500">{auth.user.email}</p>
          </div>
          <button type="button" role="menuitem" onClick={handleLogout} className="block w-full px-3 py-2 text-start text-maroon-700 hover:bg-maroon-50">
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
