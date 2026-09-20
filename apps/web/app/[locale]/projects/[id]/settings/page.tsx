"use client";

import { ActionPlanTemplatesSection } from "@/components/ActionPlanTemplatesSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkflowRulesSection } from "@/components/WorkflowRulesSection";
import { apiJson, ApiClientError } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { MODULES, CUSTOM_FIELD_TYPES, type CustomFieldType, type Module } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Project {
  id: string;
  defaultCurrency: string;
  changeOrderThreshold: string;
  timezone: string;
  inboundEmailAddress: string;
}

interface CustomFieldDefinition {
  id: string;
  module: Module;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
}

export default function ProjectSettingsPage() {
  const t = useTranslations("ProjectSettings");
  const tm = useTranslations("Modules");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [changeOrderThreshold, setChangeOrderThreshold] = useState("");
  const [timezone, setTimezone] = useState("");
  const [inboundEmailAddress, setInboundEmailAddress] = useState("");
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalSaved, setGeneralSaved] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const [selectedModule, setSelectedModule] = useState<Module>("rfis");
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[] | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [creatingField, setCreatingField] = useState(false);

  function loadProject(): void {
    apiJson<Project>(`/projects/${params.id}`)
      .then((project) => {
        setDefaultCurrency(project.defaultCurrency);
        setChangeOrderThreshold(project.changeOrderThreshold);
        setTimezone(project.timezone);
        setInboundEmailAddress(project.inboundEmailAddress);
      })
      .catch((err) => {
        if (err instanceof ApiClientError && err.status === 403) setForbidden(true);
        else setError(tc("errorGeneric"));
      });
  }

  function loadDefinitions(module: Module): void {
    apiJson<CustomFieldDefinition[]>(`/custom-field-definitions?projectId=${params.id}&module=${module}`)
      .then(setDefinitions)
      .catch((err) => {
        if (err instanceof ApiClientError && err.status === 403) setForbidden(true);
        else setError(tc("errorGeneric"));
      });
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    loadProject();
  }, [router, locale, params.id]);

  useEffect(() => {
    setDefinitions(null);
    loadDefinitions(selectedModule);
  }, [selectedModule, params.id]);

  async function handleSaveGeneral(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSavingGeneral(true);
    setGeneralSaved(false);
    try {
      await apiJson(`/projects/${params.id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          defaultCurrency: defaultCurrency.toUpperCase(),
          changeOrderThreshold: Number(changeOrderThreshold),
          timezone,
        }),
      });
      setGeneralSaved(true);
      setTimeout(() => setGeneralSaved(false), 4000);
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSavingGeneral(false);
    }
  }

  async function handleCopyInboundAddress(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inboundEmailAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 4000);
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleCreateField(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setCreatingField(true);
    try {
      await apiJson("/custom-field-definitions", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          module: selectedModule,
          label: newLabel.trim(),
          fieldType: newFieldType,
          options: newFieldType === "select" ? newOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
          required: newRequired,
        }),
      });
      setNewLabel("");
      setNewFieldType("text");
      setNewOptions("");
      setNewRequired(false);
      loadDefinitions(selectedModule);
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreatingField(false);
    }
  }

  async function handleDeleteField(definitionId: string): Promise<void> {
    try {
      await apiJson(`/custom-field-definitions/${definitionId}?projectId=${params.id}`, { method: "DELETE" });
      loadDefinitions(selectedModule);
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  if (forbidden) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title={t("title")} />
        <p className="text-navy-600">{t("forbidden")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title={t("title")} description={t("intro")} />
      {error && <p className="mb-4 text-maroon-700">{error}</p>}

      <section className="mb-8 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
        <h2 className="mb-3 text-lg font-bold text-navy-900">{t("generalHeading")}</h2>
        <form onSubmit={(e) => void handleSaveGeneral(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("defaultCurrency")}
            <input
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              maxLength={3}
              required
              className="w-24 rounded-lg border-3 border-ink px-3 py-2 uppercase"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("changeOrderThreshold")}
            <input
              type="number"
              min={0}
              step="0.01"
              value={changeOrderThreshold}
              onChange={(e) => setChangeOrderThreshold(e.target.value)}
              required
              className="w-48 rounded-lg border-3 border-ink px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("timezone")}
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} required className="w-64 rounded-lg border-3 border-ink px-3 py-2" />
          </label>
          <button
            type="submit"
            disabled={savingGeneral}
            className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {savingGeneral ? tc("saving") : t("save")}
          </button>
          {generalSaved && <p className="text-sm text-navy-600">{t("saved")}</p>}
        </form>

        <div className="mt-4 border-t-2 border-orange-100 pt-3">
          <p className="text-sm font-semibold text-navy-800">{t("inboundEmailHeading")}</p>
          <p className="mb-2 text-xs text-navy-600">{t("inboundEmailIntro")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm">{inboundEmailAddress}</code>
            <button
              type="button"
              onClick={() => void handleCopyInboundAddress()}
              className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs font-semibold text-navy-800"
            >
              {addressCopied ? tc("copied") : tc("copy")}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
        <h2 className="mb-1 text-lg font-bold text-navy-900">{t("customFieldsHeading")}</h2>
        <p className="mb-3 text-xs text-navy-600">{t("customFieldsIntro")}</p>

        <label className="mb-4 flex flex-col gap-1 text-sm">
          {t("module")}
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value as Module)}
            className="w-64 rounded-lg border-3 border-ink px-3 py-2"
          >
            {MODULES.map((m) => (
              <option key={m} value={m}>
                {tm(m)}
              </option>
            ))}
          </select>
        </label>

        {!definitions && <p className="text-sm text-navy-600">{tc("loading")}</p>}
        {definitions && definitions.length === 0 && <p className="mb-3 text-sm text-navy-600">{t("noFields")}</p>}
        {definitions && definitions.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {definitions.map((def) => (
              <li key={def.id} className="flex items-center justify-between gap-2 rounded-lg border-2 border-orange-200 bg-white p-2 text-sm">
                <div>
                  <span className="font-medium">{def.label}</span>
                  <span className="ml-2 text-xs text-navy-500">
                    {t(`fieldType_${def.fieldType}`)}
                    {def.required && ` · ${t("requiredBadge")}`}
                  </span>
                </div>
                <button onClick={() => void handleDeleteField(def.id)} className="rounded border-2 border-ink px-2 py-1 text-xs font-semibold text-maroon-700">
                  {tc("delete")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={(e) => void handleCreateField(e)} className="flex flex-col gap-2 rounded-xl border-3 border-ink border-dashed bg-white p-3">
          <p className="text-xs font-bold text-navy-800">{t("addField")}</p>
          <input
            placeholder={t("fieldLabelPlaceholder")}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            required
            className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
          />
          <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)} className="rounded-lg border-2 border-ink px-2 py-1 text-sm">
            {CUSTOM_FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {t(`fieldType_${ft}`)}
              </option>
            ))}
          </select>
          {newFieldType === "select" && (
            <input
              placeholder={t("optionsPlaceholder")}
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
            />
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />
            {t("requiredLabel")}
          </label>
          <button
            type="submit"
            disabled={creatingField}
            className="self-start rounded-lg border-2 border-ink bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {t("addField")}
          </button>
        </form>
      </section>

      <WorkflowRulesSection projectId={params.id} moduleLabel={(m) => tm(m)} />

      <ActionPlanTemplatesSection projectId={params.id} />
    </main>
  );
}
