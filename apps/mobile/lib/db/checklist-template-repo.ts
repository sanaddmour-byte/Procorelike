import { getDb } from "./database";

export interface LocalChecklistTemplate {
  id: string;
  projectId: string;
  title: string;
}

export interface LocalChecklistTemplateItem {
  id: string;
  templateId: string;
  prompt: string;
  responseType: "pass_fail" | "na" | "numeric" | "photo" | "signature";
  order: number;
}

/**
 * Templates are reference data fetched while online and cached for
 * offline use — there is no outbox entry or sync-status for them (they're
 * never edited from the field, only read). Caching replaces any
 * previously-cached copy of the same template wholesale, so a template
 * edited on the web picks up the latest items next time the device is
 * online (docs/ROADMAP.md's Phase 5 gate report: no per-template
 * versioning, just "last cached wins").
 */
export async function cacheChecklistTemplate(
  template: { id: string; projectId: string; title: string },
  items: { id: string; prompt: string; responseType: LocalChecklistTemplateItem["responseType"]; order: number }[],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO checklist_templates (id, project_id, title, cached_at) VALUES (?, ?, ?, ?)",
    [template.id, template.projectId, template.title, new Date().toISOString()],
  );
  await db.runAsync("DELETE FROM checklist_template_items WHERE template_id = ?", [template.id]);
  for (const item of items) {
    await db.runAsync(
      "INSERT INTO checklist_template_items (id, template_id, prompt, response_type, item_order) VALUES (?, ?, ?, ?, ?)",
      [item.id, template.id, item.prompt, item.responseType, item.order],
    );
  }
}

export async function listCachedTemplates(projectId: string): Promise<LocalChecklistTemplate[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; project_id: string; title: string }>(
    "SELECT id, project_id, title FROM checklist_templates WHERE project_id = ?",
    [projectId],
  );
  return rows.map((r) => ({ id: r.id, projectId: r.project_id, title: r.title }));
}

export async function getCachedTemplateItems(templateId: string): Promise<LocalChecklistTemplateItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; template_id: string; prompt: string; response_type: string; item_order: number }>(
    "SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY item_order ASC",
    [templateId],
  );
  return rows.map((r) => ({
    id: r.id,
    templateId: r.template_id,
    prompt: r.prompt,
    responseType: r.response_type as LocalChecklistTemplateItem["responseType"],
    order: r.item_order,
  }));
}
