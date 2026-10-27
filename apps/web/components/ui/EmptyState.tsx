import Image from "next/image";
import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** A never-blank-screen empty state: what's missing, why, and (optionally) what to do about it. */
export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-navy-300 bg-white/50 px-6 py-10 text-center">
      <Image src="/images/empty-state.png" alt="" width={96} height={96} className="h-24 w-24 rounded-lg object-cover" />
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-navy-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
