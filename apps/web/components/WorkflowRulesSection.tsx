"use client";

import { apiJson } from "@/lib/api-client";
import {
  PERMISSION_LEVELS,
  RFI_STATUS_TRANSITIONS,
  PUNCH_ITEM_STATUS_TRANSITIONS,
  type Module,
  type PermissionLevel,
} from "@siteops/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface WorkflowTransitionRule {
  id: string;
  module: Module;
  fromStatus: string;
  toStatus: string;
  enabled: boolean;
  requiredLevel: PermissionLevel;
}

/** The two pilot modules workflow rules can narrow -- see workflow-rule.service.ts's isKnownTransition. */
const WORKFLOW_RULE_MODULES: readonly Module[] = ["rfis", "punch_list"];

function knownTransitions(module: Module): { fromStatus: string; toStatus: string }[] {
  const table = module === "rfis" ? RFI_STATUS_TRANSITIONS : PUNCH_ITEM_STATUS_TRANSITIONS;
  return Object.entries(table).flatMap(([fromStatus, toStatuses]) =>
    (toStatuses as readonly string[]).map((toStatus) => ({ fromStatus, toStatus })),
  );
}

interface Props {
  projectId: string;
  moduleLabel: (module: Module) => string;
}

/**
 * Lets a project admin narrow -- never widen -- the two pilot modules'
 * hardcoded status-transition machines: disable a specific transition, or
 * raise the permission level it requires above the module's own base
 * check. A row with no saved rule behaves as enabled/standard, the same
 * as the module's default, so this list always shows every known
 * transition rather than only the ones an admin has touched.
 */
export function WorkflowRulesSection({ projectId, moduleLabel }: Props) {
  const t = useTranslations("WorkflowRules");
  const [selectedModule, setSelectedModule] = useState<Module>("rfis");
  const [rules, setRules] = useState<WorkflowTransitionRule[] | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  function loadRules(module: Module): void {
    apiJson<WorkflowTransitionRule[]>(`/workflow-transition-rules?projectId=${projectId}&module=${module}`)
      .then(setRules)
      .catch(() => setRules([]));
  }

  useEffect(() => {
    setRules(null);
    loadRules(selectedModule);
  }, [selectedModule, projectId]);

  function ruleFor(fromStatus: string, toStatus: string): WorkflowTransitionRule | undefined {
    return rules?.find((r) => r.fromStatus === fromStatus && r.toStatus === toStatus);
  }

  async function saveRule(fromStatus: string, toStatus: string, enabled: boolean, requiredLevel: PermissionLevel): Promise<void> {
    const key = `${fromStatus}->${toStatus}`;
    setSavingKey(key);
    setSavedKey(null);
    try {
      await apiJson("/workflow-transition-rules", {
        method: "PUT",
        body: JSON.stringify({ projectId, module: selectedModule, fromStatus, toStatus, enabled, requiredLevel }),
      });
      loadRules(selectedModule);
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 3000);
    } finally {
      setSavingKey(null);
    }
  }

  const transitions = knownTransitions(selectedModule);

  return (
    <section className="mt-8 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
      <h2 className="mb-1 text-lg font-bold text-navy-900">{t("heading")}</h2>
      <p className="mb-3 text-xs text-navy-600">{t("intro")}</p>

      <label className="mb-4 flex flex-col gap-1 text-sm">
        {t("module")}
        <select
          value={selectedModule}
          onChange={(e) => setSelectedModule(e.target.value as Module)}
          className="w-64 rounded-lg border-3 border-ink px-3 py-2"
        >
          {WORKFLOW_RULE_MODULES.map((m) => (
            <option key={m} value={m}>
              {moduleLabel(m)}
            </option>
          ))}
        </select>
      </label>

      {!rules && <p className="text-sm text-navy-600">…</p>}
      {rules && transitions.length === 0 && <p className="text-sm text-navy-600">{t("noTransitions")}</p>}
      {rules && transitions.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-start text-xs uppercase text-navy-500">
              <th className="px-2 py-1 text-start font-semibold">{t("transition")}</th>
              <th className="px-2 py-1 text-start font-semibold">{t("enabled")}</th>
              <th className="px-2 py-1 text-start font-semibold">{t("requiredLevel")}</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {transitions.map(({ fromStatus, toStatus }) => {
              const key = `${fromStatus}->${toStatus}`;
              const existing = ruleFor(fromStatus, toStatus);
              const enabled = existing?.enabled ?? true;
              const requiredLevel = existing?.requiredLevel ?? "standard";
              return (
                <tr key={key} className="border-b border-navy-100">
                  <td className="px-2 py-2 font-medium text-navy-800">
                    {fromStatus} → {toStatus}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => void saveRule(fromStatus, toStatus, e.target.checked, requiredLevel)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={requiredLevel}
                      onChange={(e) => void saveRule(fromStatus, toStatus, enabled, e.target.value as PermissionLevel)}
                      className="rounded border-2 border-ink px-1 py-0.5 text-xs"
                    >
                      {PERMISSION_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-xs text-navy-500">
                    {savingKey === key && "…"}
                    {savedKey === key && t("saved")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
