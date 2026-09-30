// Stage 1 — static route/screen inventory for apps/web.
// Reads page files + every literal link target (href=, router.push/replace, entity path maps),
// resolves them to route patterns, and emits docs/ux/data/inventory.json + docs/ux/data/nav-graph.mmd.
// Static analysis of source is used ONLY to enumerate routes and link targets; behaviour is measured in 02+.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../../../apps/web");
const outDir = path.resolve(here, "../data");
fs.mkdirSync(outDir, { recursive: true });

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const appRoot = path.join(web, "app/[locale]");
const pages = walk(appRoot).filter((f) => f.endsWith("/page.tsx"));
const routeOf = (f) => "/" + path.relative(appRoot, path.dirname(f)).replace(/\\/g, "/");
const routes = pages.map((f) => ({ file: path.relative(web, f), route: routeOf(f) === "/." ? "/" : routeOf(f) }));
const routeRegex = (r) => new RegExp("^" + r.replace(/\[[^\]]+\]/g, "[^/]+") + "$");
const dynCount = (r) => (r.match(/\[/g) || []).length;
const routeMatchers = routes.map((r) => ({ ...r, re: routeRegex(r.route) })).sort((a, b) => dynCount(a.route) - dynCount(b.route)); // static routes win over [param] routes

const srcFiles = [...walk(path.join(web, "app")), ...walk(path.join(web, "components"))].filter((f) => /\.tsx?$/.test(f));

const edges = []; // {from: route|"SHELL:xxx", to: route, via}
const sourceRoute = (f) => {
  const rel = path.relative(web, f);
  const m = routes.find((r) => r.file === rel);
  if (m) return m.route;
  // layout/component => shell
  return "SHELL:" + path.basename(f);
};

function normalise(t) {
  return t
    .replace(/^\/\$\{locale\}/, "")
    .replace(/\$\{[^}]+\}/g, "*")
    .replace(/\?.*$/, "");
}
function resolve(t) {
  const n = normalise(t);
  if (n === "" || n === "/") return "/";
  const hit = routeMatchers.find((r) => r.re.test(n.replace(/\*/g, "x")));
  return hit ? hit.route : null;
}

const linkRe = /(?:href=\{?|router\.(?:push|replace)\()[`"'](\/[^`"']*)[`"']/g;
const unresolved = [];
for (const f of srcFiles) {
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = linkRe.exec(src))) {
    const tgt = resolve(m[1]);
    const from = sourceRoute(f);
    if (tgt) edges.push({ from, to: tgt, via: path.relative(web, f) });
    else unresolved.push({ from, raw: m[1], via: path.relative(web, f) });
  }
}

// Sidebar (ProjectSidebar.tsx): every segment is reachable from every /projects/[id]/* screen via shell.
const sidebarSrc = fs.readFileSync(path.join(web, "components/shell/ProjectSidebar.tsx"), "utf8");
const segments = [...sidebarSrc.matchAll(/segment: "([^"]+)"/g)].map((m) => m[1]);
for (const s of segments) {
  const tgt = routes.find((r) => r.route === `/projects/[id]/${s}`);
  if (tgt) edges.push({ from: "SHELL:ProjectSidebar", to: tgt.route, via: "components/shell/ProjectSidebar.tsx" });
}
// Non-literal navigation sources (verified by reading the code):
const dyn = [
  ["SHELL:NotificationBell", "/projects/[id]/rfis/[rfiId]", "NotificationBell.entityPath"],
  ["SHELL:NotificationBell", "/projects/[id]/submittals/[submittalId]", "NotificationBell.entityPath"],
  ["SHELL:NotificationBell", "/projects/[id]/punch-list/[itemId]", "NotificationBell.entityPath"],
  ["SHELL:NotificationBell", "/projects/[id]/change-orders/[changeOrderId]", "NotificationBell.entityPath"],
  ["SHELL:GlobalSearch", "/projects/[id]/dashboard", "search.service path"],
  ["SHELL:GlobalSearch", "/companies", "search.service path"],
  ["SHELL:GlobalSearch", "/projects/[id]/rfis/[rfiId]", "search.service path"],
  ["SHELL:GlobalSearch", "/projects/[id]/submittals/[submittalId]", "search.service path"],
  ["SHELL:GlobalSearch", "/projects/[id]/documents", "search.service path"],
  ["SHELL:GlobalSearch", "/projects/[id]/drawings/[drawingId]", "search.service path"],
  ["SHELL:GlobalSearch", "/projects/[id]/daily-log/[logId]", "search.service path"],
  ["SHELL:GlobalSearch", "/projects/[id]/schedule/[taskId]", "search.service path"],
  ["SHELL:GlobalSearch", "/projects/[id]/directory", "search.service path"],
  ["SHELL:ProjectSelector", "/projects/[id]/dashboard", "ProjectSelector router.push(nextId/currentSegment||dashboard)"],
  ["/login", "/projects", "login router.replace"],
  ["/", "/projects", "root redirect"],
  ["/", "/login", "root redirect"],
  ["/projects/[id]/dashboard", "/projects/[id]/rfis", "ACTION_LINKS"],
  ["/projects/[id]/dashboard", "/projects/[id]/submittals", "ACTION_LINKS"],
  ["/projects/[id]/dashboard", "/projects/[id]/schedule", "ACTION_LINKS"],
  ["/projects/[id]/dashboard", "/projects/[id]/change-orders", "ACTION_LINKS"],
];
for (const [from, to, via] of dyn) edges.push({ from, to, via });

// Uniq
const key = (e) => `${e.from}->${e.to}`;
const uniq = [...new Map(edges.map((e) => [key(e), e])).values()];

// Inbound classification
const inbound = new Map(routes.map((r) => [r.route, { page: [], shell: [], selfOnly: true }]));
for (const e of uniq) {
  const rec = inbound.get(e.to);
  if (!rec) continue;
  if (e.from === e.to) continue;
  if (e.from.startsWith("SHELL:")) rec.shell.push(e.from.replace("SHELL:", ""));
  else rec.page.push(e.from);
}
const outbound = new Map(routes.map((r) => [r.route, new Set()]));
for (const e of uniq) if (outbound.has(e.from) && e.from !== e.to) outbound.get(e.from).add(e.to);

// Shell outbound (present on every /projects/[id]/* route): sidebar => 33 segments; header search; bell.
const inProjectShell = (r) => r.startsWith("/projects/[id]/");

const detailRoutes = routes.filter((r) => /\/\[[^\]]+\]$/.test(r.route) && !r.route.startsWith("/companies"));
const inventory = routes.map((r) => {
  const inb = inbound.get(r.route);
  const out = [...outbound.get(r.route)];
  const isDetail = /\/\[[^\]]+\]$/.test(r.route);
  const onlyShellInbound = inb.page.length === 0;
  const kind = r.route === "/" ? "redirect" : isDetail ? "detail" : /\/new$/.test(r.route) ? "create" : "list/screen";
  return {
    route: r.route,
    file: r.file,
    kind,
    inboundFromPages: [...new Set(inb.page)],
    inboundFromShell: [...new Set(inb.shell)],
    outboundPageLinks: out,
    // A route is an "orphan" if nothing in any page/shell links to it.
    orphan: inb.page.length === 0 && inb.shell.length === 0 && r.route !== "/",
    // "Shell-only": reachable only via sidebar/search/bell, never contextually from another screen.
    shellOnly: inb.page.length === 0 && inb.shell.length > 0,
    // Dead end: no outbound page-level link to any route other than itself (shell chrome excluded).
    deadEnd: out.length === 0,
  };
});

// Sibling-reach: does a detail page link/route to another instance of the same pattern (prev/next/related)?
const siblingReach = detailRoutes.map((r) => {
  const src = fs.readFileSync(path.join(web, routes.find((x) => x.route === r.route).file), "utf8");
  const samePattern = uniq.filter((e) => e.from === r.route && e.to === r.route).length;
  const hasPrevNext = /(prev(ious)?|next)(Item|Rfi|Snag|Id|Sibling)/i.test(src) || /siblings?/i.test(src);
  return { route: r.route, selfLinks: samePattern, prevNext: hasPrevNext };
});

fs.writeFileSync(path.join(outDir, "inventory.json"), JSON.stringify({ inventory, unresolved, siblingReach, sidebarSegments: segments }, null, 2));

// Mermaid graph: nodes = list/screen routes; detail as sub-nodes; shell hub aggregated.
const id = (r) => "n" + r.replace(/[^a-z0-9]/gi, "_");
let mm = "flowchart LR\n";
mm += '  SHELL(["App shell (sidebar · header search · bell · project selector)"])\n';
for (const r of routes) {
  const inv = inventory.find((x) => x.route === r.route);
  const label = r.route.replace("/projects/[id]", "P").replace("/companies", "C");
  const flag = [inv.orphan && "ORPHAN", inv.shellOnly && !inv.orphan && "shell-only", inv.deadEnd && "dead-end"].filter(Boolean).join(", ");
  mm += `  ${id(r.route)}["${label}${flag ? "<br/>" + flag : ""}"]\n`;
}
for (const e of uniq) {
  if (e.from.startsWith("SHELL:") || e.to === "/login") continue; // session-expiry redirects to /login from every page are omitted to keep the graph legible
  if (e.from === e.to) continue;
  mm += `  ${id(e.from)} --> ${id(e.to)}\n`;
}
for (const s of segments) {
  const tgt = `/projects/[id]/${s}`;
  if (routes.some((r) => r.route === tgt)) mm += `  SHELL -.-> ${id(tgt)}\n`;
}
for (const s of siblingReach.filter((s) => s.selfLinks === 0)) {
  mm += `  ${id(s.route)}:::nosibling\n`;
}
mm += "  classDef nosibling stroke:#c00,stroke-width:3px,stroke-dasharray:4 2\n";
fs.writeFileSync(path.join(outDir, "nav-graph.mmd"), mm);

const summary = {
  pages: routes.length,
  sidebarEntries: segments.length,
  orphans: inventory.filter((i) => i.orphan).map((i) => i.route),
  shellOnly: inventory.filter((i) => i.shellOnly && !i.orphan).map((i) => i.route),
  deadEnds: inventory.filter((i) => i.deadEnd).map((i) => i.route),
  detailNoSibling: siblingReach.filter((s) => s.selfLinks === 0).map((s) => s.route),
  unresolvedCount: unresolved.length,
};
fs.writeFileSync(path.join(outDir, "inventory-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log("unresolved:", unresolved.slice(0, 20));
