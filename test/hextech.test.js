import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../ui/src/hextech-view.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function module(invoke = async () => { throw new Error("unexpected call"); }) {
  const exports = {};
  new Function("exports", "require", code)(exports, name => { assert.equal(name, "@tauri-apps/api/core"); return { invoke }; });
  return exports;
}
const { selectHexRunes, sortHexRows } = module();
const runes = Array.from({ length: 37 }, (_, i) => ({ id: i, name: "符文" + i, quality: i % 2 ? "kGold" : "kSilver", strength: i % 3 ? "A" : "S", pickRate: i, rank: i + 1 }));
test("hero rune filters combine rarity and search, paginate ten rows, and clamp empty pages", () => {
  const all = selectHexRunes(runes, "all", "", { field: "strength", asc: false }, 1);
  assert.equal(all.total, 37); assert.equal(all.pages, 4); assert.equal(all.rows.length, 10); assert.equal(all.rows[0].strength, "S"); assert.equal(all.rows[0].pickRate, 36);
  const gold = selectHexRunes(runes, "kGold", "符文1", { field: "pickRate", asc: true }, 9);
  assert.equal(gold.total, 6); assert.equal(gold.page, 1); assert.deepEqual(gold.rows.map(r => r.pickRate), [1, 11, 13, 15, 17, 19]);
  const empty = selectHexRunes(runes, "kPrismatic", "", { field: "pickRate", asc: false }, 5);
  assert.equal(empty.total, 0); assert.equal(empty.page, 1); assert.equal(empty.pages, 1);
});
test("grade sorting uses official strength separately from quality and never mutates data", () => {
  const input = [{ strength: "C", quality: "kPrismatic", pickRate: 50 }, { strength: "S", quality: "kSilver", pickRate: 5 }];
  assert.equal(sortHexRows(input, { field: "strength", asc: false })[0].quality, "kSilver");
  assert.equal(sortHexRows(input, { field: "strength", asc: true })[0].strength, "C");
  assert.equal(input[0].strength, "C");
});
const escape = s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const heroes = [120, 22].map((id, i) => ({ id, name: i ? "寒冰射手" : "战争之影", title: i ? "艾希" : "赫卡里姆", roles: ["fighter"], rank: i + 1, tier: "T0", winRate: 55.78, pickRate: 11.78, pickChange: null }));
const detail = id => ({ heroId: id, statsDate: "20261019", hero: heroes.find(h => h.id === id), runes: [{ ...runes[0], name: '<img src=x onerror="bad">', pickRate: 24.65 }], spells: [], skills: [], equipment: [], partners: [], warnings: [] });
function deferred() { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; }
function controller(invoke, isNative = true) {
  const { createHextechView } = module(invoke);
  const view = createHextechView({ isNative, render() {}, escape, icon: () => "", image: () => "" });
  function click(selector, dataset = {}) {
    let listener;
    const element = { dataset, classList: { contains: () => false }, addEventListener: (_event, fn) => listener = fn };
    view.bind({ querySelectorAll: key => key === selector ? [element] : [], querySelector: () => null });
    listener({ target: element });
  }
  return { view, click };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test("late hero responses cannot replace the currently selected hero or reopen closed details", async () => {
  const first = deferred(), second = deferred();
  const { view, click } = controller(async (command, args) => command === "get_hextech_ranking" ? { statsDate: "20261019", heroes, warnings: [] } : args.heroId === 120 ? first.promise : second.promise);
  await view.loadRanking();
  click("[data-hex-hero]", { hexHero: "120" }); click("[data-hex-hero]", { hexHero: "22" });
  second.resolve(detail(22)); await settle(); first.resolve(detail(120)); await settle();
  const html = view.renderPage("");
  assert.match(html, /寒冰射手 · 艾希/); assert.doesNotMatch(html, /<h2>战争之影/);
  assert.match(html, /2026-10-19/); assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;>/);
  assert.match(html, /24.65%/); assert.equal(view.closeDetail(), true); assert.doesNotMatch(view.renderPage(""), /role="dialog"/);
  assert.equal(view.closeDetail(), false);
});
test("official failures display retryable errors and browser preview cannot invent official stats", async () => {
  let calls = 0;
  const { view } = controller(async () => { if (++calls === 1) throw new Error("官网暂不可用"); return { statsDate: "20261019", heroes, warnings: [] }; });
  await view.loadRanking(); assert.match(view.renderPage(""), /官网暂不可用/);
  await view.loadRanking(true); assert.match(view.renderPage(""), /战争之影/); assert.doesNotMatch(view.renderPage(""), /官网暂不可用/);
  const browser = controller(async () => assert.fail("native call in browser"), false);
  await browser.view.loadRanking(); assert.match(browser.view.renderPage(""), /请在桌面应用中/);
});

test("closing a pending detail prevents the response from reopening the dialog", async () => {
  const pending = deferred();
  const { view, click } = controller(async command => command === "get_hextech_ranking" ? { statsDate: "20261019", heroes, warnings: [] } : pending.promise);
  await view.loadRanking(); click("[data-hex-hero]", { hexHero: "120" });
  assert.equal(view.isOpen(), true); view.closeDetail();
  pending.resolve(detail(120)); await settle();
  assert.equal(view.isOpen(), false); assert.doesNotMatch(view.renderPage(""), /role="dialog"/);
});
