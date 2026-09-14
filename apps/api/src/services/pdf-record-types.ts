import type { Module, PdfCommentRecordType } from "@siteops/shared";

/** Which permission module a pinned PDF comment or sketch's recordType belongs to -- same "app-layer, no RLS" approach as record-links.service.ts's LINK_TYPE_MODULES, for the same reason (the underlying record varies by type). Shared by pdf-comments.service.ts and pdf-sketches.service.ts since both anchor to the same closed set of record types the in-app PDF previewer renders. */
export const PDF_RECORD_TYPE_MODULES: Record<PdfCommentRecordType, Module> = {
  rfi: "rfis",
  submittal: "submittals",
  change_order: "change_management",
  correspondence: "correspondence",
  inspection: "inspections",
};
