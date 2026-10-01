// Stage 1 -- turn the raw sweep metrics into tables + map offending elements back to file:line (best match on class string / label).
import fs from "node:fs";
import path from "node:path";
import { ROOT, DATA } from "./lib.mjs";

const m = JSON.parse(fs.readFileSync(path.join(DATA, "sweep-metrics.json"), "utf8"));
const WEB = path.join(ROOT, "apps/web");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, acc) : /\.tsx$/.test(e.name) && acc.push(p);
  }
  return acc;
}
const files = [...walk(path.join(WEB, "app")), ...walk(path.join(WEB, "components"))].map((f) => ({ f, lines: fs.readFileSync(f, "utf8").split("\n") }));

const cache = new Map();
/** Best-effort mapping from a rendered element back to source. exact = the whole class string occurs on one line; approx = >=70% of its tokens do. Verify before relying on an "approx" hit. */
function locate(cls, hint) {
  const key = cls + "|" + hint;
  if (cache.has(key)) return cache.get(key);
  const tokens = cls.split(/\s+/).filter(Boolean);
  const exact = [];
  let best = null;
  for (const { f, lines } of files) {
    lines.forEach((ln, i) => {
      const at = `${path.relative(ROOT, f)}:${i + 1}`;
      if (cls && ln.includes(cls)) { exact.push(at); return; }
      if (!tokens.length) return;
      const ratio = tokens.filter((t) => ln.includes(t)).length / tokens.length;
      if (ratio >= 0.7) {
        const score = ratio * 10 + (hint && ln.includes(hint) ? 1 : 0);
        if (!best || score > best.score) best = { score, at };
      }
    });
  }
  let out = null;
  if (exact.length) out = exact.slice(0, 3).join(" · ") + (exact.length > 3 ? ` (+${exact.length - 3} more)` : "") + " (exact)";
  else if (best) out = `${best.at} (approx)`;
  else if (hint === "English" || hint === "العربية") out = "apps/web/components/LanguageToggle.tsx:28 (manual)";
  cache.set(key, out);
  return out;
}

const screens = Object.keys(m);
const perScreen = [];
const targetAgg = new Map();
const contrastAgg = new Map();
const clipped = [];

for (const s of screens) {
  const e = m[s].en;
  const a = m[s].ar;
  const small = e.targets.filter((t) => t.w < 44 || t.h < 44);
  const off = e.targets.filter((t) => t.x + t.w > 391 || t.x < -1);
  for (const t of off) clipped.push({ screen: s, ...t });
  for (const t of small) {
    const k = `${t.sig}|${t.label}|${t.cls}`;
    const g = targetAgg.get(k) ?? { sig: t.sig, label: t.label, cls: t.cls, minW: 999, minH: 999, screens: new Set(), count: 0 };
    g.minW = Math.min(g.minW, t.w);
    g.minH = Math.min(g.minH, t.h);
    g.screens.add(s);
    g.count += 1;
    targetAgg.set(k, g);
  }
  const low = e.contrast.filter((c) => c.ratio < 4.5);
  const low7 = e.contrast.filter((c) => c.ratio < 7);
  for (const c of low7) {
    const k = `${c.t}|${c.fg}|${c.size}`;
    const g = contrastAgg.get(k) ?? { text: c.t, fg: c.fg, size: c.size, weight: c.weight, worst: 99, large: c.large, cls: c.cls, screens: new Set() };
    g.worst = Math.min(g.worst, c.ratio);
    g.screens.add(s);
    contrastAgg.set(k, g);
  }
  perScreen.push({
    screen: s,
    rowsAboveFold: e.rowsAbove, rowCount: e.rowCount, firstH1Y: e.firstContentY, headerH: e.headerH, scrollHeight: e.scrollHeight,
    rowsAboveFoldAr: a.rowsAbove,
    targets: e.targets.length, targetsUnder44: small.length,
    targetsUnder24: e.targets.filter((t) => t.w < 24 || t.h < 24).length,
    textNodes: e.contrast.length, contrastUnder45: low.length, contrastUnder7: low7.length,
    contrastUnder45Large: low.filter((c) => c.large).length,
    smallestFont: e.fontSizes[0], fontSizes: e.fontSizes,
    clippedControls: off.length,
  });
}

const touch = [...targetAgg.values()]
  .map((g) => ({ ...g, screens: [...g.screens], nScreens: g.screens.size, at: locate(g.cls, g.label) }))
  .sort((x, y) => y.nScreens - x.nScreens || y.count - x.count);
const contrast = [...contrastAgg.values()].map((g) => ({ ...g, screens: [...g.screens], nScreens: g.screens.size, at: locate(g.cls, g.text) })).sort((x, y) => x.worst - y.worst);

const totals = {
  screens: screens.length,
  targetsTotal: perScreen.reduce((a, s) => a + s.targets, 0),
  targetsUnder44: perScreen.reduce((a, s) => a + s.targetsUnder44, 0),
  targetsUnder24: perScreen.reduce((a, s) => a + s.targetsUnder24, 0),
  textNodes: perScreen.reduce((a, s) => a + s.textNodes, 0),
  under45: perScreen.reduce((a, s) => a + s.contrastUnder45, 0),
  under7: perScreen.reduce((a, s) => a + s.contrastUnder7, 0),
  screensWithClippedControls: new Set(clipped.map((c) => c.screen)).size,
};
fs.writeFileSync(path.join(DATA, "summary.json"), JSON.stringify({ totals, perScreen, touch, contrast, clipped }, null, 2));
console.log(totals);
console.log("top touch offenders:");
for (const t of touch.slice(0, 25)) console.log(`${String(t.nScreens).padStart(2)} screens  ${t.sig} "${t.label}" min ${t.minW}x${t.minH}  ${t.at ?? "(source not located)"}`);
console.log("worst contrast:");
for (const c of contrast.slice(0, 15)) console.log(`${c.worst}:1  "${c.text}" ${c.fg} ${c.size}px${c.large ? " (large)" : ""} on ${c.nScreens} screens ${c.at ?? ""}`);
console.log("clipped controls:", clipped.slice(0, 10).map((c) => `${c.screen}:${c.label} x${c.x}+${c.w}`));
