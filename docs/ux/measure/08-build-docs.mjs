// Stage 1 -- assemble docs/ux/TASK_BENCHMARKS.md and docs/ux/AUDIT_EVIDENCE.md from the measured JSON in docs/ux/data/.
// No critique, no plan: this file only reports what was observed and how it was observed.
import fs from "node:fs";
import path from "node:path";
import { ROOT, DATA } from "./lib.mjs";

const J = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const en = J("tasks-web-en.json");
const ar = J("tasks-web-ar.json");
const inv = J("inventory.json");
const invSum = J("inventory-summary.json");
const screens = J("screens.json");
const sum = J("summary.json");
const perf = J("perf.json");
const st = J("states-offline.json");
const offAll = J("offline-all.json");
const dark = J("sweep-dark-identity.json");
const mmd = fs.readFileSync(path.join(DATA, "nav-graph.mmd"), "utf8");

const s = (ms) => (ms / 1000).toFixed(1);
const short = (t) => t.split(" ")[0];
const T = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10"];
const byId = (arr, id) => arr.find((t) => t.task.startsWith(id + " "));

const TARGETS = {
  T1: ["Create a snag with photo, location, assignee", "≤ 6", "≤ 45 s", "works offline"],
  T2: ["Create the next snag at the same location", "≤ 4", "≤ 25 s", "works offline"],
  T3: ["Raise a work-inspection request", "≤ 6", "≤ 60 s", "—"],
  T4: ["Find a drawing by sheet number", "≤ 4", "≤ 20 s", "—"],
  T5: ["Open today's daily log and add manpower", "≤ 5", "≤ 40 s", "—"],
  T6: ["Answer an RFI assigned to me", "≤ 4", "≤ 90 s", "create offline, send on sync"],
  T7: ["See everything assigned to me, due today, across modules", "≤ 2", "≤ 10 s", "—"],
  T8: ["Close out a snag with an 'after' photo", "≤ 5", "≤ 30 s", "—"],
  T9: ["Switch project and land on the same screen type", "≤ 3", "≤ 10 s", "—"],
  T10: ["Bulk-assign 10 snags to one subcontractor", "≤ 8 total", "≤ 60 s", "—"],
};

// ---- static (source-read, NOT run) mobile paths ----
const MOBILE = {
  T1: { taps: "5", path: "project card → Punch list tile → New (header) → description field focus → Save", offline: "yes — writes to local SQLite outbox (`createPunchItem`)", gap: "No photo, location or assignee control exists in `punch-list/new.tsx` (fields: description, priority). No camera/image-picker dependency in `apps/mobile/package.json`." },
  T2: { taps: "4", path: "back → New → description focus → Save", offline: "yes", gap: "Form is blank each time; no location field." },
  T3: { taps: "4", path: "project card → Inspections tile → New → choose template (creates on tap)", offline: "yes — `createInspection` writes locally; templates come from a local cache", gap: "No location or note captured at creation." },
  T4: { taps: "3 (+ scrolling)", path: "project card → Drawings tile → open row", offline: "no — `apiJson('/drawings?projectId=…')` on every mount, no local cache", gap: "No search input in `drawings/index.tsx`; a register longer than one screen requires swipes (each swipe = 1 tap by the D1 rule)." },
  T5: { taps: "3 to reach the log", path: "project card → Daily log tile → open row", offline: "yes for the log itself (local repo)", gap: "`daily-log/[logId].tsx` has a notes field only; no manpower entry." },
  T6: { taps: "n/a", path: "project card → RFIs tile → open row", offline: "no", gap: "`rfis/[rfiId].tsx` performs one GET and renders read-only; there is no response control." },
  T7: { taps: "n/a", path: "—", offline: "—", gap: "No cross-module personal view; `dashboard/index.tsx` shows project totals." },
  T8: { taps: "n/a", path: "project card → Punch list tile → open row", offline: "status changes are online-only (`canTransition = syncStatus === 'synced'`)", gap: "No photo capture on the detail screen." },
  T9: { taps: "4", path: "back → back → project card → Punch list tile", offline: "n/a", gap: "No project selector; the only way to change project is to return to the project list." },
  T10: { taps: "n/a", path: "—", offline: "—", gap: "No assignee control and no multi-select." },
};

let b = "";
const w = (x = "") => (b += x + "\n");

// =====================================================================
// TASK_BENCHMARKS.md
// =====================================================================
w("# Task benchmarks — as the app stands today (Stage 1 · Measure)");
w();
w("> **Status: Stage 1 evidence. No critique, no plan, no product-code changes.** Produced under Addendum D. Companion file: [`AUDIT_EVIDENCE.md`](./AUDIT_EVIDENCE.md).");
w();
w("## How to read the numbers");
w();
w("| Label | Meaning |");
w("|---|---|");
w("| **Measured** | Executed against the running app (production build of `apps/web`, Express API, PostgreSQL 16 with the seeded audit data) by a scripted Chromium session. Every tap in the step log is a real interaction. |");
w("| **Modelled** | Computed from measured values with a stated model — here only *human time* (see below). Never presented as measured. |");
w("| **Static** | Read from source, **not run** — used only for the Expo/React Native app, which cannot run in this environment (no device/emulator, no `react-native-web`). |");
w();
w("**Tap rule (D1):** a tap is a tap, long-press, swipe, or a keyboard field focus. Focusing a text field counts 1; typing is counted as characters, not taps. Choosing a value in a native `<select>` counts **2** (open + choose). A file picker counts **2** (open + choose file). Opening the app from a persisted session costs 0 taps and lands on `/projects`.");
w();
w("**Conditions:** cold open (new browser context per task, signed-in session persisted) · viewport **390 × 844**, DPR 2, touch, mobile emulation · persona *Sara Haddad* (owner/admin — chosen so permissions are never the reason a step is missing) · **English (LTR) and Arabic (RTL) reported separately** · data: 2 projects, 40 snags, 20 RFIs, 5 drawings, daily log for today (see `docs/ux/measure/00-seed-audit-extras.mjs`) · DB restored to the same snapshot before each language run.");
w();
w("**Time:** *machine time* is wall-clock from first paint of the start screen to the end state with the scripted user acting instantly — it isolates system latency (local API/DB, so it understates a real network). *Modelled human time* = `1.0 s × taps + 1.2 s × screen changes + 0.35 s × characters typed + machine time`; the constants are a keystroke-level-model estimate for a phone, **not measured with people**. Compare it to the D1 time targets with that caveat.");
w();
w("**Where a step is impossible** (the control does not exist) the run stops at the furthest achievable point, the row says so, and the tap count shown is for that partial path. Nothing is estimated for the missing part.");
w();

w("## Summary — web (Measured)");
w();
w("| # | Task (D1) | Target taps · time · offline | EN taps | AR taps | EN machine s | AR machine s | EN modelled human s | Completable as specified (online)? | Taps within target? | Offline requirement met? |");
w("|---|---|---|---|---|---|---|---|---|---|---|");
for (const id of T) {
  const e = byId(en, id), a = byId(ar, id);
  const [name, tt, tm, off] = TARGETS[id];
  const lim = parseInt(tt.replace(/\D/g, ""), 10);
  const ok = e.completed ? "✅ yes" : "❌ no";
  const within = !e.completed ? "n/a" : e.taps <= lim ? "✅ yes" : `❌ no (+${e.taps - lim})`;
  const offMet = off === "—" ? "—" : "❌ no (web has no offline mode)";
  w(`| ${id} | ${name} | ${tt} · ${tm} · ${off} | ${e.taps}${e.completed ? "" : " *(partial)*"} | ${a.taps}${a.completed ? "" : " *(partial)*"} | ${s(e.machineMs)} | ${s(a.machineMs)} | ${e.modelledSeconds} | ${ok} | ${within} | ${offMet} |`);
}
w();
w("Arabic and English produced identical tap counts and identical outcomes for all ten tasks; machine times differ by measurement noise only. Offline: the web app has **no offline behaviour at all** (service worker, IndexedDB, `navigator.onLine` handling are all absent — see AUDIT_EVIDENCE §11–12), so the offline half of T1, T2 and T6 fails on the web.");
w();

w("## Per-task detail — web (Measured)");
for (const id of T) {
  const e = byId(en, id), a = byId(ar, id);
  w();
  w(`### ${id} — ${TARGETS[id][0]}`);
  w();
  w(`Target: **${TARGETS[id][1]} taps · ${TARGETS[id][2]}** ${TARGETS[id][3] !== "—" ? "· " + TARGETS[id][3] : ""}`);
  w();
  w(`Result: **${e.taps} taps** (EN) / **${a.taps} taps** (AR) · machine ${s(e.machineMs)} s / ${s(a.machineMs)} s · modelled human ${e.modelledSeconds} s / ${a.modelledSeconds} s · ${e.completed ? "completed" : "**not completable as specified**"}.`);
  if (e.partial) { w(); w(`What was achieved: ${e.partial}.`); }
  if (e.unmet?.length) { w(); w("Unmet requirements:"); for (const u of e.unmet) w(`- ${u}`); }
  if (e.transitionsTaken) { w(); w(`Status buttons pressed to reach *Closed*: ${e.transitionsTaken.map((x) => "`" + x + "`").join(" → ")}.`); }
  if (e.before) { w(); w(`Before: \`…${e.before.slice(-40)}\` → after: \`…${e.after.slice(-40)}\` (same screen type: ${e.completed ? "yes" : "no"}).`); }
  if (e.bulkBarOffers) { w(); w(`Multi-select bar offered: ${e.bulkBarOffers.map((x) => "`" + x + "`").join(", ") || "(nothing recognisable)"}. Controls on the snag detail screen: ${(e.detailControls ?? []).length} (person selects: \`Final approver\` only).`); }
  if (e.controlsOnDetail) { w(); w(`Controls present on the daily-log detail screen: ${e.controlsOnDetail.map((x) => "`" + x + "`").join(", ")}.`); }
  if (e.punchListFilterSelects) { w(); w(`Punch list filter controls: ${e.punchListFilterSelects.map((x) => "`" + x + "`").join(", ")} (no assignee filter). Dashboard has a personal/“due today” section: ${e.dashboardHasPersonalOrDueTodaySection ? "yes" : "no"}.`); }
  w();
  w("| step | kind | what (EN run) | t (ms) |");
  w("|---|---|---|---|");
  for (const st_ of e.steps) w(`| ${st_.n} | ${st_.kind} | ${st_.what} | ${st_.t} |`);
  const diff = a.steps.length !== e.steps.length;
  w();
  w(`AR run: ${a.steps.length} steps${diff ? " (differs — see data/tasks-web-ar.json)" : ", same sequence"}.`);
}
w();

w("## Summary — mobile (Static; **not run**)");
w();
w("The Expo/React Native app cannot be run here, so nothing below is measured. Each row is a tap count derived by reading the screens and following `Link`/`router` calls; a real device measurement is still owed.");
w();
w("| # | Taps (static) | Path | Offline (static) | What is missing |");
w("|---|---|---|---|---|");
for (const id of T) {
  const m = MOBILE[id];
  w(`| ${id} | ${m.taps} | ${m.path} | ${m.offline} | ${m.gap} |`);
}
w();
w("Cold open on mobile: `app/index.tsx` sends a signed-in user to the projects list (0 taps). The project home is a list of 17 large tiles (no search, no recents, no project switcher).");
w();

w("## Gaps between measured behaviour and D1 targets (facts only)");
w();
w("| # | Taps vs target | Requirement not achievable |");
w("|---|---|---|");
for (const id of T) {
  const e = byId(en, id);
  const tgt = TARGETS[id][1];
  const lim = parseInt(tgt.replace(/\D/g, ""), 10);
  const cmp = e.completed ? (e.taps <= lim ? "within" : `over by ${e.taps - lim}`) : `n/a (incomplete; ${e.taps} taps for the partial path)`;
  w(`| ${id} | ${e.taps} vs ${tgt} → ${cmp} | ${(e.unmet ?? (id === "T10" ? ["assignee: no assignee control on the list, multi-select bar or detail screen (multi-select offers status changes only), so a bulk or per-item reassignment cannot be performed"] : [])).join("; ") || "—"} |`);
}
w();
w("## Reproducing");
w();
w("```");
w("docs/ux/measure/reset-db.sh                 # restore audit snapshot");
w("node docs/ux/measure/02-tasks-web.mjs en   # then again after reset-db.sh with: ar");
w("```");
w();
fs.writeFileSync(path.join(ROOT, "docs/ux/TASK_BENCHMARKS.md"), b);

// =====================================================================
// AUDIT_EVIDENCE.md
// =====================================================================
b = "";
w("# Audit evidence — running app (Stage 1 · Measure)");
w();
w("> **Status: Stage 1 evidence. No critique, no plan, no product-code changes.** Everything here was observed on the running application unless it is explicitly labelled *static* (source read) or *modelled*. Companion: [`TASK_BENCHMARKS.md`](./TASK_BENCHMARKS.md). Raw data: [`data/`](./data). Scripts that produced it: [`measure/`](./measure).");
w();
w("## 0. Provenance and limits");
w();
w("| Item | Detail |");
w("|---|---|");
w("| App under test | `apps/web` — Next.js 15.5 **production build** (`next start`), React 19, next-intl (en / ar, `dir` from locale) |");
w("| Backend | `apps/api` Express 5 on localhost:4000 · PostgreSQL 16 with RLS on localhost · S3 stand-in on :9000 |");
w("| Browser | Chromium 1194 via Playwright 1.56.1, `isMobile`, touch, DPR 2 |");
w("| Data | `seed.ts` + `seed-demo-content.ts` + `docs/ux/measure/00-seed-audit-extras.mjs`; persona Sara Haddad (owner/admin) |");
w("| Not measured | **Mobile app** (Expo) — no emulator/device available; only source was read (*static*). **Real devices, real networks** — API/DB are on localhost, so latency understates the field. **Lighthouse/TTI** — not available; FCP, LCP and a long-task total-blocking-time proxy are reported instead. **Screen readers.** |");
w("| Emulation (labelled where used) | “emulated-mid-phone” = CDP CPU throttle 4× + 150 ms RTT + 1.6/0.75 Mbps. It is an emulation, not a device. |");
w("| Dark mode | There is no dark theme in the web app. Screenshots were still taken with `prefers-color-scheme: dark` emulated so this can be seen: " + `**${dark.filter((d) => d.identicalToLight).length} of ${dark.length}** dark screenshots are byte-identical to their light counterpart.` + " |");
w("| Arabic rendering | The sandbox has no Arabic system font that matches Poppins, so Arabic glyphs render in a fallback face; glyph shapes in Arabic screenshots are environment-dependent, layout (mirroring, wrapping) is not. |");
w("| Incidental finding | `POST /projects` returned HTTP 500 in this environment (PostgreSQL RLS violation on the `projects` insert, error 42501). Not investigated (Stage 1). The extra project used for empty-state testing was inserted with SQL. |");
w();

// ---------------- 1. inventory ----------------
w("## 1. Route and screen inventory");
w();
w(`**Web:** ${invSum.pages} page routes; the project sidebar links ${invSum.sidebarEntries} of them. Derived by scanning \`apps/web/app\` for page files and every literal \`href\`/\`router.push\`/\`router.replace\` target, plus the non-literal navigation sources read by hand (notification bell, global search results, project selector, dashboard action links). *Static analysis is used only to enumerate routes and links; behaviour was verified by running the app.*`);
w();
w("Legend — **ORPHAN**: nothing links to it. **shell-only**: reachable only from the sidebar/search/bell, never contextually from another screen. **DEAD-END**: no link out of the page body to any other route (the shell chrome is still present). **NO-SIBLING**: a detail screen with no way to reach another record of the same type without returning to the list.");
w();
w("| Route | Kind | Linked from (pages) | Linked from (shell) | Flags |");
w("|---|---|---|---|---|");
const nosib = new Set(inv.siblingReach.filter((x) => x.selfLinks === 0).map((x) => x.route));
for (const r of inv.inventory) {
  const flags = [r.orphan && "**ORPHAN**", r.shellOnly && !r.orphan && "shell-only", r.deadEnd && "**DEAD-END**", nosib.has(r.route) && "NO-SIBLING"].filter(Boolean).join(", ");
  const pl = r.inboundFromPages.map((p) => "`" + p.replace("/projects/[id]", "P") + "`");
  const pages = pl.length > 6 ? `${pl.length} pages (${pl.slice(0, 3).join(", ")}, …)` : pl.join(", ") || "—";
  const shell = r.inboundFromShell.join(", ") || "—";
  w(`| \`${r.route.replace("/projects/[id]", "P")}\` | ${r.kind} | ${pages} | ${shell} | ${flags || "—"} |`);
}
w();
w(`Counts: ORPHAN = ${invSum.orphans.length} (${invSum.orphans.map((x) => "`" + x + "`").join(", ")}); DEAD-END = ${invSum.deadEnds.length} (${invSum.deadEnds.map((x) => "`" + x + "`").join(", ")}); NO-SIBLING detail screens = ${invSum.detailNoSibling.length} of ${inv.inventory.filter((x) => x.kind === "detail").length - 0} detail routes.`);
w();
w("Notes: `/accept-invite` is entered from an emailed link, so having no inbound link is expected. `/` only redirects. The project sidebar is **hidden behind the ☰ button below 768 px**; at 390 px every module is one tap (☰) plus one tap away, on every project screen. The project list (`/projects`) links only to each project's **Directory** (“View directory”); there is no route from it to the dashboard or any other module.");
w();
w("**Mobile (static):** 41 screens under `apps/mobile/app`; project home = 17 module tiles; the same module set is reachable from tiles, but there is no bell, no global search and no project switcher. Modules present on web but absent on mobile: documents, photos, transmittals, analytics, gantt, progress updates, prequalification, bidding, estimating, direct costs, prime contract, permissions, settings, directory.");
w();

// ---------------- 2. nav graph ----------------
w("## 2. Navigation graph");
w();
w("Solid arrows = a link/navigation from a page body (the redirect-to-`/login` on session expiry that every page performs is omitted). Dotted arrows from the shell hub = sidebar entries. Nodes marked with a red dashed outline are detail screens with no sibling reach (no link to another record of the same type). `P` = `/projects/[id]`. Generated by `measure/01-inventory.mjs`; source: [`data/nav-graph.mmd`](./data/nav-graph.mmd).");
w();
w("```mermaid");
w(mmd.trim());
w("```");
w();

// ---------------- 3. walkthrough ----------------
w("## 3. Tap-count walkthroughs");
w();
w("All ten D1 tasks were executed on the running web app, in English and Arabic; the step-by-step logs and results are in [`TASK_BENCHMARKS.md`](./TASK_BENCHMARKS.md). Screenshots taken during the runs: `screenshots/task*-{en,ar}.png`.");
w();
w("| # | EN taps | AR taps | Completed | Headline fact |");
w("|---|---|---|---|---|");
const facts = {
  T1: "Create form fields: description, priority, due date, final approver, additional personnel. No photo, location or assignee field; photo can only be added afterwards on the detail screen.",
  T2: "Form opens blank; nothing from the previous snag is retained.",
  T3: "Inline form: template select + optional date.",
  T4: "Search field filters the register; row must then be tapped.",
  T5: "Daily-log detail contains a notes field and Save / Submit & lock only.",
  T6: "Ball-in-court filter is a native select (2 taps); response is a textarea + button on the detail screen.",
  T7: "No cross-module personal view exists; the dashboard's “Action required” list is project-wide.",
  T8: "Reaching *Closed* takes three status-button presses (Ready for review → Approved → Closed) after the photo.",
  T9: "Project selector keeps the module segment; lands on the same list screen.",
  T10: "Multi-select bar offers status transitions only; no assignee control on list or detail.",
};
for (const id of T) {
  const e = byId(en, id), a = byId(ar, id);
  w(`| ${id} | ${e.taps} | ${a.taps} | ${e.completed ? "yes" : "no"} | ${facts[id]} |`);
}
w();

// ---------------- 4. screenshot index ----------------
w("## 4. Screenshot index");
w();
w(`${screens.screens.length} screens × widths 360 / 390 / 768 × English (LTR) and Arabic (RTL) in the light theme, plus 390 px with dark scheme emulated. Files are in [\`screenshots/\`](./screenshots), named \`<screen>__<locale>-<width>-<scheme>.png\`. Images were reduced to 1× after measurement to keep the repository small.`);
w();
w("| Screen | EN 360 | EN 390 | EN 768 | AR 360 | AR 390 | AR 768 | 390 dark (EN / AR) |");
w("|---|---|---|---|---|---|---|---|");
const L = (n, loc, wd, sc = "light") => `[img](screenshots/${n}__${loc}-${wd}-${sc}.png)`;
for (const [n] of screens.screens) w(`| ${n} | ${L(n, "en", 360)} | ${L(n, "en", 390)} | ${L(n, "en", 768)} | ${L(n, "ar", 360)} | ${L(n, "ar", 390)} | ${L(n, "ar", 768)} | ${L(n, "en", 390, "dark")} / ${L(n, "ar", 390, "dark")} |`);
w();
w("Task-run captures: `task1-form`, `task1-done`, `task3-form`, `task4-done`, `task5-detail`, `task6-response`, `task7-dashboard`, `task8-done`, `task10-bulkbar`, `task10-detail` (each `-en` / `-ar`). State captures: `state-{populated,empty,loading,error}__<module>.png`. Offline captures: `offline-*.png`.");
w();
w("### What the screenshots show (inspected)");
w();
w("Screens were opened and read at 390 px in both languages, and contact sheets of all 36 screens at 360, 390 and 768 px were reviewed. Observations, stated as facts:");
w();
const OBS = [
  "**Shell (all project screens, 390 px):** a two-row dark header — ☰, brand, project selector, then English / العربية buttons, notification bell (emoji glyph with count) and avatar — occupies 97 px; the first heading starts at ~153 px. There is no global-search field in the 390/360 px header; it appears at 768 px next to the project selector with a ⌘K hint. The sidebar is not visible below 768 px; at 768 px it is a permanent 224 px column.",
  "**Language toggle:** both language buttons are always shown in the header; the active one is orange-filled. In Arabic the whole layout mirrors (header, tables, form labels, back links); table cell text that is English data (subjects, descriptions) stays left-aligned and is clipped on its left edge inside the RTL table.",
  "**Lists (punch list, RFIs, submittals, …):** a “View name / Save view” bar sits above the search box. At 390 px its **Save view** button is cut off by the right edge on 12 list screens (also visible in the screenshots). The table is wider than the viewport: on the punch list only *Number* and the start of *Description* are visible; *Status* is off-screen to the right. Rows are 40 px high with a 16 px checkbox at the start of each row.",
  "**Punch item detail:** shows number, description, status pill, a single person select labelled *Final approver* (its options read “Unassigned, Sara Haddad, …”), Additional personnel, Photos with an *Upload photo* button, and History. No location, assignee, priority, due date or trade is displayed. **New punch item** has Description, Priority, Due date, Final approver, and a 10-name checkbox list of Additional personnel.",
  "**Photos:** the grid renders six square tiles containing the first 8 characters of the attachment id (`photos/page.tsx:130`); no `<img>` is rendered on this screen.",
  "**Daily log:** the list and the detail heading show the date as a raw ISO timestamp (`2026-09-30T12:00:00.000Z`); the detail screen has a notes text area with Save and *Submit & lock*, nothing else. **New daily log** has Date and Notes.",
  "**Dashboard:** *Action required* list (3 cards with a “Review” button each) followed by *Key metrics*; punch-list status counts are printed as raw enum values (`ready_for_review`), and counts read “1 change orders”, “1 submittals”, “1 delayed schedule tasks”.",
  "**Permissions (390 px):** each label/select pair is laid out in a two-column flow in which the second column's labels overlap the first column's selects (e.g. “documents” drawn over “read ▾”); the page is 442 px wide at a 390 px viewport (14 px of forced horizontal scroll plus overlap). At 360 px the same page overflows further.",
  "**Gantt:** at 390 px only the task grid is visible (Task / Start / Finish / %); the timeline is not on screen. The toolbar (*Day / Week / Month / Quarter*, *Export PNG*) is wider than the screen; the page's layout width is 711 px in English and 690 px in Arabic (`data/overflow.json`).",
  "**Settings and Look-ahead:** long forms are single-column stacks of native inputs; the look-ahead date/week and horizon selects sit side by side. Settings shows the project's inbound e-mail address in a monospace field with a Copy button.",
  "**Companies (“Company branding”):** one card per company with a native file input showing “Choose File / No file chosen”, an *Upload logo* button, and Dashboard / Admin Console links.",
  "**Drawing detail:** the sample sheet renders in the viewer; markup tools are text pills (*Pin, Sketch, Cloud, Box, Ellipse, Arrow, Line, Text, Measure*); the viewer canvas is ~290 px wide at 390 px.",
  "**Dark scheme:** all 72 dark-scheme screenshots are byte-identical to their light counterparts.",
  "**768 px:** the sidebar column (all 31 module links in 6 groups) is permanently visible, global search appears in the header, and list tables show all columns.",
  "**360 px:** no new overflow appears on the list screens beyond what exists at 390 px (both already exceed the viewport by ~5 px); gantt and permissions overflow in both languages (`data/overflow.json`).",
];
for (const o of OBS) w(`- ${o}`);
w();

// ---------------- 5. density ----------------
w("## 5. Density audit (390 × 844, first viewport)");
w();
w("“Rows above the fold” counts list rows (`role=row` in tables, list items) whose bottom edge is inside the first 844 px. Header height and the y-position of the first heading show how much of the first viewport is chrome.");
w();
w("| Screen | Rows above fold (EN) | Rows above fold (AR) | Rows on page | Header px | First heading y | Page height px |");
w("|---|---|---|---|---|---|---|");
for (const p of sum.perScreen) w(`| ${p.screen} | ${p.rowsAboveFold} | ${p.rowsAboveFoldAr} | ${p.rowCount} | ${p.headerH} | ${p.firstH1Y ?? "—"} | ${p.scrollHeight} |`);
w();
const listScreens = sum.perScreen.filter((p) => p.rowCount > 1);
w(`On list screens the header occupies 97 px (53 px on screens without the project shell) and the first heading starts at ~153 px; the median list screen shows ${listScreens.map((p) => p.rowsAboveFold).sort((a, b) => a - b)[Math.floor(listScreens.length / 2)]} rows above the fold. Table rows are 40 px high and the table has a minimum width wider than the viewport, so trailing columns (e.g. Status on the punch list) are off-screen and reached by horizontal scroll.`);
w();
w("**Clipped controls** (a control whose right edge is beyond the 390 px viewport, measured in the DOM): " + `${sum.totals.screensWithClippedControls} of ${sum.totals.screens} screens. Examples:`);
w();
w("| Screen | Control | left px | width px |");
w("|---|---|---|---|");
for (const c of sum.clipped.slice(0, 25)) w(`| ${c.screen} | ${c.label || c.sig} | ${c.x} | ${c.w} |`);
w();

w("**Layout width vs viewport** (`measure/07-overflow.mjs`, 36 screens × 360/390 px × en/ar): the browser's layout width grows beyond the viewport when content overflows.");
w();
const ovf = J("overflow.json");
w("| Screen | Locale | Viewport | Layout width | Widest offending element |");
w("|---|---|---|---|---|");
for (const r of ovf.filter((x) => x.overflow && x.width === 390)) w(`| ${r.screen} | ${r.locale} | ${r.width} | ${r.innerWidth} | \`${(r.worst[0] ?? "").replace(/\|/g, "/")}\` |`);
w();
w(`At 390 px: ${ovf.filter((x) => x.overflow && x.width === 390 && x.locale === "en").length} English and ${ovf.filter((x) => x.overflow && x.width === 390 && x.locale === "ar").length} Arabic screens are wider than the viewport; at 360 px: ${ovf.filter((x) => x.overflow && x.width === 360 && x.locale === "en").length} English and ${ovf.filter((x) => x.overflow && x.width === 360 && x.locale === "ar").length} Arabic. Most are 5 px over (the Save-view bar); gantt and permissions are far wider.`);
w();

// ---------------- 6. latency ----------------
w("## 6. Interaction latency");
w();
w("Method: `MutationObserver` + `PerformanceObserver(event)` injected before load; time from `pointerdown`/`keydown` to the **first DOM change** (feedback) and to the settled state (network idle + 500 ms). 5 runs each, median shown. Rule: > 100 ms with no visible feedback = defect. **Local** = unthrottled, API/DB on localhost. **Emulated-mid-phone** = CPU 4× + 150 ms RTT (emulation).");
w();
w("| Interaction | Local: first change ms | Local: settled ms | Emulated: first change ms | Emulated: worst first change ms | Emulated: settled ms | > 100 ms (emulated median)? |");
w("|---|---|---|---|---|---|---|");
for (const [label, l] of Object.entries(perf.lat.local)) {
  const m = perf.lat["emulated-mid-phone"][label];
  w(`| ${label} | ${l.firstFeedbackMedianMs ?? "none"} | ${l.settledMedianMs} | ${m.firstFeedbackMedianMs ?? "none"} | ${m.firstFeedbackWorstMs ?? "none"} | ${m.settledMedianMs} | ${m.firstFeedbackMedianMs == null || m.firstFeedbackMedianMs > 100 ? "**yes**" : "no"} |`);
}
w();
w("Caveat: “first change” is the first DOM mutation of any kind (e.g. the drawer closing after a sidebar tap), not necessarily the destination's content; for route changes the *settled* column is when the destination is usable. No pressed-state/ripple feedback is measured (CSS `:active` produces no DOM mutation).");
w();

// ---------------- 7. load ----------------
w("## 7. Load performance and bundle size — three most-used screens");
w();
w("Punch list, RFIs and Dashboard (the modules used by the D1 field tasks). 5 cold-cache runs per cell, median. JS transferred = encoded bytes of `Script` responses (gzip as served by `next start`). TBT proxy = sum of (long task − 50 ms) after FCP. “Last long task end” is the nearest available stand-in for TTI. Lighthouse was not available.");
w();
w("| Profile | Screen | FCP ms | LCP ms | DCL ms | Load ms | TBT proxy ms | Last long task end ms | JS KB | Total KB | JS files | API calls |");
w("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [prof, o] of Object.entries(perf.load)) for (const [sc, v] of Object.entries(o)) { const m = v.median; w(`| ${prof} | ${sc} | ${m.fcp} | ${m.lcp} | ${m.dcl} | ${m.load} | ${m.tbt} | ${m.lastLongTaskEnd} | ${m.jsKB} | ${m.totalKB} | ${m.jsCount} | ${m.apiCalls} |`); }
w();
w("Build output (`next build`, static): shared first-load JS 103 kB; punch list 131 kB, RFIs 136 kB, dashboard 138 kB, punch item detail 143 kB, RFI detail 149 kB (route + shared, gzip).");
w();

// ---------------- 8. touch ----------------
w("## 8. Touch-target sweep (< 44 × 44 px)");
w();
w(`Measured with \`getBoundingClientRect()\` on every visible interactive element (links, buttons, inputs, selects, textareas, ARIA roles) at 390 px, English. A checkbox inside a \`<label>\` is measured as the label's box when that is larger. **${sum.totals.targetsUnder44} of ${sum.totals.targetsTotal}** interactive elements across ${sum.totals.screens} screens are smaller than 44 × 44 px in at least one dimension; **${sum.totals.targetsUnder24}** are smaller than 24 px in at least one dimension. Inline text links are included. Source locations are best-effort matches on the rendered class string (*exact* = the whole class string occurs on that line; *approx* = ≥ 70 % of its tokens do — verify before editing).`);
w();
w("| Screens | Element | Smallest size (w × h) | Source |");
w("|---|---|---|---|");
for (const t of sum.touch.slice(0, 40)) w(`| ${t.nScreens} | \`${t.sig}\` “${(t.label || "").replace(/\|/g, "/")}” | ${t.minW} × ${t.minH} | ${t.at ? "`" + t.at + "`" : "not located"} |`);
w();
w("Per-screen counts:");
w();
w("| Screen | Interactive elements | < 44 px | < 24 px | Clipped |");
w("|---|---|---|---|---|");
for (const p of sum.perScreen) w(`| ${p.screen} | ${p.targets} | ${p.targetsUnder44} | ${p.targetsUnder24} | ${p.clippedControls} |`);
w();

// ---------------- 9. contrast ----------------
w("## 9. Contrast sweep");
w();
w(`Method: foreground = computed \`color\`; background = median over 8 pixels sampled 3 px outside the text box in a 1× screenshot (so gradients and borders are handled locally). WCAG relative-luminance ratio. Checked ${sum.totals.textNodes} visible text nodes at 390 px English. **${sum.totals.under45}** are below 4.5 : 1 and **${sum.totals.under7}** are below 7 : 1 (large text = ≥ 24 px, or ≥ 18.66 px bold, is listed but the 4.5 threshold is applied to all text as the addendum specifies). Text with an accumulated CSS opacity < 1 (disabled controls) is blended toward its background before measuring; input/textarea **placeholder** text is included (measured from \`::placeholder\` against the field background). WCAG exempts disabled controls, so rows for disabled buttons (e.g. the pagination arrows and “Save view” when nothing is typed) are listed for completeness, not as violations. Sampling can be wrong where text overlaps images or gradients; the “worst” rows should be spot-checked in the screenshots.`);
w();
w("| Ratio (median) | Text | Foreground | Size | On screens | Source |");
w("|---|---|---|---|---|---|");
for (const c of sum.contrast.filter((x) => x.worst < 4.5).slice(0, 40)) w(`| ${c.worst}:1 | “${String(c.text).replace(/\|/g, "/")}” | ${c.fg} | ${c.size}px${c.large ? " (large)" : ""} | ${c.nScreens} | ${c.at ? "`" + c.at + "`" : "not located"} |`);
w();
w("Between 4.5 : 1 and 7 : 1 (AAA not met) there are " + sum.contrast.filter((x) => x.worst >= 4.5 && x.worst < 7).length + " distinct text/colour combinations; full list in `data/summary.json` (`contrast`).");
w();
w("Per-screen counts:");
w();
w("| Screen | Text nodes | < 4.5 : 1 | < 7 : 1 | Smallest font px |");
w("|---|---|---|---|---|");
for (const p of sum.perScreen) w(`| ${p.screen} | ${p.textNodes} | ${p.contrastUnder45} | ${p.contrastUnder7} | ${p.smallestFont ?? "—"} |`);
w();

// ---------------- 10. state coverage ----------------
w("## 10. State coverage (20 list screens)");
w();
w("Populated = seeded project. **Empty** = a real project with no records. **Loading** = every API response delayed 2.5 s, sampled at 0.9 s. **Error** = every API call answers HTTP 500. Detection is by visible text/spinner; captures are in `screenshots/state-*`. “Loading indicator” = a spinner/skeleton element or the word “Loading”.");
w();
w("| Module | Populated | Empty state | Loading indicator | Error message | Retry control |");
w("|---|---|---|---|---|---|");
for (const [k, v] of Object.entries(st.states)) w(`| ${k} | ✓ | ${k === "directory" ? "n/a (project always has members)" : v.empty.hasEmptyMessage ? "✓" : "✗"} | ${v.loading.hasLoadingIndicator ? "✓" : "✗"} | ${v.error.hasErrorMessage ? "✓" : "✗"} | ${v.error.hasRetry ? "✓" : "✗"} |`);
w();
const noLoad = Object.entries(st.states).filter(([, v]) => !v.loading.hasLoadingIndicator).length;
const noRetry = Object.entries(st.states).filter(([, v]) => !v.error.hasRetry).map(([k]) => k);
w(`Loading indicator absent on **${noLoad} of ${Object.keys(st.states).length}** screens (the page is blank or shows stale chrome while waiting). Retry control absent on: ${noRetry.join(", ")}.`);
w();

// ---------------- 11. offline ----------------
w("## 11. Offline behaviour per screen");
w();
w("Two tests on each of the 36 screens (English, 390 px): **cold** — the browser is offline when the screen is opened; **mid-session** — the screen was loaded online, the connection drops, then a filter/search/first control is used and the page is watched for 8 s. **P0** (Addendum D) = spinner-forever or unhandled error; a content area left blank with no message is counted as unhandled.");
w();
w("| Screen | Cold offline | Mid-session action | Spinner/“Loading” after 8 s | Error message shown | Retry control | Other | P0 |");
w("|---|---|---|---|---|---|---|---|");
let p0 = 0, blank = 0, misleading = 0;
for (const [k, v] of Object.entries(offAll)) {
  const cold = v.cold.navigationError ? "browser error page" : "rendered";
  const m = v.mid;
  const spin = m.spinner || m.loadingText;
  const isBlank = m.mainEmpty;
  const misl = /no .*(match|yet|found)/i.test(m.mainText) && !m.errorText;
  const isP0 = (spin && !m.errorText) || isBlank;
  if (isP0) p0 += 1;
  if (isBlank) blank += 1;
  if (misl) misleading += 1;
  w(`| ${k} | ${cold} | ${m.action} | ${spin ? "yes" : "no"} | ${m.errorText ? "yes" : "no"} | ${m.retryButton ? "yes" : "no"} | ${isBlank ? "blank content area" : misl ? "failure shown as “no results”" : "—"} | ${isP0 ? "**P0**" : "—"} |`);
}
w();
const coldFail = Object.values(offAll).filter((v) => v.cold.navigationError).length;
w(`Cold offline: **${coldFail} of ${Object.keys(offAll).length}** screens fail with the browser's own error page (there is no service worker or cached shell). Mid-session: **${p0}** screens end in a P0 state after 8 s (${blank} with a blank content area and no message; the rest a spinner/“Loading” with no error). **${misleading}** screens present the offline failure as an empty result (“No … match your search”) instead of an error.`);
w();
w("Writes while offline (web):");
w();
w(`- **Create punch item** submitted offline: stays on the form; the error text shown is \`${(st.offline.writePunchCreate.alerts ?? []).filter((x) => x.length > 2).slice(-1)[0] ?? "(none captured)"}\`; the typed description is kept (${st.offline.writePunchCreate.descriptionKept ? "yes" : "no"}); nothing is queued.`);
w(`- **Add RFI response** submitted offline: stays on the page; message shown: “${(st.offline.writeRfiResponse.alerts ?? []).filter((x) => x.length > 2).slice(-1)[0] ?? "(none)"}”; typed text kept (${st.offline.writeRfiResponse.kept ? "yes" : "no"}); nothing is queued.`);
w("- **Sidebar link tapped offline** (12 screens tested in an earlier pass, `data/states-offline.json`): the navigation drawer stays open on the current page with no message and no spinner.");
w("- **Hard reload offline** (punch list, RFIs, daily log): `net::ERR_INTERNET_DISCONNECTED`.");
w();
w("Mobile (static): punch items, daily logs and inspections are read from and written to a local SQLite database with an outbox synchronised through `/sync/pull` and `/sync/push` (`apps/mobile/lib/sync/sync-engine.ts`); every other mobile screen fetches over the network on mount and shows `common.errorGeneric` or a plain “Loading” text on failure.");
w();

// ---------------- 12. other facts ----------------
w("## 12. Other facts recorded during the audit");
w();
const OTHER = [
  "Punch-item data model vs UI: the API create schema (`packages/shared/src/schemas/punch-item.schema.ts`) accepts `locationId`, `assigneeUserId`, `assigneeCompanyId`, `trade`, `priority`, `dueDate`, `finalApproverUserId` and distribution lists; the web create form sends only description, priority, due date, final approver and distribution. The database holds 61 locations for the seeded project that no web screen displays.",
  "Daily-log data model vs UI: tables for manpower, equipment, deliveries, delays and safety incidents exist (`daily_log_*`); the web daily-log screens expose the notes field only.",
  "Error text: the raw string `unknown_error` is rendered as user-facing error text in 9 places under `apps/web/app` (observed on New punch item, punch item detail and New daily log when offline).",
  "List rows are `div[role=row]` elements with an `onClick` handler (`router.push`), not links; opening a record in a new tab is not possible from a list row.",
  "Auth: the access token is stored in `localStorage` (`siteops.auth`); it lives 15 minutes; the API client refreshes it on demand.",
  "No `dark:` Tailwind variant appears anywhere in `apps/web`; no `manifest`, service worker, `navigator.onLine` or `online`/`offline` listener exists in `apps/web`.",
  "Mobile (static): no camera/image-picker dependency; no `useColorScheme`/`Appearance` use although `app.json` sets `userInterfaceStyle: automatic`; no `I18nManager` call was found for RTL, so Arabic layout mirroring on device is unverified.",
  "`POST /projects` → HTTP 500 (RLS violation) in this environment; the web app has no “new project” control, so this is only reachable by API.",
  "Build: `next build` type-checking is disabled in `next.config.mjs` (`typescript.ignoreBuildErrors: true`) because of a false positive on a generated layout type; type safety is enforced by a separate `typecheck` script.",
];
for (const o of OTHER) w(`- ${o}`);
w();
w("## 13. Scripts and data");
w();
w("| File | Purpose |");
w("|---|---|");
w("| `measure/00-seed-audit-extras.mjs` | Test-data top-up (fixture, not product code) |");
w("| `measure/01-inventory.mjs` | Route/link inventory and navigation graph |");
w("| `measure/02-tasks-web.mjs` | D1 task walkthroughs (EN/AR) |");
w("| `measure/03-sweep.mjs` | Screenshots + density/touch/contrast collection |");
w("| `measure/04-states-offline.mjs`, `04b-offline-all.mjs` | State coverage and offline behaviour |");
w("| `measure/05-perf.mjs` | Latency and load metrics |");
w("| `measure/06-summarize.mjs` | Aggregation + source mapping |");
w("| `measure/08-build-docs.mjs` | Generates this file and TASK_BENCHMARKS.md |");
w("| `data/*.json` | Raw results |");
w();
fs.writeFileSync(path.join(ROOT, "docs/ux/AUDIT_EVIDENCE.md"), b);
console.log("wrote docs");
