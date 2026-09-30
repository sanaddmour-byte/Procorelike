# Task benchmarks — as the app stands today (Stage 1 · Measure)

> **Status: Stage 1 evidence. No critique, no plan, no product-code changes.** Produced under Addendum D. Companion file: [`AUDIT_EVIDENCE.md`](./AUDIT_EVIDENCE.md).

## How to read the numbers

| Label | Meaning |
|---|---|
| **Measured** | Executed against the running app (production build of `apps/web`, Express API, PostgreSQL 16 with the seeded audit data) by a scripted Chromium session. Every tap in the step log is a real interaction. |
| **Modelled** | Computed from measured values with a stated model — here only *human time* (see below). Never presented as measured. |
| **Static** | Read from source, **not run** — used only for the Expo/React Native app, which cannot run in this environment (no device/emulator, no `react-native-web`). |

**Tap rule (D1):** a tap is a tap, long-press, swipe, or a keyboard field focus. Focusing a text field counts 1; typing is counted as characters, not taps. Choosing a value in a native `<select>` counts **2** (open + choose). A file picker counts **2** (open + choose file). Opening the app from a persisted session costs 0 taps and lands on `/projects`.

**Conditions:** cold open (new browser context per task, signed-in session persisted) · viewport **390 × 844**, DPR 2, touch, mobile emulation · persona *Sara Haddad* (owner/admin — chosen so permissions are never the reason a step is missing) · **English (LTR) and Arabic (RTL) reported separately** · data: 2 projects, 40 snags, 20 RFIs, 5 drawings, daily log for today (see `docs/ux/measure/00-seed-audit-extras.mjs`) · DB restored to the same snapshot before each language run.

**Time:** *machine time* is wall-clock from first paint of the start screen to the end state with the scripted user acting instantly — it isolates system latency (local API/DB, so it understates a real network). *Modelled human time* = `1.0 s × taps + 1.2 s × screen changes + 0.35 s × characters typed + machine time`; the constants are a keystroke-level-model estimate for a phone, **not measured with people**. Compare it to the D1 time targets with that caveat.

**Where a step is impossible** (the control does not exist) the run stops at the furthest achievable point, the row says so, and the tap count shown is for that partial path. Nothing is estimated for the missing part.

## Summary — web (Measured)

| # | Task (D1) | Target taps · time · offline | EN taps | AR taps | EN machine s | AR machine s | EN modelled human s | Completable as specified (online)? | Taps within target? | Offline requirement met? |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Create a snag with photo, location, assignee | ≤ 6 · ≤ 45 s · works offline | 8 *(partial)* | 8 *(partial)* | 2.4 | 2.5 | 29.7 | ❌ no | n/a | ❌ no (web has no offline mode) |
| T2 | Create the next snag at the same location | ≤ 4 · ≤ 25 s · works offline | 4 *(partial)* | 4 *(partial)* | 0.3 | 0.3 | 18.1 | ❌ no | n/a | ❌ no (web has no offline mode) |
| T3 | Raise a work-inspection request | ≤ 6 · ≤ 60 s · — | 5 | 5 | 1.9 | 1.8 | 11.7 | ✅ yes | ✅ yes | — |
| T4 | Find a drawing by sheet number | ≤ 4 · ≤ 20 s · — | 5 | 5 | 2.9 | 2.8 | 14.4 | ✅ yes | ❌ no (+1) | — |
| T5 | Open today's daily log and add manpower | ≤ 5 · ≤ 40 s · — | 4 *(partial)* | 4 *(partial)* | 1.3 | 1.3 | 10.1 | ❌ no | n/a | — |
| T6 | Answer an RFI assigned to me | ≤ 4 · ≤ 90 s · create offline, send on sync | 8 | 8 | 3.5 | 3.6 | 35.7 | ✅ yes | ❌ no (+4) | ❌ no (web has no offline mode) |
| T7 | See everything assigned to me, due today, across modules | ≤ 2 · ≤ 10 s · — | 9 *(partial)* | 9 *(partial)* | 3.1 | 3.1 | 19.3 | ❌ no | n/a | — |
| T8 | Close out a snag with an 'after' photo | ≤ 5 · ≤ 30 s · — | 9 | 9 | 5.7 | 5.9 | 19.5 | ✅ yes | ❌ no (+4) | — |
| T9 | Switch project and land on the same screen type | ≤ 3 · ≤ 10 s · — | 2 | 2 | 0.8 | 0.7 | 5.2 | ✅ yes | ✅ yes | — |
| T10 | Bulk-assign 10 snags to one subcontractor | ≤ 8 total · ≤ 60 s · — | 4 *(partial)* | 4 *(partial)* | 3.0 | 3.1 | 11.8 | ❌ no | n/a | — |

Arabic and English produced identical tap counts and identical outcomes for all ten tasks; machine times differ by measurement noise only. Offline: the web app has **no offline behaviour at all** (service worker, IndexedDB, `navigator.onLine` handling are all absent — see AUDIT_EVIDENCE §11–12), so the offline half of T1, T2 and T6 fails on the web.

## Per-task detail — web (Measured)

### T1 — Create a snag with photo, location, assignee

Target: **≤ 6 taps · ≤ 45 s** · works offline

Result: **8 taps** (EN) / **8 taps** (AR) · machine 2.4 s / 2.5 s · modelled human 29.7 s / 29.8 s · **not completable as specified**.

What was achieved: snag created with description + photo (after creation); assignee and location impossible.

Unmet requirements:
- assignee: the create form and the detail page have no assignee control (the only person select is "Final approver"); the API create schema does accept assigneeUserId/assigneeCompanyId
- location: the create form has no location field and the item detail page does not show or edit `locationId`
- photo could only be attached AFTER creating (separate screen, +2 taps)
- offline: web has no offline queue (see AUDIT_EVIDENCE §11)

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 8 |
| 2 | tap | hamburger (open navigation) | 129 |
| 3 | tap | sidebar: punch-list | 244 |
| 4 | tap | New punch item | 442 |
| 5 | focus | description (focus) | 548 |
| 6 | tap | Create | 731 |
| 7 | tap | Upload photo (open file picker) | 837 |
| 8 | tap | Upload photo (choose file) | 837 |

AR run: 8 steps, same sequence.

### T2 — Create the next snag at the same location

Target: **≤ 4 taps · ≤ 25 s** · works offline

Result: **4 taps** (EN) / **4 taps** (AR) · machine 0.3 s / 0.3 s · modelled human 18.1 s / 18.1 s · **not completable as specified**.

What was achieved: second snag created in 4 taps, but location cannot be set or carried over; no assignee control exists.

Unmet requirements:
- same location: no location field on web
- no state is carried from the previous snag (form is blank)

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | Back to punch list | 5 |
| 2 | tap | New punch item | 82 |
| 3 | focus | description (focus) | 172 |
| 4 | tap | Create | 243 |

AR run: 4 steps, same sequence.

### T3 — Raise a work-inspection request

Target: **≤ 6 taps · ≤ 60 s** 

Result: **5 taps** (EN) / **5 taps** (AR) · machine 1.9 s / 1.8 s · modelled human 11.7 s / 11.6 s · completed.

What was achieved: inspection created from the default template; no location, no note/description, no assignee/inspector field on the create form.

Unmet requirements:
- location of work not capturable at request time

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 7 |
| 2 | tap | hamburger (open navigation) | 128 |
| 3 | tap | sidebar: inspections | 229 |
| 4 | tap | New inspection | 436 |
| 5 | tap | Create (default template, no date) | 622 |

AR run: 5 steps, same sequence.

### T4 — Find a drawing by sheet number

Target: **≤ 4 taps · ≤ 20 s** 

Result: **5 taps** (EN) / **5 taps** (AR) · machine 2.9 s / 2.8 s · modelled human 14.4 s / 14.4 s · completed.

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 5 |
| 2 | tap | hamburger (open navigation) | 114 |
| 3 | tap | sidebar: drawings | 220 |
| 4 | focus | search sheet number (focus) | 405 |
| 5 | tap | open drawing row | 1296 |

AR run: 5 steps, same sequence.

### T5 — Open today's daily log and add manpower

Target: **≤ 5 taps · ≤ 40 s** 

Result: **4 taps** (EN) / **4 taps** (AR) · machine 1.3 s / 1.3 s · modelled human 10.1 s / 10.1 s · **not completable as specified**.

What was achieved: daily log opened; there is nowhere to add manpower on the detail screen.

Unmet requirements:
- manpower entry: no UI on daily-log detail or on /daily-log/new (API tables exist: daily_log_manpower)

Controls present on the daily-log detail screen: `textarea`, `Save`, `Submit & lock`.

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 6 |
| 2 | tap | hamburger (open navigation) | 90 |
| 3 | tap | sidebar: daily-log | 173 |
| 4 | tap | open the most recent daily log (today's) | 378 |

AR run: 4 steps, same sequence.

### T6 — Answer an RFI assigned to me

Target: **≤ 4 taps · ≤ 90 s** · create offline, send on sync

Result: **8 taps** (EN) / **8 taps** (AR) · machine 3.5 s / 3.6 s · modelled human 35.7 s / 35.8 s · completed.

What was achieved: answered online; offline create-and-sync is not supported on web.

Unmet requirements:
- offline: cannot answer without network

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 5 |
| 2 | tap | hamburger (open navigation) | 120 |
| 3 | tap | sidebar: rfis | 222 |
| 4 | focus | filter: ball in court = me (select open) | 403 |
| 5 | tap | filter: ball in court = me (choose option) | 439 |
| 6 | tap | open first RFI in my court | 1651 |
| 7 | focus | response text (focus) | 1803 |
| 8 | tap | Add response | 1986 |

AR run: 8 steps, same sequence.

### T7 — See everything assigned to me, due today, across modules

Target: **≤ 2 taps · ≤ 10 s** 

Result: **9 taps** (EN) / **9 taps** (AR) · machine 3.1 s / 3.1 s · modelled human 19.3 s / 19.3 s · **not completable as specified**.

What was achieved: no cross-module 'assigned to me / due today' screen exists; best case reaches RFIs (filterable by ball-in-court) and stops -- punch list has no assignee filter, and 30+ other modules have no personal filter.

Unmet requirements:
- cross-module personal list
- due-today filter
- punch list assignee filter

Punch list filter controls: `Status|Open|Ready for review|Not accepted|In dispute|Approved|Closed` (no assignee filter). Dashboard has a personal/“due today” section: no.

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 10 |
| 2 | tap | hamburger (open navigation) | 107 |
| 3 | tap | sidebar: dashboard | 202 |
| 4 | tap | hamburger (open navigation) | 1983 |
| 5 | tap | sidebar: rfis | 2019 |
| 6 | focus | RFIs: ball in court = me (select open) | 2115 |
| 7 | tap | RFIs: ball in court = me (choose option) | 2158 |
| 8 | tap | hamburger (open navigation) | 2966 |
| 9 | tap | sidebar: punch-list | 3004 |

AR run: 9 steps, same sequence.

### T8 — Close out a snag with an 'after' photo

Target: **≤ 5 taps · ≤ 30 s** 

Result: **9 taps** (EN) / **9 taps** (AR) · machine 5.7 s / 5.9 s · modelled human 19.5 s / 19.7 s · completed.

Status buttons pressed to reach *Closed*: `Move to: Ready for review` → `Move to: Approved` → `Move to: Closed`.

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 4 |
| 2 | tap | hamburger (open navigation) | 80 |
| 3 | tap | sidebar: punch-list | 186 |
| 4 | tap | open snag | 1139 |
| 5 | tap | Upload 'after' photo (open file picker) | 1202 |
| 6 | tap | Upload 'after' photo (choose file) | 1202 |
| 7 | tap | status: Move to: Ready for review | 2777 |
| 8 | tap | status: Move to: Approved | 3718 |
| 9 | tap | status: Move to: Closed | 4654 |

AR run: 9 steps, same sequence.

### T9 — Switch project and land on the same screen type

Target: **≤ 3 taps · ≤ 10 s** 

Result: **2 taps** (EN) / **2 taps** (AR) · machine 0.8 s / 0.7 s · modelled human 5.2 s / 5.1 s · completed.

Before: `…5-1097-4813-bf2d-16977828c34c/punch-list` → after: `…4-440e-4159-b573-07e180410097/punch-list` (same screen type: yes).

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | open project selector | 11 |
| 2 | tap | choose other project | 79 |

AR run: 2 steps, same sequence.

### T10 — Bulk-assign 10 snags to one subcontractor

Target: **≤ 8 total taps · ≤ 60 s** 

Result: **4 taps** (EN) / **4 taps** (AR) · machine 3.0 s / 3.1 s · modelled human 11.8 s / 11.9 s · **not completable as specified**.

Multi-select bar offered: `Status`. Controls on the snag detail screen: 3 (person selects: `Final approver` only).

| step | kind | what (EN run) | t (ms) |
|---|---|---|---|
| 1 | tap | project card -> project shell (lands on Directory) | 6 |
| 2 | tap | hamburger (open navigation) | 121 |
| 3 | tap | sidebar: punch-list | 241 |
| 4 | tap | open snag (looking for an assignee control) | 1979 |

AR run: 4 steps, same sequence.

## Summary — mobile (Static; **not run**)

The Expo/React Native app cannot be run here, so nothing below is measured. Each row is a tap count derived by reading the screens and following `Link`/`router` calls; a real device measurement is still owed.

| # | Taps (static) | Path | Offline (static) | What is missing |
|---|---|---|---|---|
| T1 | 5 | project card → Punch list tile → New (header) → description field focus → Save | yes — writes to local SQLite outbox (`createPunchItem`) | No photo, location or assignee control exists in `punch-list/new.tsx` (fields: description, priority). No camera/image-picker dependency in `apps/mobile/package.json`. |
| T2 | 4 | back → New → description focus → Save | yes | Form is blank each time; no location field. |
| T3 | 4 | project card → Inspections tile → New → choose template (creates on tap) | yes — `createInspection` writes locally; templates come from a local cache | No location or note captured at creation. |
| T4 | 3 (+ scrolling) | project card → Drawings tile → open row | no — `apiJson('/drawings?projectId=…')` on every mount, no local cache | No search input in `drawings/index.tsx`; a register longer than one screen requires swipes (each swipe = 1 tap by the D1 rule). |
| T5 | 3 to reach the log | project card → Daily log tile → open row | yes for the log itself (local repo) | `daily-log/[logId].tsx` has a notes field only; no manpower entry. |
| T6 | n/a | project card → RFIs tile → open row | no | `rfis/[rfiId].tsx` performs one GET and renders read-only; there is no response control. |
| T7 | n/a | — | — | No cross-module personal view; `dashboard/index.tsx` shows project totals. |
| T8 | n/a | project card → Punch list tile → open row | status changes are online-only (`canTransition = syncStatus === 'synced'`) | No photo capture on the detail screen. |
| T9 | 4 | back → back → project card → Punch list tile | n/a | No project selector; the only way to change project is to return to the project list. |
| T10 | n/a | — | — | No assignee control and no multi-select. |

Cold open on mobile: `app/index.tsx` sends a signed-in user to the projects list (0 taps). The project home is a list of 17 large tiles (no search, no recents, no project switcher).

## Gaps between measured behaviour and D1 targets (facts only)

| # | Taps vs target | Requirement not achievable |
|---|---|---|
| T1 | 8 vs ≤ 6 → n/a (incomplete; 8 taps for the partial path) | assignee: the create form and the detail page have no assignee control (the only person select is "Final approver"); the API create schema does accept assigneeUserId/assigneeCompanyId; location: the create form has no location field and the item detail page does not show or edit `locationId`; photo could only be attached AFTER creating (separate screen, +2 taps); offline: web has no offline queue (see AUDIT_EVIDENCE §11) |
| T2 | 4 vs ≤ 4 → n/a (incomplete; 4 taps for the partial path) | same location: no location field on web; no state is carried from the previous snag (form is blank) |
| T3 | 5 vs ≤ 6 → within | location of work not capturable at request time |
| T4 | 5 vs ≤ 4 → over by 1 | — |
| T5 | 4 vs ≤ 5 → n/a (incomplete; 4 taps for the partial path) | manpower entry: no UI on daily-log detail or on /daily-log/new (API tables exist: daily_log_manpower) |
| T6 | 8 vs ≤ 4 → over by 4 | offline: cannot answer without network |
| T7 | 9 vs ≤ 2 → n/a (incomplete; 9 taps for the partial path) | cross-module personal list; due-today filter; punch list assignee filter |
| T8 | 9 vs ≤ 5 → over by 4 | — |
| T9 | 2 vs ≤ 3 → within | — |
| T10 | 4 vs ≤ 8 total → n/a (incomplete; 4 taps for the partial path) | assignee: no assignee control on the list, multi-select bar or detail screen (multi-select offers status changes only), so a bulk or per-item reassignment cannot be performed |

## Reproducing

```
docs/ux/measure/reset-db.sh                 # restore audit snapshot
node docs/ux/measure/02-tasks-web.mjs en   # then again after reset-db.sh with: ar
```

