import type { ReactNode } from "react";

/** Left-to-right isolate for record numbers, dates and codes inside RTL text (plan A3). */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
