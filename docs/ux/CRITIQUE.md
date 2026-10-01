# UX critique — Stage 2

> Scores the running app against the seven dimensions of Addendum D3. Every claim cites Stage 1 evidence ([`TASK_BENCHMARKS.md`](./TASK_BENCHMARKS.md), [`AUDIT_EVIDENCE.md`](./AUDIT_EVIDENCE.md)); every failure carries a cost. **No plan and no code here** — that is Stage 3, after approval.
>
> **Scope guard (D0) applied:** the user is standing, gloved, in sunlight, with intermittent signal, doing this 50–200×/day. A failure that adds three taps to a snag costs roughly an hour per week per person.
>
> **Evidence caveat:** web findings are *measured*. Mobile (Expo) findings are *static* (source read, not run) and marked **[static]**. Time costs use the Stage 1 keystroke model and are estimates; tap counts and pixel sizes are measured.

## Scorecard

| Dimension | Score /10 | One-line verdict |
|---|---|---|
| Task efficiency | **2** | 6 of 10 field tasks cannot be completed as specified; the 4 that can are over target on 2 of 4 |
| Navigation | **3** | Every module costs 3 taps from cold; no context preservation; 18 detail screens with no sibling reach |
| Information architecture | **4** | Good module coverage and empty states, but no grouping, no "mine", data hidden off-screen |
| Field ergonomics | **1** | 917 of 925 targets under 44 px; no camera flow; no glove/sunlight consideration |
| Feedback & state | **3** | No offline mode, blank/“no results” failures, raw error codes shown |
| Bilingual / RTL | **4** | Layout mirrors correctly on the web; mixed-direction data, numerals/dates and overflow are unhandled; mobile RTL unverified |
| Consistency | **5** | One solid list component, undermined by bespoke screens and per-screen invented patterns |

---

## 1. Task efficiency — 2/10

**Evidence.** Web, measured, EN = AR ([benchmarks](./TASK_BENCHMARKS.md)):

| Task | Taps vs target | Outcome |
|---|---|---|
| T1 snag + photo + location + assignee | 8 vs ≤6 | **Impossible**: no location or assignee field exists; photo only after creation |
| T2 next snag, same location | 4 vs ≤4 | **Impossible**: no location; form opens blank |
| T3 inspection request | 5 vs ≤6 | OK |
| T4 find drawing by sheet no. | 5 vs ≤4 | Over by 1 |
| T5 daily log + manpower | 4 | **Impossible**: no manpower UI |
| T6 answer assigned RFI | 8 vs ≤4 | Over by 4; not offline |
| T7 my items due today | 9 | **Impossible**: no such screen |
| T8 close snag with photo | 9 vs ≤5 | Over by 4 |
| T9 switch project | 2 vs ≤3 | OK |
| T10 bulk-assign 10 snags | — | **Impossible**: nothing assigns snags |

Only T3 and T9 pass. Mobile **[static]** is faster where it exists (T1 5 taps, T3 4) but omits the same fields, cannot answer an RFI (read-only) and has no project switcher (T9 = 4).

**Failures and cost.**
1. **The fields the tasks depend on do not exist in the UI** although the API accepts them (`locationId`, `assigneeUserId`, `assigneeCompanyId` in `punch-item.schema.ts`; 61 locations sit unused in the DB; `daily_log_manpower` table unused). *Cost:* every snag is created without location/assignee, so the information must be re-entered by voice/WhatsApp or is lost; a snag no one owns is a snag no one closes. This is a data-loss failure, not a tap-count one.
2. **Fixed 3-tap tax to reach any module** (project card → ☰ → sidebar link) on every cold start. *Cost:* 3 of the 8 taps in T1, 3 of 5 in T3, 3 of 9 in T8; at 50 snags/day ≈ 150 taps ≈ 2.5–3 min/day per user.
3. **Closing a snag is 3 status presses** (Ready for review → Approved → Closed) after the photo (T8). *Cost:* +2 taps and +4–6 s per close versus a single "Close out" action; at 30 closes/day ≈ 4 min/day.
4. **Photo is a two-step detour** (create, then open detail, then file picker = +2 taps, +1 screen change). *Cost:* ~4 s and a lost-photo risk per snag; in the field the photo is the first action, not the last.
5. **RFI answer needs a filter to find "mine"** (native select = 2 taps) before opening (1), focusing (1), submitting (1). *Cost:* +2 taps every time the assignee just wants the next RFI waiting on them.
6. **No bulk assignment** (T10). *Cost:* unbounded — the only alternative is open, change, back per record, and there is no assignee control to change, so the work is done outside the tool.

## 2. Navigation — 3/10

**Evidence.** Inventory: 60 web routes, 31 in the sidebar; sidebar hidden below 768 px behind ☰ (22×32 px); project list links only to "View directory"; 15 screens are shell-only; 2 dead ends (`daily-log/[logId]`, `punch-list/[itemId]`); 18 of 18 detail screens lack sibling reach; global search absent from the 390 px header; list rows are `div role=row` handlers, not links; notifications and search results deep-link but there is no deep-link-then-login flow evidenced. Offline sidebar tap leaves the drawer open with no message.

**Failures and cost.**
1. **Landing on Directory after picking a project.** The first screen a superintendent sees after choosing a project is a people list. *Cost:* +2 taps (☰, link) to reach anything work-related, every session.
2. **Zero context preservation.** Detail pages offer a bare "Back to punch list" link; nothing evidences restored scroll, filters or search term. *Cost:* after opening record 187 of 200 and returning, the user re-scrolls/re-filters (~5–10 s and 2–4 taps) — repeated for every snag in a walk-through of a floor.
3. **No sibling navigation** on any of 18 detail screens. *Cost:* walking 30 snags = 30 × (back + open) = 60 taps versus 30 with next/previous.
4. **Rows are not links.** *Cost:* cannot open a record in a new tab, share a list position, or long-press to copy a link; browser-back semantics for filter state are unverified.
5. **Orientation is weak on phones.** The header consumes 97 px, the project name is truncated ("Amman Heights Reside…"), and the title row starts at 153 px; the active module is only visible inside the closed drawer. *Cost:* wrong-project and wrong-module errors go unnoticed; 18 % of the first viewport is chrome.
6. **No "my work" and no global create.** T7 fails structurally; creating anything requires navigating to its module first. *Cost:* T7 is 9+ taps for a partial answer versus a 1-tap target.
7. **Mobile [static]:** 17 identical large tiles on the project home (no search, recents, or switcher); switching project = back ×2 + 2 taps.

## 3. Information architecture — 4/10

**Evidence.** 36 screens sampled; 20 list screens all have search/filter, saved views, column chooser and real empty states; punch list shows Number + truncated Description with Status off-screen at 390 px (9 of 18 rows above the fold); no group-by anywhere; no assignee/location columns or filters; dashboard prints raw enums (`ready_for_review`) and "1 change orders"; daily-log title is a raw ISO timestamp; Photos tiles show the first 8 characters of an id, no image; Change Orders page stacks two unrelated lists.

**Failures and cost.**
1. **The most decision-relevant columns are hidden.** Status and due date require horizontal scroll; the visible columns are number + clipped description. *Cost:* each triage decision needs a swipe (1 tap by the D1 rule) or a row open (1 tap + screen change).
2. **No grouping** on lists of 40+ snags / 20 RFIs (D6 not met at all). *Cost:* a superintendent scanning by floor or trade must read every row; ~40 rows ≈ 4+ screens of scrolling versus ≤ 3 group headers.
3. **Nothing is filterable by person or place** (punch list has only a Status filter; RFIs only "Ball in court"). *Cost:* T7 and T10 impossible; finding "my overdue snags" is manual.
4. **Photos screen shows no photos.** *Cost:* the photo module cannot be used to verify work; users must open each snag.
5. **Raw data leakage** (enum keys, ISO timestamps, pluralisation bugs). *Cost:* small per instance, but signals unfinished data and slows scanning; in Arabic the raw English enums appear inside RTL text.
6. **Dashboard is project-wide, not personal.** "Action required" is 3 counts with a "Review" button that opens the module list, not the item. *Cost:* +2–3 taps per action to reach the actual record.
7. **Density is uneven.** 40 px rows are fine; but 97 px header + 56 px action button rows + a save-view bar (≈ 100 px) above every table push the first row to ~460 px. *Cost:* the first list row starts ~55–60 % down the 844 px viewport; ~4 fewer rows visible than necessary.

## 4. Field ergonomics — 1/10

**Evidence.** **917 of 925** interactive elements <44×44 px; **172** <24 px in a dimension. Smallest: row checkboxes 16×16 (13×13 on permissions/forms), sort headers 16 px high, "Columns ▾" 28 px, header ☰ 22×32, bell/avatar 32×32, language buttons 32 px high, pagination arrows 28×32. Target D4: ≥48, ≥56 for task actions, 8 px gaps. No `input capture`/camera flow; photo is a hidden `<input type=file>` behind a 34 px button. All primary actions ("Create", "Save", "New …") sit at the top of the page or mid-form (bottom-third rule unmet); "Delete" is a 12 px text link in each Permissions template card, directly above the form it deletes. Contrast: 106 text nodes <4.5:1 (including disabled controls and placeholders); white-on-orange avatar "SH" 2.88:1 on 36 screens; placeholders 3.57:1; disabled pagination 2.5:1; only the brand ink-on-cream body text is comfortably high. No voice input, haptics, glove mode or draft restore evidenced. Permissions form has overlapping labels and selects; Gantt is 711 px wide in a 390 px viewport.

**Failures and cost.**
1. **Targets are finger-sized, not glove-sized.** A gloved thumb covers ~14 mm ≈ 50+ CSS px. *Cost:* mis-taps on checkboxes and sort headers; each mis-tap ≈ 2–4 s plus a possible wrong bulk selection (bulk bar can change status of many records).
2. **Sunlight contrast.** Body text is dark-on-cream and reads well, but every secondary/interactive label sits in the 3–6:1 range (placeholders 3.57:1, white text on orange 2.88:1). *Cost:* unreadable at glare; users guess field purposes; the D4 7:1 bar is missed by 144 text nodes.
3. **Thumb zone ignored.** Primary buttons are at the top or scroll off with the form. *Cost:* one-handed operation on a 6-inch phone requires a grip change for every create/save (~1–2 s each, and a drop risk on scaffolding).
4. **Camera is an afterthought** (hidden file input after creation). *Cost:* +2 taps and a screen change per photo; no capture-first path for T1, T2 and T8, whose natural first action is a photo.
5. **No interruption resilience evidenced.** Forms hold state in React only; an OS kill or reload discards it (offline test: the form kept its text after a failed submit; a reload discarding it is inferred from React-only state, not measured). *Cost:* a call in the middle of a 200-character description loses the description — ~30–60 s of dictation/typing.
6. **Layout defects at phone width:** "Save view" clipped on 12 list screens, 19 of 36 screens with clipped controls, Permissions overlaps, Gantt 321 px too wide. *Cost:* controls unreachable without horizontal scroll or impossible to tap; Permissions is mis-operable.
7. **Destructive/secondary actions crowd primary ones** (Permissions "Delete" link in the card header of an editable form; Export PDF/CSV directly beside "New …" on lists). *Cost:* wrong-action risk with gloves.

## 5. Feedback & state — 3/10

**Evidence.** Latency (local, unthrottled): first DOM change 3–38 ms — fast. Emulated mid-phone (CPU 4× + 150 ms RTT): drawer 107 ms, tap-row→detail 199 ms, New punch item 240 ms first change, settled up to 930 ms. State coverage over 20 lists: empty ✓ 19/19; loading indicator ✗ on 15 of 20 (blank while waiting); retry ✓ on 15 of 20; error message ✓ 20/20. Offline: **36/36** screens show the browser's error page cold; mid-session 6 screens end in a blank content area (P0), 2 show the failure as "No … match your search" (search failure indistinguishable from no results); failed writes show `unknown_error` (raw code, 9 places) or generic "Something went wrong", keep the typed text but queue nothing. No online/offline indicator, no sync status on web. Mobile **[static]**: outbox for snags, daily logs, inspections; sync bar; everything else network-on-mount with plain "Loading".

**Failures and cost.**
1. **No offline on web at all; 6 P0 screens.** *Cost:* in a basement or trench the task simply fails; the user cannot tell "no signal" from "no data". A lost snag is a lost defect record.
2. **Failure disguised as empty** (daily-log, directory search). *Cost:* the user concludes no matching record exists and acts on it (duplicate creation, missed follow-up).
3. **Raw error codes** (`unknown_error`) and no recovery guidance; retry missing on 5 lists and every detail screen. *Cost:* +1 full reload (~3–5 s) per failure and a support call.
4. **No loading state on 15 of 20 lists.** *Cost:* users tap again (duplicate submissions on Create, unverifiable) or assume the app is frozen; at emulated network the blank period is 0.6–2.3 s (LCP up to 2.3 s on the dashboard).
5. **Perceived-latency gaps on the phone profile:** first change >100 ms for drawer (107), row open (199) and New (240); no pressed state evidenced. *Cost:* double-taps (each 1 tap + potential duplicate navigation).
6. **No optimistic updates or sync visibility on web**; status changes wait for the server. *Cost:* every one of the 3 close-out presses waits ~50–190 ms local (up to ~600 ms on the phone profile) with no acknowledgement other than the redraw.
7. **Mobile [static]:** offline exists for three modules only; RFIs, drawings, submittals, etc. show errors offline; transitions on synced items are online-only.

## 6. Bilingual / RTL — 4/10

**Evidence.** All 36 screens captured in ar/RTL at 360/390/768. Mirroring of header, tables, forms and back links is correct; task tap counts identical EN=AR. Observed defects: English data (subjects, descriptions) in an RTL table is left-aligned and clipped on its left edge ("…for foundation walls"); date inputs and pagination show `09/30/2026` and Western digits in Arabic; daily-log title shows raw ISO date; enum keys and pluralisation are English regardless of locale; Gantt overflows (690 px), Permissions overflows (425 px) in Arabic; Arabic uses a system fallback face (Poppins has no Arabic glyphs — environment-dependent rendering, unverified on device); raw `unknown_error` shown in Arabic UI. Mobile **[static]**: no `I18nManager` call found — RTL layout on device unverified; app icons/tiles have no directional handling.

**Failures and cost.**
1. **Mixed-direction text is not isolated.** Latin snag descriptions sit inside Arabic UI without `dir=auto`/bidi isolation. *Cost:* punctuation and number order can flip ("PL-001" vs "001-PL"); users misread record numbers — a wrong-record error in a numbered system.
2. **Dates/numerals inconsistent** (ISO, US-style, Western digits) across screens. *Cost:* ambiguity between 03/09 and 09/03 on due dates; missed deadlines are the highest-cost error here.
3. **Clipped leading text in RTL tables** hides the start of English subjects. *Cost:* extra open-per-row to identify a record.
4. **Untranslated data/enums** ("ready_for_review", "Unassigned" options are translated but enum labels are not). *Cost:* scanning slowed for Arabic-only users; inconsistent product.
5. **Mobile RTL unverified.** *Cost:* unknown; if unmirrored, every screen is wrong for the daily Arabic user — must be verified on device before any claim.

## 7. Consistency — 5/10

**Evidence.** ~20 list screens share `DataTable` + `FilterBar` + `SavedViewsBar` + `StatusBadge` — genuinely consistent. But: create is sometimes an inline form (RFIs, inspections, safety), sometimes a separate route (`/new` for punch list and daily log); status change is a button "Move to: X" (punch list) vs a select (RFI ball in court) vs bulk bar; three different back affordances (text link on detail, none on lists, bare header); pagination controls are copy-pasted per page (prequalification.tsx:392) alongside the shared component (11 screens); date formats vary (ISO, `9/30/2026, 8:18:10 AM`, `mm/dd/yyyy`); button sizes vary 34/38/42 px; Photos, Companies, Permissions and Settings use bespoke layouts; error text varies ("Something went wrong…", `unknown_error`, generic); mobile shares little visual/interaction language with web except colour tokens.

**Failures and cost.**
1. **Create pattern differs by module** (inline vs route). *Cost:* users cannot predict whether "New" opens a form in place or navigates; inline forms below the fold are missed (measured: inspection "New" form appears mid-page).
2. **Status-change patterns differ** (buttons vs selects vs bulk). *Cost:* relearning per module; higher error rate on rarely used ones.
3. **Copy-pasted controls** (pagination, error blocks) diverge in size and behaviour. *Cost:* the 28×32 arrows exist in two places; a fix must be made in both.
4. **Date/time formatting is per-screen.** *Cost:* see Bilingual #2.
5. **Web ↔ mobile parity:** different field sets for the same record (mobile has priority only; web has final approver, distribution). *Cost:* data entered on one client is invisible on the other.

---

## Cross-cutting summary

- **Root cause 1 — the UI exposes a fraction of the data model.** Location, assignee, manpower and grouping fields exist server-side and are unused. This is why tasks 1, 2, 5, 7, 10 fail; fixing it removes more cost than any visual change.
- **Root cause 2 — desktop-first components at phone size.** Tables, header, sidebar and targets are desktop patterns squeezed to 390 px (917/925 undersized targets, 19 screens with clipped controls).
- **Root cause 3 — the web is online-only.** All offline behaviour lives in the mobile app and only for 3 modules; web failure states are inconsistent and sometimes misleading.
- **Root cause 4 — no shared field vocabulary.** Camera-first, glove-size, bottom-thumb actions and bidi/date handling are absent as *system* rules, so each screen re-invents (or omits) them.

**Not evidenced / to verify before Stage 3:** mobile behaviour on a real device (all **[static]** items), Arabic font rendering, true network latency, and back-stack/scroll restoration (inferred from absence of any restoration code and single-page redirects, not directly measured).

*Stopping here. Stage 3 (REMEDIATION_PLAN.md) begins only after approval.*

## Erratum (found during Stage 4)

§5 failure 4 ("No loading state on 15 of 20 lists") rested on a faulty detector — see the erratum in `AUDIT_EVIDENCE.md`. `DataTable` lists already show a skeleton. The remaining, verified loading gaps are pages with bespoke loading text (dashboard, detail screens). The Feedback & state score is unchanged in spirit (offline, raw error codes, misleading empty results, missing retry remain) but I would move it from 3 to 4.
