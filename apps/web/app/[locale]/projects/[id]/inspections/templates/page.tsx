"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { ChecklistResponseType } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface ChecklistTemplate {
  id: string;
  title: string;
}

interface ItemDraft {
  prompt: string;
  responseType: ChecklistResponseType;
  order: number;
}

const RESPONSE_TYPES: ChecklistResponseType[] = ["pass_fail", "na", "numeric", "photo", "signature"];

export default function ChecklistTemplatesPage() {
  const t = useTranslations("Inspections");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [templates, setTemplates] = useState<ChecklistTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ prompt: "", responseType: "pass_fail", order: 1 }]);
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<ChecklistTemplate[]>(`/checklist-templates?projectId=${params.id}`)
      .then(setTemplates)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, params.id]);

  function responseTypeLabel(type: ChecklistResponseType): string {
    return {
      pass_fail: t("responseTypePassFail"),
      na: t("responseTypeNa"),
      numeric: t("responseTypeNumeric"),
      photo: t("responseTypePhoto"),
      signature: t("responseTypeSignature"),
    }[type];
  }

  function updateItem(index: number, patch: Partial<ItemDraft>): void {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    const validItems = items.filter((it) => it.prompt.trim());
    if (validItems.length === 0) return;
    setCreating(true);
    try {
      await apiJson("/checklist-templates", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, title, items: validItems }),
      });
      setTitle("");
      setItems([{ prompt: "", responseType: "pass_fail", order: 1 }]);
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("manageTemplates")}</h1>
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
            {t("newTemplate")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("templateTitle")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>

            <span className="text-sm font-medium">{t("items")}</span>
            {items.map((item, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  value={item.prompt}
                  onChange={(e) => updateItem(i, { prompt: e.target.value })}
                  placeholder={t("prompt")}
                  className="min-w-[220px] flex-1 rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
                />
                <select
                  value={item.responseType}
                  onChange={(e) => updateItem(i, { responseType: e.target.value as ChecklistResponseType })}
                  className="rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
                >
                  {RESPONSE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {responseTypeLabel(rt)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { prompt: "", responseType: "pass_fail", order: prev.length + 1 }])}
              className="self-start text-xs text-navy-700 underline"
            >
              {t("addItem")}
            </button>

            <button type="submit" disabled={creating || !title.trim()} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!templates && !error && <p>{tc("loading")}</p>}
        {templates && templates.length === 0 && <p className="text-navy-600">{t("noTemplates")}</p>}
        <ul className="flex flex-col gap-2">
          {templates?.map((tpl) => (
            <li key={tpl.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-3 text-sm font-medium">
              {tpl.title}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
