"use client";

import { apiJson } from "@/lib/api-client";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

interface ActionPlanTemplateItem {
  id: string;
  description: string;
  defaultDueDays: number | null;
}

interface ActionPlanTemplate {
  id: string;
  name: string;
  description: string | null;
}

interface ActionPlanTemplateDetail extends ActionPlanTemplate {
  items: ActionPlanTemplateItem[];
}

/**
 * Procore's Action Plans: a reusable template of action items an admin
 * defines once, then applies against a safety incident/observation from
 * CorrectiveActionsPanel -- each item becomes an ordinary, independently
 * trackable corrective action rather than a parallel item type.
 */
export function ActionPlanTemplatesSection({ projectId }: { projectId: string }) {
  const t = useTranslations("ActionPlans");
  const tc = useTranslations("Common");

  const [templates, setTemplates] = useState<ActionPlanTemplate[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ActionPlanTemplateDetail | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const [itemDescription, setItemDescription] = useState("");
  const [itemDueDays, setItemDueDays] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  function loadTemplates(): void {
    apiJson<ActionPlanTemplate[]>(`/action-plan-templates?projectId=${projectId}`)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }

  useEffect(() => {
    loadTemplates();
  }, [projectId]);

  function loadDetail(templateId: string): void {
    apiJson<ActionPlanTemplateDetail>(`/action-plan-templates/${templateId}?projectId=${projectId}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }

  function toggleExpand(templateId: string): void {
    if (expandedId === templateId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(templateId);
    loadDetail(templateId);
  }

  async function handleCreateTemplate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreatingTemplate(true);
    try {
      await apiJson("/action-plan-templates", {
        method: "POST",
        body: JSON.stringify({ projectId, name: newName.trim(), description: newDescription.trim() || undefined }),
      });
      setNewName("");
      setNewDescription("");
      loadTemplates();
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function handleDeleteTemplate(templateId: string): Promise<void> {
    await apiJson(`/action-plan-templates/${templateId}?projectId=${projectId}`, { method: "DELETE" });
    if (expandedId === templateId) {
      setExpandedId(null);
      setDetail(null);
    }
    loadTemplates();
  }

  async function handleAddItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!expandedId || !itemDescription.trim()) return;
    setAddingItem(true);
    try {
      await apiJson(`/action-plan-templates/${expandedId}/items`, {
        method: "POST",
        body: JSON.stringify({
          projectId,
          description: itemDescription.trim(),
          defaultDueDays: itemDueDays ? Number(itemDueDays) : undefined,
          sortOrder: detail?.items.length ?? 0,
        }),
      });
      setItemDescription("");
      setItemDueDays("");
      loadDetail(expandedId);
    } finally {
      setAddingItem(false);
    }
  }

  async function handleDeleteItem(itemId: string): Promise<void> {
    if (!expandedId) return;
    await apiJson(`/action-plan-templates/items/${itemId}?projectId=${projectId}`, { method: "DELETE" });
    loadDetail(expandedId);
  }

  return (
    <section className="mt-8 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
      <h2 className="mb-1 text-lg font-bold text-navy-900">{t("templatesHeading")}</h2>
      <p className="mb-3 text-xs text-navy-600">{t("templatesIntro")}</p>

      {!templates && <p className="text-sm text-navy-600">{tc("loading")}</p>}
      {templates && templates.length === 0 && <p className="mb-3 text-sm text-navy-600">{t("noTemplates")}</p>}
      {templates && templates.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {templates.map((tpl) => (
            <li key={tpl.id} className="rounded-lg border-2 border-orange-200 bg-white p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => toggleExpand(tpl.id)} className="text-start font-medium text-navy-800">
                  {tpl.name}
                </button>
                <button onClick={() => void handleDeleteTemplate(tpl.id)} className="rounded border-2 border-ink px-2 py-1 text-xs font-semibold text-maroon-700">
                  {tc("delete")}
                </button>
              </div>
              {tpl.description && <p className="mt-1 text-xs text-navy-500">{tpl.description}</p>}
              {expandedId === tpl.id && (
                <div className="mt-2 rounded-lg border-2 border-navy-100 bg-cream p-2">
                  {!detail && <p className="text-xs text-navy-600">{tc("loading")}</p>}
                  {detail && detail.items.length === 0 && <p className="text-xs text-navy-600">{t("noItems")}</p>}
                  {detail && detail.items.length > 0 && (
                    <ol className="mb-2 flex list-decimal flex-col gap-1 ps-4">
                      {detail.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                          <span>
                            {item.description}
                            {item.defaultDueDays !== null && <span className="ms-1 text-navy-400">({t("dueInDays", { days: item.defaultDueDays })})</span>}
                          </span>
                          <button onClick={() => void handleDeleteItem(item.id)} className="text-maroon-700">
                            {tc("delete")}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <form onSubmit={(e) => void handleAddItem(e)} className="flex flex-wrap items-center gap-2">
                    <input
                      placeholder={t("itemDescriptionPlaceholder")}
                      value={itemDescription}
                      onChange={(e) => setItemDescription(e.target.value)}
                      className="flex-1 rounded border-2 border-ink px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder={t("dueInDaysPlaceholder")}
                      value={itemDueDays}
                      onChange={(e) => setItemDueDays(e.target.value)}
                      className="w-24 rounded border-2 border-ink px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={addingItem}
                      className="rounded border-2 border-ink bg-navy-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {t("addItem")}
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void handleCreateTemplate(e)} className="flex flex-col gap-2 rounded-xl border-3 border-ink border-dashed bg-white p-3">
        <p className="text-xs font-bold text-navy-800">{t("newTemplate")}</p>
        <input
          placeholder={t("templateNamePlaceholder")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
          className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
        />
        <input
          placeholder={t("templateDescriptionPlaceholder")}
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={creatingTemplate}
          className="self-start rounded-lg border-2 border-ink bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {t("newTemplate")}
        </button>
      </form>
    </section>
  );
}
