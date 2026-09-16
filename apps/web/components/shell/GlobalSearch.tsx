"use client";

import { apiJson } from "@/lib/api-client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../ui/Modal";

interface SearchResultItem {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  path: string;
}

const RECENT_KEY = "siteops.recentSearches";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string): void {
  const existing = loadRecent().filter((q) => q !== query);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...existing].slice(0, MAX_RECENT)));
}

/**
 * Cmd/Ctrl+K opens this from anywhere in the app. Results come from the
 * real `/search` endpoint (RFIs, submittals, documents, drawings, daily
 * logs, schedule tasks, people, companies, projects) -- categorized, not
 * a flat list -- with basic keyboard navigation and a small recent-
 * searches memory (per browser, not synced).
 */
export function GlobalSearch({ projectId }: { projectId?: string }) {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  const runSearch = useCallback(
    (q: string) => {
      if (q.trim().length < 2) {
        setResults(null);
        return;
      }
      const params = new URLSearchParams({ q });
      if (projectId) params.set("projectId", projectId);
      apiJson<SearchResultItem[]>(`/search?${params.toString()}`)
        .then(setResults)
        .catch(() => setResults([]));
    },
    [projectId],
  );

  function handleQueryChange(value: string): void {
    setQuery(value);
    setActiveIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 250);
  }

  function navigateTo(item: SearchResultItem): void {
    saveRecent(query);
    setOpen(false);
    router.push(`/${locale}${item.path}`);
  }

  function handleKeyNav(e: React.KeyboardEvent): void {
    if (!results || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) navigateTo(item);
    }
  }

  const grouped = results?.reduce<Record<string, SearchResultItem[]>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-xs items-center justify-between gap-2 rounded-lg border-2 border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20"
      >
        <span>{t("searchPlaceholder")}</span>
        <kbd className="rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-semibold">⌘K</kbd>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("searchTitle")} wide>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyNav}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border-3 border-ink px-3 py-2 text-sm"
          aria-label={t("searchTitle")}
          aria-activedescendant={results?.[activeIndex] ? `search-result-${activeIndex}` : undefined}
          role="combobox"
          aria-expanded={Boolean(results?.length)}
          aria-controls="search-results-list"
        />

        {!query && recent.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase text-navy-400">{t("recentSearches")}</p>
            <ul className="flex flex-col gap-1">
              {recent.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => handleQueryChange(q)} className="rounded px-2 py-1 text-sm text-navy-700 hover:bg-navy-50">
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {query.trim().length >= 2 && (
          <div id="search-results-list" role="listbox" className="mt-3 max-h-96 overflow-y-auto">
            {results === null && <p className="px-1 py-2 text-sm text-navy-500">{t("loading")}</p>}
            {results?.length === 0 && <p className="px-1 py-2 text-sm text-navy-500">{t("noResults")}</p>}
            {grouped &&
              Object.entries(grouped).map(([type, items]) => (
                <div key={type} className="mb-2">
                  <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-navy-400">{t(`searchCategory_${type}`)}</p>
                  {items.map((item) => {
                    const globalIndex = results?.indexOf(item) ?? -1;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        id={`search-result-${globalIndex}`}
                        role="option"
                        aria-selected={globalIndex === activeIndex}
                        onClick={() => navigateTo(item)}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                        className={`block w-full truncate rounded px-2 py-1.5 text-start text-sm ${globalIndex === activeIndex ? "bg-orange-50 text-navy-900" : "text-navy-700"}`}
                      >
                        <span className="font-medium">{item.title}</span>
                        {item.subtitle && <span className="ms-2 text-xs text-navy-500">{item.subtitle}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        )}
      </Modal>
    </>
  );
}
