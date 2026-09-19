import { z } from "zod";

const MAX_PAGE_SIZE = 200;
/** The page size a service applies once it decides a request is paginated (`page` and/or `pageSize` present) — see paginationQuerySchema's doc comment. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * The reusable half of every module's list-query contract: search/sort/
 * pagination. A module's own filters (status, assignee, date range, ...)
 * are module-specific and get merged in via `.extend()` at the call site
 * (see rfi.schema.ts's `listRfisQuerySchema` for the pattern) -- this file
 * only standardizes the part that's identical everywhere, per
 * docs/DATA_MODEL.md's list-query-contract section.
 *
 * Every field is optional and undefined-by-default on purpose: a caller
 * that sends none of these gets a service's original "every row, no
 * pagination" behavior unchanged (see rfi.service.ts's `listRfis`) --
 * pagination is opt-in per request, not a breaking default, so existing
 * callers (e.g. the mobile app's read-only list screens) keep working
 * without being migrated to page through results.
 */
export const paginationQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.string().min(1).max(100).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
}
