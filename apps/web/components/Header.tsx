"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { loadStoredAuth } from "@/lib/auth-storage";
import { GlobalSearch } from "./shell/GlobalSearch";
import { NotificationBell } from "./shell/NotificationBell";
import { ProjectSelector } from "./shell/ProjectSelector";
import { UserMenu } from "./shell/UserMenu";
import { LanguageToggle } from "./LanguageToggle";

interface Props {
  /** Present only inside a project route -- renders the project selector, scopes search to that project. */
  projectId?: string;
  /** Present only when AppShell has a collapsible/mobile sidebar to control. */
  onToggleSidebar?: () => void;
}

/**
 * The global header, present on every page. It carries operational
 * context (which project you're in, a way to search the whole app, who
 * you're logged in as) rather than just branding -- see the "Application
 * Shell" section of the design brief. `projectId`/`onToggleSidebar` are
 * only passed by the project-scoped layout; every other page renders
 * the same header minus those two pieces.
 */
export function Header({ projectId, onToggleSidebar }: Props) {
  const t = useTranslations("Common");
  const tShell = useTranslations("Shell");
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(loadStoredAuth() !== null);
  }, []);

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-3 border-ink bg-gradient-to-b from-navy-700 to-navy-900 px-4 py-2.5 text-white shadow-brutal-sm sm:px-6">
      {onToggleSidebar && (
        <button type="button" onClick={onToggleSidebar} aria-label={tShell("openNavigation")} className="rounded p-1 text-white/80 hover:bg-white/10 md:hidden">
          ☰
        </button>
      )}
      <span className="flex shrink-0 items-center gap-2 text-base font-extrabold tracking-tight">
        <span className="inline-block h-3 w-3 rounded-sm border-2 border-white bg-gradient-to-b from-orange-400 to-orange-600" aria-hidden="true" />
        {t("appName")}
      </span>
      {projectId && <ProjectSelector projectId={projectId} />}
      {authed && (
        <div className="mx-2 hidden flex-1 justify-center sm:flex">
          <GlobalSearch projectId={projectId} />
        </div>
      )}
      <div className="ms-auto flex items-center gap-2 sm:gap-3">
        <LanguageToggle />
        {authed && <NotificationBell />}
        {authed && <UserMenu />}
      </div>
    </header>
  );
}
