"use client";

import { CreateSheet } from "@/components/shell/CreateSheet";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface Props {
  projectId: string;
  onMore: () => void;
}

/**
 * Phone bottom navigation (plan C1, D5): My Work · Capture (+) · Project · Drawings · More. Five destinations, 64 px tall
 * (each target well above the 48 px floor), in the thumb zone. "More" opens the full module drawer. Hidden from `md` up,
 * where the sidebar takes over.
 */
export function BottomNav({ projectId, onMore }: Props) {
  const t = useTranslations("BottomNav");
  const locale = useLocale();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const base = `/${locale}/projects/${projectId}`;
  const items = [
    { href: `${base}/my-work`, label: t("myWork"), icon: "📥", match: "/my-work" },
    { href: `${base}/dashboard`, label: t("project"), icon: "🏗️", match: "/dashboard" },
    { href: `${base}/drawings`, label: t("drawings"), icon: "📐", match: "/drawings" },
  ];
  const cell = "flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold";
  return (
    <>
      <nav aria-label={t("label")} className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t-3 border-ink bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <Link href={items[0]!.href} aria-current={pathname.includes(items[0]!.match)} className={`${cell} ${pathname.includes(items[0]!.match) ? "bg-maroon-50 text-maroon-700" : "text-navy-800"}`}>
          <span aria-hidden="true" className="text-xl">{items[0]!.icon}</span>
          {items[0]!.label}
        </Link>
        <button type="button" onClick={() => setCreateOpen(true)} aria-label={t("capture")} className="flex min-h-0 flex-1 items-center justify-center">
          <span className="-mt-4 flex h-16 w-16 flex-col items-center justify-center rounded-full border-3 border-ink bg-gradient-to-b from-orange-300 to-orange-400 text-3xl font-black text-ink shadow-brutal">
            +
          </span>
        </button>
        {items.slice(1).map((it) => (
          <Link key={it.match} href={it.href} aria-current={pathname.includes(it.match)} className={`${cell} ${pathname.includes(it.match) ? "bg-maroon-50 text-maroon-700" : "text-navy-800"}`}>
            <span aria-hidden="true" className="text-xl">{it.icon}</span>
            {it.label}
          </Link>
        ))}
        <button type="button" onClick={onMore} className={`${cell} text-navy-800`}>
          <span aria-hidden="true" className="text-xl">☰</span>
          {t("more")}
        </button>
      </nav>
      <CreateSheet projectId={projectId} open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
