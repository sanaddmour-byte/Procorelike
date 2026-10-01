# Remediation plan — Stage 3

> **Plan only. No code is changed until you approve it.** Evidence IDs point at [`AUDIT_EVIDENCE.md`](./AUDIT_EVIDENCE.md) (**E§n**), [`TASK_BENCHMARKS.md`](./TASK_BENCHMARKS.md) (**T1–T10**) and [`CRITIQUE.md`](./CRITIQUE.md) (**C§n.k**). Hours are engineering estimates for one developer including tests and before/after evidence, not measured. Every item obeys the D0 scope guard: it must reduce taps, time or error, or increase what is visible at once.

## 0. How the work is ordered

Pattern fixes before screen fixes. Four global layers, then screens, then the tests that lock the gains in:

| Phase | Layer | Scope | Why here |
|---|---|---|---|
| **A** | Design tokens | **Global** | Everything else consumes them |
| **B** | Shared components (list shell, filter chips, record header, form shell, states, bottom nav, create sheet) | **Global** | 20 lists and ~15 forms share these; one fix replaces ~35 |
| **C** | Navigation shell (project landing, switcher, back-stack, deep links, recents, command palette) | **Global** | Highest regression risk — isolated behind a flag |
| **D** | Offline + local-first write path (web) | **Global** | Removes the P0 offline failures |
| **E** | Screen work that consumes A–D (punch list, daily log, RFI, drawings, photos, My Work, permissions, gantt) | **Local** | Thin once A–D exist |
| **F** | Interaction-count E2E per D1 task + audit re-run | **Global** | Gate (D10) |

**Global** = tokens, `components/ui/*`, `components/shell/*`, `lib/*`. **Local** = a single `app/[locale]/…/page.tsx`.

**Rules carried into Stage 4:** one item (or one pattern) per commit, conventional commit message referencing the ID; typecheck, lint, test, build and the existing E2E suite green at every commit; no new dependency without your sign-off (see §7); no visual redesign beyond what an item authorises.

## 1. Decisions I need from you

1. **Mobile scope.** The Expo app cannot be run or measured in this environment. I propose Stage 4 applies web changes fully and mobile changes only for items marked **[M]**, which are verified by unit/component tests and reading, and **explicitly reported as unmeasured** until you run them on a device. Alternatively, mobile is deferred. *Default if you don't say: as proposed.*
2. **Dependencies** listed in §7 (camera, haptics, dictation on mobile). Web needs none.
3. **Tap-target sizes** follow D4 (≥48 px, ≥56 px for D1 actions). This raises row/control heights and lowers rows-per-screen; I offset it with grouping, filter chips and hiding the two-row header (P-N3, P-B4). If you prefer to hold density at today's 9 rows/screen for lists, say so and I will use 48 px rows only on touch devices.
4. **Data-model gaps** that need new API routes (see P-D5, P-D3): a "my work" query and a next/previous-sibling query. Both are read-only additions.

---

## 2. Phase A — Tokens (global)

### A1 · Touch-target, spacing, type and glove-mode tokens — **P0**
- **Evidence:** E§8 (917/925 targets <44 px; 172 <24 px); C§4.1; D4.
- **Cost removed:** mis-taps (~2–4 s each) and wrong bulk selections.
- **Change:** in `apps/web/tailwind.config.ts` + `app/globals.css` define `--hit-min: 48px`, `--hit-task: 56px`, `--gap-hit: 8px`, a spacing scale, a type scale with a `--type-step` variable, and `[data-glove="on"]` that multiplies `--hit-*` by 1.25 and bumps `--type-step` one step. Tailwind utilities `min-h-hit`, `min-w-hit`, `min-h-task`, `gap-hit`. No hard-coded px in components after this.
- **Files:** `tailwind.config.ts`, `app/globals.css`, `lib/prefs.ts` (new; localStorage `siteops.prefs`).
- **Effort:** 6 h. **Verify:** re-run `03-sweep` touch sweep; unit test that tokens resolve; screenshot pair at 390 en/ar.
- **Regression risk:** every control grows → layout wraps. Mitigate by landing tokens with no consumers first (no visual change), then adopt per component (B-items).
- **Rollback:** revert the token commit; consumers fall back to existing classes.

### A2 · Contrast-checked colour tokens (sunlight) — **P0**
- **Evidence:** E§9 (106 nodes <4.5:1; avatar "SH" 2.88:1 on 36 screens; placeholders 3.57:1; secondary labels 3–6:1); C§4.2; D4 (≥7:1 primary text & interactive labels).
- **Change:** replace the orange-on-white/white-on-orange pairs and the blue-grey placeholder/secondary tokens with tokens that meet ≥7:1 against their real backgrounds (ink on orange instead of white on orange; darker placeholder). Add `scripts/check-contrast.mjs` that renders the token matrix and fails CI below 7:1 for the "primary" and "interactive" roles. Disabled state exempt but ≥3:1.
- **Files:** `tailwind.config.ts`, `globals.css`, `components/shell/UserMenu.tsx`, `NotificationBell.tsx`, `ui/FilterBar.tsx`, `ui/SavedViewsBar.tsx`.
- **Effort:** 5 h. **Verify:** `03-sweep` contrast sweep on screenshots (not tokens) — target 0 nodes <7:1 for primary/interactive text; screenshot pair.
- **Risk:** brand look shifts slightly (orange buttons get dark text). Authorised only to the extent needed for the ratio. **Rollback:** token file revert.

### A3 · Format tokens: dates, numbers, enums, direction — **P1**
- **Evidence:** E§12, C§6.1–6.4, C§3.5 (ISO title on daily log, raw `ready_for_review`, "1 change orders", Western digits and `mm/dd/yyyy` in Arabic).
- **Change:** one `lib/format.ts` (`formatDate`, `formatDateTime`, `formatNumber`, `formatCount(n, key)` using ICU plurals, `enumLabel(module, value)` backed by i18n keys) and a `<Bidi>`/`dir="auto"` wrapper for user-generated text and record numbers (`<bdi dir="ltr">PL-0042</bdi>`). All screens must call these; lint rule bans `toISOString()`/`toLocaleDateString()` in `app/`.
- **Files:** `lib/format.ts` (new), `messages/en.json`/`ar.json` (enum + plural keys), then the call sites in E-items.
- **Effort:** 10 h. **Verify:** unit tests for both locales; sweep shows 0 raw enums (`grep` test) ; screenshot pair ar.
- **Risk:** Arabic-Indic vs Western numerals is a product choice — **default: Western digits with Arabic text** (matches site practice for sheet/RFI numbers); flagged for your confirmation. **Rollback:** call sites are the only consumers.

## 3. Phase B — Shared components (global)

### B1 · List shell: mobile-first rows, sticky header, sticky selection — **P0**
- **Evidence:** E§5 (status column off-screen; 9/18 rows above fold; first row at ~460 px), E§8, C§3.1, C§4.1.
- **Change:** `components/ui/DataTable.tsx` gains a `layout="card"` mode below 640 px: each row shows Number, primary text, and up to two "key fields" (status badge + due date/assignee) on two lines, ≥56 px tall, checkbox replaced by a 48 px leading select-target. Columns menu stays for ≥640 px. Every page passes `keyFields` (added to its column definitions).
- **Files:** `ui/DataTable.tsx`, all ~20 `page.tsx` list consumers (one-line prop each).
- **Effort:** 14 h. **Verify:** density audit (rows above fold must not fall below today's 9 on punch list because groups + chips replace the save-view bar, see B3/B4); touch sweep; screenshot pair; unit tests.
- **Risk:** highest-traffic component. **Rollback:** `layout="table"` remains and is the fallback; feature flag `ux.cardRows` in `lib/prefs.ts`.

### B2 · Grouping engine (group-by, sticky headers, collapse, persistence, lazy hierarchy) — **P1**
- **Evidence:** C§3.2 (no grouping anywhere; D6), E§5.
- **Change:** `components/ui/GroupedList.tsx` layered on `DataTable`: group-by control (module supplies options: location, trade, company, assignee, status, due bucket, discipline, spec section, cost code), sticky group header with name + count + aggregate (overdue/total/percent) that stays visible collapsed, collapse-all/expand-all, default collapsed when >6 groups; collapse state persisted per user/list/project in IndexedDB (`lib/list-state.ts`) and restored on return and restart; grouping stored inside the existing **Saved views** payload (group-by + filters + sort + collapse). Location/WBS hierarchical: API returns child counts and lazy-loads children (new `GET …/groups?by=location&parent=` endpoints). Virtualisation keeps a scroll anchor across expand/collapse.
- **Files:** `ui/GroupedList.tsx`, `lib/list-state.ts`, `hooks/useServerTable.ts`, `ui/SavedViewsBar.tsx`, API `list-query` shared schema (`packages/shared`), `apps/api/src/services/*list*` for punch items, RFIs, submittals, inspections, drawings, documents, daily logs, schedule (start with punch list + RFIs).
- **Effort:** 40 h (engine 16, API grouping 16, adopt in 8 lists 8). **Verify:** unit tests; 5,000-row perf test (anchor stable, no long task >50 ms on emulated phone); E2E "collapse floor 3, reload, still collapsed"; screenshot pair.
- **Risk:** query contract changes. Additive `groupBy` param only; existing callers unchanged. **Rollback:** grouping off by default per module via flag.

### B3 · Filter chips + visible active state — **P1**
- **Evidence:** C§3.3, D7; E§5 (save-view bar consumes ~100 px above every list).
- **Change:** replace the always-visible "View name / Save view" bar with a collapsed "Views" control; add a chip row (one-tap-removable chip per active filter/group/search) directly under the search; add person and location filters where the API supports them (assignee, location, due bucket).
- **Files:** `ui/FilterBar.tsx`, `ui/SavedViewsBar.tsx`, `hooks/useServerTable.ts`.
- **Effort:** 12 h. **Verify:** density (recovers ~80 px, offsetting B1); E2E "remove chip → list widens"; screenshot pair.
- **Risk:** low. **Rollback:** component-level revert.

### B4 · Header: single row, ≥48 px targets, persistent project chip — **P0**
- **Evidence:** E§5 (97 px two-row header), E§8, C§2.5.
- **Change:** `Header.tsx`/`AppShell.tsx`: on <768 px, one 56 px row — project switcher (full width chip with module name beneath), avatar; language toggle and notifications move into the avatar menu (single 48 px target each inside). Sticky.
- **Files:** `components/Header.tsx`, `shell/ProjectSelector.tsx`, `LanguageToggle.tsx`, `NotificationBell.tsx`, `UserMenu.tsx`.
- **Effort:** 10 h. **Verify:** header height 97→56 px in sweep; touch sweep; screenshot pair en/ar.
- **Risk:** language switch becomes 2 taps (was 1). Mitigation: it is a rarely used control; the D0 guard says "same user, same screen" — I propose keeping a 48 px language toggle in the header for Arabic/English users (decision welcome; default keeps it).
- **Rollback:** flag `ux.compactHeader`.

### B5 · Record header + onward actions + sibling navigation — **P0**
- **Evidence:** E§1 (18/18 detail screens no sibling; 2 dead ends), C§2.3, C§2.4.
- **Change:** `components/ui/RecordHeader.tsx`: back (to the *preserved* list state), breadcrumb/“back to PL-0042” when arrived from another record, prev/next arrows with position ("12 of 40") using the list's current filter/sort, and a primary next-action button slot. Adopt on the 18 detail screens.
- **Files:** `ui/RecordHeader.tsx` (new), `lib/nav-stack.ts` (C-items), 18 detail `page.tsx`, API `GET …/:id/siblings?…` (read-only) for punch items, RFIs, submittals, drawings, inspections, daily logs first.
- **Effort:** 22 h. **Verify:** interaction-count test: walk 30 snags = 31 taps (was 60); dead-end count 0 in inventory script.
- **Risk:** medium. **Rollback:** header falls back to current "Back" link.

### B6 · State components: skeleton, empty-with-action, error-with-retry, offline banner — **P0**
- **Evidence:** E§10 (15/20 no loading indicator; 5 no retry; C§5.3–5.4), E§11.
- **Change:** `LoadingState` becomes a zero-latency skeleton sized to the list layout (no spinner); `ErrorState` always has Retry and never prints a code (maps `code` → i18n message); `EmptyState` always renders the primary create action; new `OfflineBanner` + per-list "showing saved data, last synced 10:42" line.
- **Files:** `ui/LoadingState.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, `shell/OfflineBanner.tsx` (new), the ~20 list pages (replace bespoke states), 9 `unknown_error` call sites.
- **Effort:** 14 h. **Verify:** re-run `04-states-offline`: loading 20/20, retry 20/20, raw codes 0; screenshot pairs.
- **Risk:** low. **Rollback:** per-page revert.

### B7 · Form shell: sticky bottom action bar, draft restore, create-another — **P0**
- **Evidence:** C§4.3, C§4.5, D4, D7; E§4 (Create/Save at page top/mid-form).
- **Change:** `components/ui/FormShell.tsx`: primary actions in a bottom bar (56 px, thumb zone), destructive actions separated ≥8 px and never in the bar, **drafts persisted to IndexedDB on every change and restored after reload/kill** (including attached photos as blobs), "Save and add another" retaining context (D7), voice-dictation button on every textarea (Web Speech API; Arabic `ar-JO`), `navigator.vibrate` haptic on success.
- **Files:** `ui/FormShell.tsx` (new), `lib/drafts.ts` (new), `ui/VoiceField.tsx` (new), forms on punch new, daily-log new, RFI, inspection, submittal, meeting, safety.
- **Effort:** 26 h. **Verify:** E2E "type → reload → text and photo restored"; tap-count tests; glove-mode screenshot.
- **Risk:** medium (form logic). Web Speech API is unavailable in some browsers → the button is hidden when unsupported. **Rollback:** forms keep current markup behind `ux.formShell`.

### B8 · Camera-first capture + create sheet — **P0**
- **Evidence:** T1/T2/T8; C§4.4; D4, D5.
- **Change:** `components/ui/CaptureButton.tsx` using `<input type=file accept="image/*" capture="environment">` (no dependency) that opens the camera directly, downsizes, stores the blob locally (B7), and attaches on sync. `CreateSheet.tsx`: global "+" (bottom bar) listing record types the user can create, ordered by that user's own frequency (counted locally), each opening its form with context prefilled; a "photo first" path creates a snag from a photo in 2 taps.
- **Files:** `ui/CaptureButton.tsx`, `ui/CreateSheet.tsx`, `lib/usage.ts`, `lib/upload.ts`.
- **Effort:** 16 h. **Verify:** T1 with camera-first path measured (target ≤6 taps incl. photo + location + assignee once B7/E1 land); screenshot pair.
- **Risk:** iOS/Android behave differently for `capture`; verified in Playwright only for the input wiring. **Rollback:** button reverts to file picker.

### B9 · Bulk operations: selection that survives scroll/collapse, assign/status/due/distribution — **P1**
- **Evidence:** T10 (impossible), C§1.6; D7. Existing: status-only bulk bar (`ui/BulkActionsBar.tsx`) on 4 lists.
- **Change:** selection store keyed by record id (survives virtualization and groups; "select group"), bulk bar with Assign, Status, Due date, Distribution, Export; API bulk endpoints per module (extend existing `*/bulk-transition` pattern with `bulk-update`).
- **Files:** `ui/BulkActionsBar.tsx`, `ui/DataTable.tsx` selection, `packages/shared` bulk schemas, `apps/api` services for punch items, RFIs, submittals, change orders.
- **Effort:** 24 h. **Verify:** T10 measured (target ≤8 taps for 10 snags); 5,000-row selection test.
- **Risk:** bulk writes need permission and audit-log checks (reuse existing bulk-transition tests). **Rollback:** endpoint-level flags.

## 4. Phase C — Navigation shell (global; isolated behind `ux.shell` flag)

### C1 · Mobile bottom navigation + correct landing — **P0**
- **Evidence:** T-tax of 3 taps (C§1.2), C§2.1, C§2.6, D5.
- **Change:** `shell/BottomNav.tsx` (≤5): **My Work · Capture (+) · Project · Drawings · More**; picking a project lands on My Work (not Directory); the sidebar remains the ≥768 px pattern. "More" holds the remaining modules with the current group order.
- **Files:** `shell/BottomNav.tsx` (new), `shell/AppShell.tsx`, `app/[locale]/projects/page.tsx` (card links to My Work, not directory), `app/[locale]/page.tsx` (redirect to last project's My Work).
- **Effort:** 14 h. **Verify:** T3, T4, T8 re-measured (module reach 3→1 tap); inventory shows 0 shell-only modules unreachable by ≤2 taps.
- **Risk:** **highest** — every route's chrome changes. **Rollback:** flag off restores current shell; keep the old `ProjectSidebar` path intact for one release.

### C2 · Project switcher retaining screen type — **P1** (already met on web: T9 = 2 taps)
- **Evidence:** T9 passes on web; mobile lacks one (**[M]**).
- **Change:** web: keep as is, add persistence of last project. **[M]** add a header switcher that preserves screen type.
- **Effort:** 2 h web, 6 h mobile. **Verify:** T9 test stays ≤3.

### C3 · Back-stack, scroll and state restoration — **P0**
- **Evidence:** C§2.2; D5.
- **Change:** `lib/nav-stack.ts` records for each list: scroll anchor (row id + offset), filters, search, tab, group/collapse state (B2 store); `RecordHeader` back restores it. Cross-module: opening a drawing from a snag pushes a frame; back shows "Back to PL-0042". Modal and filter state written to URL search params so browser-back behaves.
- **Files:** `lib/nav-stack.ts`, `hooks/useServerTable.ts` (URL sync), `ui/DataTable.tsx` (anchor restore), `ui/Modal.tsx`, `RecordHeader`.
- **Effort:** 22 h. **Verify:** E2E "scroll to row 200, open, back → row 200 visible"; browser-back test with filters/modal.
- **Risk:** URL-sync can create history noise; use `replaceState` for filter changes. **Rollback:** restoration off, back = current.

### C4 · Deep links, rows as links, recents — **P1**
- **Evidence:** E§12 (rows are `div role=row`), D5.
- **Change:** rows render an anchor (whole-row `<a>` overlay) so long-press/new-tab work; unauthenticated visit to a record URL goes to login then returns (`?next=`); `shell/Recents.tsx` — last 10 records, one tap from the avatar menu and My Work.
- **Files:** `ui/DataTable.tsx`, `login/page.tsx`, `lib/recents.ts`, `middleware`/auth guard.
- **Effort:** 12 h. **Verify:** E2E deep-link → login → record; row is `<a href>`.
- **Risk:** row-click and checkbox interplay; keep checkbox stopPropagation. **Rollback:** row handler retained.

### C5 · Command palette (desktop) and global search on phone — **P1**
- **Evidence:** E§4 (search absent at 390 px), D5.
- **Change:** Cmd/Ctrl-K palette (jump to record/screen/create action; search by number, title, location; partial sheet numbers, no-prefix numbers, Arabic without diacritics) extending existing `GlobalSearch`; search icon in the header on phones opening the same palette full-screen.
- **Files:** `shell/GlobalSearch.tsx`, `apps/api/src/services/search.service.ts` (normalisation), `shared/normalize.ts`.
- **Effort:** 16 h. **Verify:** search tests ("401" finds E-401; Arabic diacritics); T4 re-measured (target ≤4: My Work → Drawings tab → search focus → tap = 4).
- **Risk:** low. **Rollback:** palette feature-flagged.

## 5. Phase D — Offline & local-first (web, global)

### D1 · Service worker + app-shell cache — **P0**
- **Evidence:** E§11 (36/36 cold-offline failures; no SW).
- **Change:** hand-written service worker (no dependency) caching the built shell, static assets and last-seen GET responses for the D1 modules; navigation requests offline fall back to the cached shell.
- **Files:** `public/sw.js`, `app/[locale]/layout.tsx` registration, `next.config.mjs` headers.
- **Effort:** 14 h. **Verify:** `04b-offline-all` cold-offline: browser error page 36→0; E2E with `context.setOffline`.
- **Risk:** stale-shell bugs after deploys. Versioned cache + skip-waiting prompt. **Rollback:** unregister via a kill-switch route that serves `sw.js` as a self-unregistering script.

### D2 · Local write queue (outbox) for create/edit — **P0**
- **Evidence:** T1, T2, T6 offline (all ❌); C§5.1; D7 "never block a form on the network".
- **Change:** IndexedDB outbox (`lib/outbox.ts`) mirroring the mobile pattern: creates/edits write locally, render immediately (optimistic), sync in the background with idempotency keys; conflicts surface via the existing `needs_review`/`conflict_data` API fields; visible sync indicator (`shell/SyncStatus.tsx`: online/offline, pending count, last sync, error with retry); rollback is explained in a toast that names the record. First adoption: punch items (+photos), daily log entries, RFI responses, inspections.
- **Files:** `lib/outbox.ts`, `lib/api-client.ts`, `shell/SyncStatus.tsx`, punch/daily-log/RFI/inspection pages, reuse `apps/api` sync endpoints (`/sync/push`, `/sync/pull`).
- **Effort:** 40 h. **Verify:** E2E for D10 field item 4: create snag offline, reconnect, record synced intact incl. photo; T6 offline create/send.
- **Risk:** highest data risk. Server stays source of truth; every outbox item carries `clientId`; dry-run mode logs without sending in the first release. **Rollback:** disable outbox flag → forms call the API directly (today's behaviour).

### D3 · Truthful failures: search errors are not "no results" — **P0**
- **Evidence:** E§11 (daily-log, directory show "No … match your search" offline), blank content area on 6 screens.
- **Change:** `useServerTable` distinguishes error from empty; on navigation failure `loading.tsx`/`error.tsx` render B6 states; layouts never render an empty `<main>`.
- **Files:** `hooks/useServerTable.ts`, `app/[locale]/**/error.tsx`, `loading.tsx`, `directory/page.tsx`, `daily-log/page.tsx`.
- **Effort:** 8 h. **Verify:** `04b` P0 count 6→0, misleading-empty 2→0.
- **Risk:** low.

## 6. Phase E — Screens (local, consuming A–D)

| ID | Tier | Screen | Change | Evidence | Files | h | Verify |
|---|---|---|---|---|---|---|---|
| **E1** | **P0** | Punch item create/detail | Add location (hierarchical picker, remembers last), assignee/company/trade, photo via B8; "same location as last" default; create-another | T1, T2, C§1.1 | `punch-list/new/page.tsx`, `[itemId]/page.tsx`, `PersonnelPicker.tsx`, new `LocationPicker.tsx`; API already accepts fields | 20 | T1 ≤6 taps; T2 ≤4; screenshots |
| **E2** | **P0** | Punch list | Assignee/location/due filters + group-by (B2), key fields, swipe actions (assign, close) | T7, T10, C§3 | `punch-list/page.tsx` | 8 | T7/T10 tests |
| **E3** | **P1** | Punch status | Single "Close out" action with photo prompt collapsing 3 presses into one when the user is the final approver | T8 (9 vs 5) | `[itemId]/page.tsx`, API transition unchanged (client chains valid transitions) | 8 | T8 ≤5 |
| **E4** | **P0** | Daily log | Manpower/equipment/delays entry (API tables exist), today's log opens from My Work, humane titles | T5, C§1.1, E§12 | `daily-log/[logId]/page.tsx`, `new/page.tsx`, API routes exist? — adds if absent | 22 | T5 ≤5 |
| **E5** | **P0** | **My Work** (new) | Cross-module “assigned to me / due today / overdue” list grouped by module and due bucket; default landing; one tap from bottom nav | T7 (impossible), C§2.6 | `app/[locale]/projects/[id]/my-work/page.tsx`, API `GET /projects/:id/my-work` | 16 | T7 ≤2 taps ≤10 s |
| **E6** | **P1** | RFI | "Mine" chip preset (1 tap, not select+choose), answer inline from list, next-in-my-court after submit | T6 (8 vs 4) | `rfis/page.tsx`, `[rfiId]/page.tsx` | 10 | T6 ≤4 |
| **E7** | **P1** | Drawings | Search-first landing on the tab, sheet-number normalisation (C5), recent sheets | T4 (5 vs 4) | `drawings/page.tsx` | 6 | T4 ≤4 |
| **E8** | **P1** | Photos | Real thumbnails (signed URLs, lazy), grouped by date/location | E§12 | `photos/page.tsx` | 8 | screenshot pair |
| **E9** | **P0** | Permissions | Fix overlapping grid; single-column list of module × level | E§5 (overlap, 425 px) | `permissions/page.tsx` | 6 | overflow script 0 |
| **E10** | **P0** | Gantt | Constrain toolbar and timeline to the viewport (horizontal scroll only inside the chart) | E§5 (711 px) | `gantt/page.tsx`, `components/gantt/*` | 8 | overflow 0 |
| **E11** | **P1** | Dashboard | Personal “Action required” linking to the item, humane counts/enums (A3) | C§3.5–3.6 | `dashboard/page.tsx` | 6 | screenshot pair |
| **E12** | **P2** | Change orders, companies, settings | Adopt shared states/format tokens; split Change events/orders into tabs | C§7.1 | three pages | 8 | screenshot pair |
| **E13** | **P0** | Clipped controls (12 lists, 19 screens) | Resolved by B3 (Views collapsed) — verify only | E§5 | — | 2 | overflow/clipped = 0 |

Mobile **[M]** counterparts (unmeasured here): punch new (location/assignee/photo via `expo-image-picker`), RFI respond, daily-log manpower, project switcher, RTL enable (`I18nManager.allowRTL/forceRTL`) — 40 h total, listed as M1–M5 in §9.

## 7. Dependency requests (need your explicit yes)

| Need | Candidate | Bundle cost | Licence | RTL |
|---|---|---|---|---|
| Web camera, voice, haptics, SW, IndexedDB | **None** (browser APIs: `capture`, Web Speech, `vibrate`, hand-written SW, raw IndexedDB) | 0 kB | — | — |
| Mobile camera/photo | `expo-image-picker` (Expo SDK 52 compatible) | native, ~0 JS | MIT | n/a |
| Mobile haptics | `expo-haptics` | native | MIT | n/a |
| Mobile dictation | `expo-speech-recognition` community module (Arabic supported by OS engines) | native | MIT | n/a |

## 8. Cross-cutting: glove mode, tests and gates

### G1 · Glove-mode toggle — **P1**
Settings switch (avatar menu) sets `data-glove="on"` (A1): targets ×1.25, font +1 step, persisted. **Effort 4 h.** Verify: sweep at glove mode: every target ≥60 px.

### G2 · Interaction-count E2E for every D1 task — **P0 (gate)**
`e2e/d1-tasks.spec.ts` (Playwright) asserting tap counts via an `interaction-counter` test helper (tap/long-press/swipe/focus) — same rule as Stage 1 — for T1–T10, in `en` and `ar`, failing CI if a count exceeds its budget. **Effort 14 h.**

### G3 · Audit re-run & gate report — **P0 (gate)**
Re-run scripts `02`–`07`, generate `AUDIT_RESULTS.md` with before/after per task (EN/AR), per 100 records time saved, remaining failures, screenshot pairs, and the field checklist (one-handed, glove/stylus, sunlight, airplane-mode T1, Arabic T1/T7). Physical-device steps are performed by you or reported as **not performed**. **Effort 12 h.**

## 9. Effort, order and totals

| Order | Items | Tier | Hours |
|---|---|---|---|
| 1 | A1, A2, A3 | P0/P0/P1 | 21 |
| 2 | B6, B4, B7, B8 | P0 | 66 |
| 3 | B1, B3, B5 | P0/P1/P0 | 48 |
| 4 | D1, D3, D2 | P0 | 62 |
| 5 | C1, C3, C4, C2 | P0/P0/P1/P1 | 50 |
| 6 | E1, E4, E5, E9, E10, E13 | P0 | 74 |
| 7 | B2, B9, C5, E2, E3, E6, E7, E8, E11, G1 | P1 | 136 |
| 8 | E12 | P2 | 8 |
| 9 | G2, G3 | gate | 26 |
| **Total web** | | | **≈ 491 h** |
| Mobile **[M1–M5]** (unmeasured) | | | ≈ 40 h |

If time-boxed, the first six rows (≈ 320 h) deliver all P0s: fields and screens that make T1, T2, T5, T7 completable, offline, targets/contrast, and navigation context. Rows 7–8 are the P1/P2 tail.

**Expected movement on the D1 budgets (predictions, to be replaced by measurements in Stage 4):**

| Task | Now | Target | Delivered by |
|---|---|---|---|
| T1 | 8 (partial) | ≤6, offline | A–B7/B8, D2, E1, C1 |
| T2 | 4 (partial) | ≤4 | E1, B7 |
| T3 | 5 | ≤6 | C1 (→3) |
| T4 | 5 | ≤4 | C1, C5, E7 |
| T5 | 4 (partial) | ≤5 | E4, C1 |
| T6 | 8 | ≤4 offline | E6, D2 |
| T7 | impossible | ≤2 | E5, C1 |
| T8 | 9 | ≤5 | E3, C1, B8 |
| T9 | 2 | ≤3 | keep (G2 guards it) |
| T10 | impossible | ≤8 | B9, E2 |

## 10. Regression-risk and rollback summary

| Change | Risk | Rollback |
|---|---|---|
| Tokens (A) | Layout wrapping | Land consumer-less first; revert token commit |
| DataTable card rows (B1) | Highest-traffic component | `ux.cardRows` flag; table mode retained |
| Header/shell (B4, C1) | Every route | `ux.compactHeader`, `ux.shell` flags; old sidebar kept one release |
| Grouping (B2) | Query contract | Additive `groupBy`; per-module flag |
| Outbox (D2) | Data integrity | Idempotency keys; dry-run first; disable flag → direct API |
| Service worker (D1) | Stale shell | Versioned cache; self-unregister kill switch |
| Back-stack/URL sync (C3) | History noise | `replaceState`; restoration flag |

Feature flags live in `lib/prefs.ts` (`localStorage`), default **on** in Stage 4 builds and flippable by a query param for QA.

## 11. What this plan deliberately does not do

- No colour/type redesign beyond contrast-driven token changes.
- No animation (skeletons only; no transitions added).
- No component-library swap; `DataTable`, `FilterBar` etc. are extended, not replaced.
- No density trade: card rows are ≥56 px, but header (−41 px), Views bar (−~80 px) and chips/groups are expected to keep punch-list rows above the fold ≥ 9; B1's verification step fails the item if it does not.

*Stopping here. Stage 4 begins only after you approve this plan (and answer §1).*
