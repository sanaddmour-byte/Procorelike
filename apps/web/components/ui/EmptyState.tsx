"use client";

import Image from "next/image";
import { moduleIllustration } from "@/lib/module-illustrations";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** A never-blank-screen empty state: what's missing, why, and (optionally) what to do about it. Shows the current module's illustration. */
export function EmptyState({ title, description, action }: Props) {
  const module = moduleIllustration(usePathname());
  return (
    <div className="illu-hero flex flex-col items-center gap-2 rounded-lg border border-dashed border-navy-300 bg-white/50 px-6 py-10 text-center">
      {module ? (
        <Image src={module.src} alt="" width={480} height={268} className="h-28 w-auto rounded-xl" />
      ) : (
        <Image src="/images/empty-state.png" alt="" width={96} height={96} className="h-24 w-24 rounded-lg object-cover" />
      )}
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-navy-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
