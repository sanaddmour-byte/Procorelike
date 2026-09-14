"use client";

import { apiJson } from "@/lib/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * A generic "connect this record to other records" widget over the
 * apps/api record-links endpoints (packages/db's polymorphic
 * `record_links` table) -- e.g. an RFI linked to a drawing or a
 * specification section, so opening the link navigates straight there.
 * `targetType` values must be registered in apps/api's
 * `record-links.service.ts` LINK_TYPE_MODULES map.
 */

export interface RecordLinkOption {
  id: string;
  label: string;
}

export interface RecordLinkTargetConfig {
  targetType: string;
  label: string;
  addLabel: string;
  emptyLabel: string;
  selectPlaceholder: string;
  options: RecordLinkOption[];
  hrefFor: (id: string) => string;
}

interface RawLink {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
}

interface Props {
  projectId: string;
  recordType: string;
  recordId: string;
  targets: RecordLinkTargetConfig[];
  removeLabel: string;
}

export function RecordLinks({ projectId, recordType, recordId, targets, removeLabel }: Props) {
  const [links, setLinks] = useState<RawLink[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function reload(): Promise<void> {
    const rows = await apiJson<RawLink[]>(`/record-links?projectId=${projectId}&recordType=${recordType}&recordId=${recordId}`);
    setLinks(rows);
  }

  useEffect(() => {
    void reload();
  }, [projectId, recordType, recordId]);

  function linkRow(targetType: string, otherId: string): RawLink | undefined {
    return links.find(
      (l) =>
        (l.sourceType === recordType && l.sourceId === recordId && l.targetType === targetType && l.targetId === otherId) ||
        (l.targetType === recordType && l.targetId === recordId && l.sourceType === targetType && l.sourceId === otherId),
    );
  }

  async function handleAdd(targetType: string): Promise<void> {
    const targetId = selected[targetType];
    if (!targetId) return;
    setBusy(true);
    try {
      await apiJson("/record-links", {
        method: "POST",
        body: JSON.stringify({ projectId, sourceType: recordType, sourceId: recordId, targetType, targetId }),
      });
      setSelected((s) => ({ ...s, [targetType]: "" }));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(linkId: string): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/record-links/${linkId}?projectId=${projectId}`, { method: "DELETE" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {targets.map((target) => {
        const linkedIds = new Set(
          target.options
            .filter((o) => linkRow(target.targetType, o.id))
            .map((o) => o.id),
        );
        const linkedOptions = target.options.filter((o) => linkedIds.has(o.id));
        const availableOptions = target.options.filter((o) => !linkedIds.has(o.id));

        return (
          <div key={target.targetType}>
            <h3 className="mb-1.5 text-sm font-semibold text-navy-800">{target.label}</h3>
            {linkedOptions.length === 0 ? (
              <p className="mb-2 text-sm text-navy-600">{target.emptyLabel}</p>
            ) : (
              <ul className="mb-2 flex flex-wrap gap-2">
                {linkedOptions.map((o) => {
                  const row = linkRow(target.targetType, o.id);
                  return (
                    <li key={o.id} className="flex items-center gap-1.5 rounded-lg border-3 border-ink bg-white px-2.5 py-1.5 text-sm">
                      <Link href={target.hrefFor(o.id)} className="text-navy-800 underline">
                        {o.label}
                      </Link>
                      {row && (
                        <button
                          type="button"
                          onClick={() => void handleRemove(row.id)}
                          disabled={busy}
                          aria-label={removeLabel}
                          className="text-navy-500 hover:text-maroon-700"
                        >
                          &times;
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {availableOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selected[target.targetType] ?? ""}
                  onChange={(e) => setSelected((s) => ({ ...s, [target.targetType]: e.target.value }))}
                  className="min-w-0 max-w-full flex-1 rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
                >
                  <option value="">{target.selectPlaceholder}</option>
                  {availableOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleAdd(target.targetType)}
                  disabled={busy || !selected[target.targetType]}
                  className="shrink-0 rounded-lg border-3 border-ink bg-white px-2.5 py-1.5 text-sm text-navy-800 disabled:opacity-50"
                >
                  {target.addLabel}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
