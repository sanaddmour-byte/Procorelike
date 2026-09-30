# Audit results — after remediation (Stage 4 · Fix)

> Companion to [`TASK_BENCHMARKS.md`](./TASK_BENCHMARKS.md) and [`AUDIT_EVIDENCE.md`](./AUDIT_EVIDENCE.md) (Stage 1, "before"), [`CRITIQUE.md`](./CRITIQUE.md) (Stage 2) and [`REMEDIATION_PLAN.md`](./REMEDIATION_PLAN.md) (Stage 3).
> **Read this first:** Stage 4 is **partly complete**. Everything below labelled *Measured* was run against a production build (`next build && next start`) of `apps/web`, the Express API and the same seeded PostgreSQL snapshot as Stage 1, with the same scripts and rules. What was **not** built or **not** measured is listed explicitly in §6 and §7 — nothing there is estimated or implied.

## 1. What "measured" means here

| Label | Meaning |
|---|---|
| **Measured** | Executed by a scripted Chromium session, 390 × 844, DPR 2, touch, cold open, DB restored to the pristine snapshot before each run. Scripts: `docs/ux/measure/09-tasks-after.mjs` (tasks), `03-sweep.mjs metrics`, `04b-offline-all.mjs`, `05-perf.mjs`, `07-overflow.mjs`. Raw output: `docs/ux/data/after/*.json`. |
| **Modelled** | Human time = `1.0 s × taps + 1.2 s × screen changes + 0.35 s × characters + machine time` (keystroke-level estimate, **not** measured with people). |
| **Emulated** | CDP CPU ×4 + 150 ms RTT / 1.6 Mbps throttling. Not a real device. |
| **Not performed** | Anything needing a physical phone, gloves, sunlight, or a real signal drop. See §8. |

Tap rule (unchanged from Stage 1): tap / long-press / swipe / field focus = 1; native `<select>` = 2; file picker = 2; typing counts characters, not taps.
**Returning user:** the tasks below assume the app remembers the last project (as a phone that has been used once does), so it opens on **My Work**. A first-ever launch costs **+1 tap** (Open project).

## 2. The ten field tasks — before / after (Measured, web)

English and Arabic gave identical tap counts and outcomes for every task.

| Task | Target taps | Before (EN / AR) | After (EN / AR) | Completable before → after |
|---|---|---|---|---|
| T1 Create a snag with photo, location, assignee | ≤ 6 | 8 partial / 8 partial | **8** / **8** | no → **yes** — **still over budget by 2** |
| T2 Next snag, same location | ≤ 4 | 4 partial | **3** | no → yes (location + assignee carry over) |
| T3 Raise a work-inspection request | ≤ 6 | 5 | **3** | yes → yes |
| T4 Find a drawing by sheet number | ≤ 4 | 5 | **3** | yes → yes |
| T5 Open today's daily log and add manpower | ≤ 5 | 4 partial (nowhere to add manpower) | **8** first use · **4** repeat use | no → yes; first use is over budget, repeat use within it |
| T6 Answer an RFI assigned to me | ≤ 4 | 8 | **3** | yes → yes |
| T7 Everything assigned to me, due today, across modules | ≤ 2 | 9 partial (no such screen) | **0** (landing screen) | no → yes |
| T8 Close out a snag with an "after" photo | ≤ 5 | 9 | **4** | yes → yes |
| T9 Switch project, land on the same screen type | ≤ 3 | 2 | **2** | yes → yes (unchanged) |
| T10 Bulk-assign snags to one person | ≤ 8 | 4 partial (no assignment possible) | **7** | no → **yes** |

Notes that matter:
- **T1 misses its budget.** Photo (2) + location (2) + "Me" (1) + open FAB and sheet (2) + save (1) = 8. Same-as-last defaults only help from the second snag onward (T2 = 3). Getting to 6 needs a design decision (e.g. capture-first from a long-press on the FAB, or optional location on first save) that the plan did not include; I did not invent one.
- **T5 first use = 8** because a company and a trade are two native selects. The crew is remembered per project afterwards (repeat = 4).
- **T10** selected every snag on the page in one action (42 in the audit data — the page size is 50), not 10; the count of taps does not grow with the number of rows.
- Before-numbers for tasks that were "partial" are taps to the furthest point reachable, so they are **not comparable** with the after-numbers of a completed task. The "Completable" column is the honest comparison.
- Machine times after are 0.1–4.9 s on localhost (T8 is the slowest because it uploads a photo and walks the status chain); modelled human times are in `docs/ux/data/after/tasks-after-*.json`. Neither is a field measurement.

## 3. Sweeps re-run (Measured)

| Sweep | Before | After | Remaining |
|---|---|---|---|
| Horizontal overflow at 360/390 px, EN+AR, 36 screens (144 combinations) | **34** overflow | **0** | none |
| Touch targets < 44 × 44 px (390 px, per language) | **917** of 925 | **18** of 1029 | Company pages (5), Settings (5), a few 20 px links and hidden 1×1 file inputs — listed in `after/sweep-metrics.json` |
| Text contrast failures (WCAG AA, sampled) | 106 of 1068 | **28** of 1341 (EN) · 26 of 1386 (AR) | Mostly **disabled** controls (Add row, pagination ‹ ›, "Upload logo"); a handful of real ones remain — see backlog |
| Screens that go **blank** when a request fails offline | **6** of 36 | **0** | — |
| Screens stuck on a spinner / "Loading" with no error offline | 0 | 0 | — |
| Offline: screens that show an error with a Retry button | 15 | 22 | — |
| Header height (px) | 97 | **57** | — |
| Punch list rows above the fold | 9 | 8 | **Not improved.** Cards are 60 px and show status; the shorter header did not translate into more rows. RFIs went 8 → 6. Reported as measured. |
| Dark-mode identical-to-light | 0 | 0 | — |

Other regressions I found **while testing** and fixed: two nested `<main>` landmarks on every project page; a projects-list page that lost its side gutter after a padding pass; a silent `/companies` permission failure that left the daily-log company picker empty for a superintendent; a Gantt toolbar and Permissions grid that pushed the page wider than the phone.

## 4. Performance (Measured local · Emulated mid-phone)

Interaction latency to first feedback is unchanged within noise (≈ 10–50 ms local, 15–260 ms emulated). JS transferred per screen grew by 5–7 KB (170 → 177 KB on the punch list).

**One number got worse and I have not fixed it:** on the emulated phone, Largest Contentful Paint on the punch list is **2.96 s (was 0.59 s)**, RFIs 2.85 s (was 0.59 s); the dashboard is unchanged (2.32 → 2.34 s). First Contentful Paint is roughly unchanged (0.59 → 0.63 s). Probable cause (a hypothesis, not tested): before, the paint that counted as LCP was the "Loading…" text; now loading shows skeleton bars with no text, so LCP is the first real content, which waits on 8–10 API calls at 150 ms RTT. Either way, the lists render their real content later than the Stage 1 figure suggests is "fast". Reducing the number of chained requests per screen is in the backlog.

## 5. What shipped, by plan item

| Plan item | Status | Where |
|---|---|---|
| A1 targets / glove mode / A2 contrast / A3 formats | **Done** (residuals in §3) | `globals.css`, `tailwind.config.ts`, `lib/format.ts` (+tests), `Ltr`, `use-enum-label` |
| B1 photo-first capture · B3 assignee · B4 dictation · B7 drafts | **Done** | `CaptureButton`, `VoiceField`, `FormShell`, `lib/drafts.ts` |
| B6 error / loading states | **Done** — 48 pages use one error box with Retry; offline says "No connection", not "Something went wrong" | `ErrorState`, `LoadingState`, `lib/error-message.ts` |
| B8 compact rows · saved-views bar | **Done** | `DataTable`, `SavedViewsBar`, `FilterBar` |
| B9 bulk operations | **Partly** — assign (API + UI + API tests). Bulk due-date / distribution are in the API only; no UI. | `BulkAssign`, `POST /punch-items/bulk-update` |
| C1 bottom nav · C2 last project · create sheet | **Done** | `BottomNav`, `CreateSheet`, `lib/last-project.ts` |
| D1 service worker · D2 outbox · D3 truthful failures | **Done for snags**; service worker caches the shell and visited pages (production only). Other record types are **not** queued offline. | `public/sw.js`, `lib/outbox.ts`, `SyncStatus` |
| E1 location · E3 close-out · E4 manpower · E5 My Work | **Done** | `LocationPicker`, snag detail, `ManpowerEditor`, `my-work/page.tsx` |
| E9 permissions layout · E10 Gantt overflow | **Done** | see §3 |
| G1 glove mode | **Done** (toggle in the avatar menu) | `PrefsApplier` |
| G2 interaction-count tests | **Done** — 10 Playwright tests (EN+AR) enforcing budgets for T3, T4, T7, T9 and the offline queue; existing 12 E2E tests updated for the new UI | `apps/web/e2e/field-taps.spec.ts` |

Test state at the end: web typecheck, lint and unit tests pass; **22 of 22** Playwright tests pass against the production build; the API test file for bulk actions passes (6 tests, including 2 new). I did **not** re-run the complete API test suite in this stretch.

Eight existing E2E tests failed after the UI changes and I updated them. Six were caused by this work's intentional changes (search boxes now have an accessible name that substring-matches "Title/Subject/Description"; Priority is three chips instead of a select; Log out is inside the avatar menu; the signed-out landing is `/login`; the snag status buttons are labelled by status). Two were already stale from earlier phases, not from this work: correspondence has needed a typed signature to send since Phase 12, and the RFI status text is split across elements. I updated all of them rather than leave them red.

## 6. Not built (backlog, in plan order)

B2 grouping engine · B5 record header with previous/next · C3 back-stack and scroll/URL-state restore · C4 rows as links, recents, deep-link-after-login · C5 command palette and phone search · E2 punch-list filters/group/swipe · E6 RFI "mine" preset · E7 drawings search-first · E8 photos thumbnails · E11 dashboard personal actions · E12/E13 polish and clipped-control verification · offline queue for record types other than snags · bulk due-date/distribution UI · reduce request count per screen (LCP, §4) · remaining contrast failures and the 18 small targets (§3).

**Mobile app (Expo), M1–M5:** not started. It cannot be run in this environment, so any mobile change would be unmeasured; new dependencies (`expo-image-picker`, `expo-haptics`, a dictation module) need your explicit yes first.

## 7. Deviations and known issues

- The language toggle is in the avatar menu on phones (visible in the header on desktop) — a deviation from the plan's default; say if you want it back in the header.
- Western digits and `YYYY-MM-DD` dates in both languages (plan defaults).
- `POST /projects` returned a 500 (RLS `42501`) in the audit environment; not investigated. It does not affect the field tasks above.
- The local S3 stand-in stopped at its background time limit, so photo upload and the drawings viewer do not work in this sandbox until it is restarted. The task timings were taken while it was running. **Production still needs a real S3 bucket** for the viewer.
- The dev server was used while building; every number in this document comes from the production build.

## 8. Field-simulation checklist (Not performed)

Nothing below was done by me; these need a person with a phone. Please run them, or tell me the results and I will record them.

| Step | Status |
|---|---|
| Glove test (thick work gloves, glove mode on/off): create a snag, use the bottom nav and the create sheet | **Not performed** |
| Sunlight test (outdoors, max brightness): read status badges, contrast on cards and My Work | **Not performed** |
| One-handed thumb reach: FAB, Save & add another, bulk-assign bar | **Not performed** |
| Real signal loss (airplane mode mid-form, then reconnect): snag queued, banner shown, sent on reconnect, photos intact | **Not performed** on a device (simulated with the browser's offline switch in the E2E test) |
| Phone camera capture (`<input capture>`) on iOS Safari and Android Chrome | **Not performed** (file input simulated) |
| Voice dictation in English and Arabic on device | **Not performed** (Web Speech API availability varies by browser) |
| Screen reader pass (VoiceOver / TalkBack) on My Work and the snag form | **Not performed** |
| Arabic review by a native reader (wording of the new strings) | **Not performed** |

## 9. Screenshot pairs

Before: `docs/ux/screenshots/<screen>__<lang>-390-light.png` (Stage 1). After: `docs/ux/screenshots/after/<screen>__<lang>-390-light.png` (same names, 36 screens × EN/AR), plus task shots `after/after-task1-form-*`, `after-task7-mywork-*`, `after-task8-done-*`. Good pairs to open first: `punch-list`, `punch-new`, `daily-log-detail`, `rfis`, `dashboard`, `permissions`, `gantt`.

## 10. Reproducing

```
bash docs/ux/measure/reset-db.sh          # restore the audit snapshot
pnpm --filter @siteops/web build && pnpm --filter @siteops/web start
export UX_DATA_DIR=docs/ux/data/after UX_SHOTS_DIR=docs/ux/screenshots/after
node docs/ux/measure/09-tasks-after.mjs en   # and ar
node docs/ux/measure/07-overflow.mjs ; node docs/ux/measure/03-sweep.mjs metrics
node docs/ux/measure/04b-offline-all.mjs ; node docs/ux/measure/05-perf.mjs
pnpm --filter @siteops/web exec playwright test
```
