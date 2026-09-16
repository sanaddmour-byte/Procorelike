"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Header } from "../Header";
import { ProjectSidebar } from "./ProjectSidebar";

const COLLAPSE_KEY = "siteops.sidebarCollapsed";
const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * The project-scoped shell: header (with the project selector + search
 * scoped to this project) + a collapsible sidebar replacing the old
 * horizontal ProjectTabs strip + the page's own content. Desktop keeps
 * the sidebar always visible (collapsible to an icon rail, state
 * remembered per browser); below the `md` breakpoint it's an overlay
 * drawer opened from the header's hamburger button instead, per the
 * design brief's "mobile uses a different navigation strategy."
 */
export function AppShell({ projectId, children }: { projectId: string; children: ReactNode }) {
  const t = useTranslations("Shell");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    menuButtonRef.current = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  function toggleCollapsed(): void {
    setCollapsed((c) => {
      window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header projectId={projectId} onToggleSidebar={() => setMobileOpen(true)} />
      <div className="flex flex-1">
        <aside className={`hidden shrink-0 border-e-3 border-ink bg-white md:block ${collapsed ? "w-14" : "w-56"} transition-all`}>
          <div className="flex justify-end px-1 pt-1">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? t("expandNavigation") : t("collapseNavigation")}
              aria-expanded={!collapsed}
              className="rounded p-1 text-xs text-navy-400 hover:bg-navy-50"
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>
          <ProjectSidebar projectId={projectId} collapsed={collapsed} />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={t("projectNavigation")}
              className="relative z-10 flex h-full w-64 flex-col overflow-y-auto border-e-3 border-ink bg-white shadow-brutal-lg"
            >
              <div className="flex justify-end px-1 pt-1">
                <button type="button" onClick={() => setMobileOpen(false)} aria-label={t("closeNavigation")} className="rounded p-1 text-navy-500 hover:bg-navy-50">
                  ✕
                </button>
              </div>
              <ProjectSidebar projectId={projectId} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
