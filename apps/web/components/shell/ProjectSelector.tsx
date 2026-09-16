"use client";

import { apiJson } from "@/lib/api-client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Project {
  id: string;
  name: string;
}

/**
 * The current project is always visible in the header, and switching
 * projects keeps you on the same module (e.g. Budget -> Budget) when the
 * target project has it, falling back to its Dashboard otherwise --
 * never a dead link.
 */
export function ProjectSelector({ projectId }: { projectId: string }) {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiJson<Project[]>("/projects")
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = projects?.find((p) => p.id === projectId);

  function switchTo(nextId: string): void {
    setOpen(false);
    if (nextId === projectId) return;
    const currentSegment = window.location.pathname.split(`/projects/${projectId}/`)[1]?.split("/")[0];
    router.push(`/${locale}/projects/${nextId}/${currentSegment || "dashboard"}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-[220px] items-center gap-1.5 rounded-lg border-2 border-white/30 bg-white/10 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
      >
        <span className="truncate">{current?.name ?? t("selectProject")}</span>
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>
      {open && (
        <ul role="listbox" className="absolute start-0 top-full z-40 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border-3 border-ink bg-white py-1 text-sm shadow-brutal-lg">
          {!projects && <li className="px-3 py-2 text-navy-500">{t("loading")}</li>}
          {projects?.length === 0 && <li className="px-3 py-2 text-navy-500">{t("noProjects")}</li>}
          {projects?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === projectId}
                onClick={() => switchTo(p.id)}
                className={`block w-full truncate px-3 py-1.5 text-start ${p.id === projectId ? "bg-maroon-50 font-semibold text-maroon-700" : "text-navy-800 hover:bg-navy-50"}`}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
