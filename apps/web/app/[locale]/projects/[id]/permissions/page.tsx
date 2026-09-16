"use client";

import { ApiClientError, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { MODULES, PERMISSION_LEVELS, type Module, type PermissionLevel } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

interface PermissionTemplate {
  id: string;
  name: string;
  levels: Partial<Record<Module, PermissionLevel>>;
}

interface MemberPermissions {
  userId: string;
  name: string;
  email: string;
  role: string;
  permissionTemplateId: string | null;
  templateName: string | null;
  templateLevels: Partial<Record<Module, PermissionLevel>>;
  overrides: Partial<Record<Module, PermissionLevel>>;
}

function emptyLevels(): Partial<Record<Module, PermissionLevel>> {
  return Object.fromEntries(MODULES.map((m) => [m, "none" as PermissionLevel])) as Partial<Record<Module, PermissionLevel>>;
}

export default function PermissionsPage() {
  const t = useTranslations("Permissions");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [templates, setTemplates] = useState<PermissionTemplate[] | null>(null);
  const [members, setMembers] = useState<MemberPermissions[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateLevels, setNewTemplateLevels] = useState<Partial<Record<Module, PermissionLevel>>>(emptyLevels());
  const [creating, setCreating] = useState(false);

  const [templateDrafts, setTemplateDrafts] = useState<Record<string, Partial<Record<Module, PermissionLevel>>>>({});
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

  const [overrideDraft, setOverrideDraft] = useState<Record<string, { module: Module; level: PermissionLevel }>>({});

  function reload(): void {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    setForbidden(false);
    setError(null);

    apiJson<PermissionTemplate[]>(`/permission-templates?projectId=${params.id}`)
      .then((list) => {
        setTemplates(list);
        setTemplateDrafts(Object.fromEntries(list.map((tpl) => [tpl.id, tpl.levels])));
      })
      .catch(() => setError(tc("errorGeneric")));

    apiJson<MemberPermissions[]>(`/projects/${params.id}/member-permissions`)
      .then(setMembers)
      .catch((err) => {
        if (err instanceof ApiClientError && err.code === "permission_denied") {
          setForbidden(true);
        } else {
          setError(tc("errorGeneric"));
        }
      });
  }, [router, locale, params.id, tc, refreshKey]);

  async function handleCreateTemplate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/permission-templates", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, name: newTemplateName, levels: newTemplateLevels }),
      });
      setNewTemplateName("");
      setNewTemplateLevels(emptyLevels());
      reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveTemplate(templateId: string): Promise<void> {
    setSavingTemplateId(templateId);
    try {
      await apiJson(`/permission-templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId: params.id, levels: templateDrafts[templateId] }),
      });
      reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSavingTemplateId(null);
    }
  }

  async function handleDeleteTemplate(templateId: string): Promise<void> {
    try {
      await apiJson(`/permission-templates/${templateId}`, {
        method: "DELETE",
        body: JSON.stringify({ projectId: params.id }),
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === "template_in_use" ? t("templateInUse") : tc("errorGeneric"));
    }
  }

  async function handleAssignTemplate(userId: string, permissionTemplateId: string): Promise<void> {
    try {
      await apiJson(`/projects/${params.id}/members/${userId}/permission-template`, {
        method: "PATCH",
        body: JSON.stringify({ permissionTemplateId: permissionTemplateId || null }),
      });
      reload();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleAddOverride(userId: string): Promise<void> {
    const draft = overrideDraft[userId];
    if (!draft) return;
    try {
      await apiJson("/permission-overrides", {
        method: "PUT",
        body: JSON.stringify({ userId, projectId: params.id, module: draft.module, level: draft.level }),
      });
      reload();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleClearOverride(userId: string, module: Module): Promise<void> {
    try {
      await apiJson("/permission-overrides", {
        method: "DELETE",
        body: JSON.stringify({ userId, projectId: params.id, module }),
      });
      reload();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/${locale}/projects`} className="text-sm text-navy-700 underline">
          {t("back")}
        </Link>
        <h1 className="mb-4 mt-2 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        {error && <p className="text-maroon-700">{error}</p>}
        {forbidden && <p className="text-navy-600">{t("forbidden")}</p>}

        {!forbidden && (
          <>
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-bold text-navy-900">{t("templatesHeading")}</h2>
              {!templates && <p>{tc("loading")}</p>}
              <ul className="flex flex-col gap-4">
                {templates?.map((tpl) => (
                  <li key={tpl.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-bold text-navy-900">{tpl.name}</span>
                      <button type="button" onClick={() => void handleDeleteTemplate(tpl.id)} className="text-xs font-semibold text-maroon-700 underline">
                        {t("deleteTemplate")}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {MODULES.map((module) => (
                        <label key={module} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-navy-700">{module}</span>
                          <select
                            value={templateDrafts[tpl.id]?.[module] ?? "none"}
                            onChange={(e) =>
                              setTemplateDrafts((prev) => ({
                                ...prev,
                                [tpl.id]: { ...prev[tpl.id], [module]: e.target.value as PermissionLevel },
                              }))
                            }
                            className="rounded border-2 border-ink px-1 py-0.5 text-xs"
                          >
                            {PERMISSION_LEVELS.map((lvl) => (
                              <option key={lvl} value={lvl}>
                                {lvl}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveTemplate(tpl.id)}
                      disabled={savingTemplateId === tpl.id}
                      className="mt-3 rounded-lg border-3 border-ink bg-navy-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {savingTemplateId === tpl.id ? tc("saving") : t("saveTemplate")}
                    </button>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleCreateTemplate} className="mt-4 rounded-xl border-3 border-ink border-dashed bg-white p-4">
                <h3 className="mb-2 font-bold text-navy-900">{t("newTemplate")}</h3>
                <input
                  type="text"
                  required
                  placeholder={t("templateNamePlaceholder")}
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="mb-3 w-full rounded-lg border-2 border-ink px-2 py-1 text-sm"
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {MODULES.map((module) => (
                    <label key={module} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-navy-700">{module}</span>
                      <select
                        value={newTemplateLevels[module] ?? "none"}
                        onChange={(e) => setNewTemplateLevels((prev) => ({ ...prev, [module]: e.target.value as PermissionLevel }))}
                        className="rounded border-2 border-ink px-1 py-0.5 text-xs"
                      >
                        {PERMISSION_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="mt-3 rounded-lg border-3 border-ink bg-maroon-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {creating ? tc("saving") : t("createTemplate")}
                </button>
              </form>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-bold text-navy-900">{t("membersHeading")}</h2>
              {!members && <p>{tc("loading")}</p>}
              <ul className="flex flex-col gap-4">
                {members?.map((m) => (
                  <li key={m.userId} className="rounded-xl border-3 border-ink bg-white p-4 shadow-brutal">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-navy-900">{m.name}</span>{" "}
                        <span className="text-xs text-navy-500">
                          ({m.email}, {m.role})
                        </span>
                      </div>
                      <label className="text-xs">
                        {t("assignedTemplate")}{" "}
                        <select
                          value={m.permissionTemplateId ?? ""}
                          onChange={(e) => void handleAssignTemplate(m.userId, e.target.value)}
                          className="rounded border-2 border-ink px-1 py-0.5 text-xs"
                        >
                          <option value="">{t("noTemplate")}</option>
                          {templates?.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {Object.keys(m.overrides).length > 0 && (
                      <ul className="mb-2 flex flex-wrap gap-2">
                        {(Object.entries(m.overrides) as [Module, PermissionLevel][]).map(([module, level]) => (
                          <li key={module} className="flex items-center gap-1 rounded-full border-2 border-ink bg-orange-100 px-2 py-0.5 text-xs">
                            {module}: {level}
                            <button type="button" onClick={() => void handleClearOverride(m.userId, module)} className="font-bold text-maroon-700">
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-navy-600">{t("addOverride")}</span>
                      <select
                        value={overrideDraft[m.userId]?.module ?? MODULES[0]}
                        onChange={(e) =>
                          setOverrideDraft((prev) => ({
                            ...prev,
                            [m.userId]: { module: e.target.value as Module, level: prev[m.userId]?.level ?? "none" },
                          }))
                        }
                        className="rounded border-2 border-ink px-1 py-0.5"
                      >
                        {MODULES.map((module) => (
                          <option key={module} value={module}>
                            {module}
                          </option>
                        ))}
                      </select>
                      <select
                        value={overrideDraft[m.userId]?.level ?? "none"}
                        onChange={(e) =>
                          setOverrideDraft((prev) => ({
                            ...prev,
                            [m.userId]: { module: prev[m.userId]?.module ?? MODULES[0], level: e.target.value as PermissionLevel },
                          }))
                        }
                        className="rounded border-2 border-ink px-1 py-0.5"
                      >
                        {PERMISSION_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void handleAddOverride(m.userId)} className="rounded border-2 border-ink bg-navy-700 px-2 py-0.5 font-bold text-white">
                        {t("set")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}
