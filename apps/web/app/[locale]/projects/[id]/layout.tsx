"use client";

import { AppShell } from "@/components/shell/AppShell";
import { setLastProject } from "@/lib/last-project";
import { useParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Wraps every /projects/:id/* page in the shared shell (header + project
 * sidebar) so individual pages no longer render <Header />/<ProjectTabs>
 * themselves -- see components/shell/AppShell.tsx.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  useEffect(() => setLastProject(params.id), [params.id]);
  return <AppShell projectId={params.id}>{children}</AppShell>;
}
