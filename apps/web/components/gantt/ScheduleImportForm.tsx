"use client";

import { apiJson } from "@/lib/api-client";
import { useTranslations } from "next-intl";
import { useState, type ChangeEvent, type FormEvent } from "react";

type SourceTool = "csv" | "ms_project_xml" | "p6_xer" | "p6_xml";

const ACCEPT: Record<SourceTool, string> = {
  csv: ".csv,text/csv",
  ms_project_xml: ".xml",
  p6_xer: ".xer",
  p6_xml: ".xml",
};

interface Props {
  projectId: string;
  onImported: () => void;
}

export function ScheduleImportForm({ projectId, onImported }: Props) {
  const t = useTranslations("Gantt");
  const tc = useTranslations("Common");
  const [sourceTool, setSourceTool] = useState<SourceTool>("csv");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setFileText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!fileText) return;
    setImporting(true);
    setError(null);
    try {
      await apiJson("/schedules/import", {
        method: "POST",
        body: JSON.stringify({ projectId, sourceTool, fileText }),
      });
      setFileName("");
      setFileText("");
      onImported();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mx-auto flex max-w-lg flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-6 shadow-brutal-sm"
    >
      <h2 className="text-lg font-bold text-navy-900">{t("importTitle")}</h2>
      <p className="text-sm text-navy-600">{t("importHelp")}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t("sourceTool")}
        <select
          value={sourceTool}
          onChange={(e) => setSourceTool(e.target.value as SourceTool)}
          className="rounded-lg border-3 border-ink px-3 py-2"
        >
          <option value="csv">{t("sourceToolCsv")}</option>
          <option value="ms_project_xml">{t("sourceToolMsProject")}</option>
          <option value="p6_xer">{t("sourceToolP6Xer")}</option>
          <option value="p6_xml">{t("sourceToolP6Xml")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("chooseFile")}
        <input type="file" accept={ACCEPT[sourceTool]} onChange={handleFile} className="rounded-lg border-3 border-ink px-3 py-2" />
      </label>
      {fileName && <p className="text-xs text-navy-600">{fileName}</p>}
      {error && <p className="text-maroon-700">{error}</p>}
      <button
        type="submit"
        disabled={importing || !fileText}
        className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {importing ? t("importing") : t("import")}
      </button>
    </form>
  );
}
