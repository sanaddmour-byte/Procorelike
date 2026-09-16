"use client";

import { AppShell } from "@/components/shell/AppShell";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Wraps every /projects/:id/* page in the shared shell (header + project
 * sidebar) so individual pages no longer render <Header />/<ProjectTabs>
 * themselves -- see components/shell/AppShell.tsx.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  return <AppShell projectId={params.id}>{children}</AppShell>;
}
