import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function compile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function evaluate(code, imports, globals = {}) {
  const exports = {};
  const require = (name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  };
  new Function("exports", "require", ...Object.keys(globals), code)(exports, require, ...Object.values(globals));
  return exports;
}

const { demoProfile, DEFAULT_PREFERENCES } = evaluate(compile("../ui/src/data/mock.ts"), {});
const serviceCode = compile("../ui/src/services/profile.ts");
function service(invoke = async () => { throw new Error("Unexpected native call"); }) {
  return evaluate(serviceCode, { "../data/mock.ts": { demoProfile }, "@tauri-apps/api/core": { invoke } });
}
const { getProfileSummary, summarizeProfile } = service();

const now = new Date(2026, 9, 15, 12).getTime();
const hours = 60 * 60 * 1000;

function match(id, overrides = {}) {
  return {
    id, championId: 67, champion: "薇恩", result: "win", mode: "排位赛", role: "下路",
    kills: 6, deaths: 2, assists: 4, cs: 204, durationSeconds: 1704, playedAtMs: now - hours,
    ...overrides,
  };
}

function profile(matches, overrides = {}) {
  return {
    summoner: { name: "当前玩家", tag: "CN1", region: "艾欧尼亚", level: 186, iconPath: null },
    rank: null,
    matches,
    assets: { championsOwned: 92, championsTotal: 171, skinsOwned: 10, skinsTotal: 1137 },
    warnings: [], updatedAtMs: now,
    ...overrides,
  };
}

test("profile summarizes the latest five matches, excludes remakes, and counts local favorites", () => {
  const result = summarizeProfile(profile([
    match("older", { result: "loss", playedAtMs: now - 48 * hours }),
    match("1"), match("2", { result: "loss" }), match("3"),
    match("4", { result: "remake" }), match("5"),
    match("1"),
  ]), 7, now);
  assert.equal(result.source, "client");
  assert.equal(result.matchCount, 6);
  assert.equal(result.recentGames.length, 5);
  assert.equal(result.recentGames[0].championId, 67);
  assert.equal(result.topChampions[0].championId, 67);
  assert.equal(result.recentWinRate, 75);
  assert.equal(result.recentWinRateSampleSize, 4);
  assert.equal(result.assets.favorites, 7);
  assert.equal(result.recentGames[0].kda, "6 / 2 / 4");
  assert.equal(result.recentGames[0].duration, "28:24");
  assert.equal(result.recentGames[0].playedAt, "1 小时前");
  assert.equal(result.topChampions[0].games, 5);
  assert.equal(result.topChampions[0].winRate, 60);
});

test("empty and unavailable history remain distinct and never invent statistics", () => {
  for (const matches of [[], null]) {
    const result = summarizeProfile(profile(matches), 0, now);
    assert.equal(result.matchHistoryAvailable, matches !== null);
    assert.equal(result.recentWinRate, null);
    assert.equal(result.trends.averageKda, null);
    assert.equal(result.trends.averageWinRate, null);
    assert.equal(result.trends.sampleSize, 0);
    assert.deepEqual(result.trends.winRate, Array(7).fill(null));
    assert.deepEqual(result.topChampions, []);
    assert.equal(result.preferredRole, null);
  }
});

test("daily trends respect local calendar boundaries and distinguish zero wins from no matches", () => {
  const todayStart = new Date(2026, 9, 15).getTime();
  const weekStart = new Date(2026, 9, 9).getTime();
  const result = summarizeProfile(profile([
    match("today-loss", { result: "loss", playedAtMs: todayStart }),
    match("yesterday-win", { playedAtMs: todayStart - 1, deaths: 0 }),
    match("week-start", { playedAtMs: weekStart }),
    match("too-old", { playedAtMs: weekStart - 1 }),
    match("future", { playedAtMs: now + hours }),
    match("remake", { result: "remake" }),
  ]), 0, now);
  assert.equal(result.trends.sampleSize, 3);
  assert.equal(result.trends.averageWinRate, 67);
  assert.equal(result.trends.winRate[0], 100);
  assert.equal(result.trends.winRate[1], null);
  assert.equal(result.trends.winRate[5], 100);
  assert.equal(result.trends.winRate[6], 0);
  assert.equal(result.trends.kda[5], 10);
  assert.ok(Number.isFinite(result.trends.averageKda));
});

test("preferred role uses only matches with an explicit lane and top champions use the same history", () => {
  const result = summarizeProfile(profile([
    match("aram-1", { championId: 22, champion: "艾希", role: null, mode: "海克斯大乱斗" }),
    match("aram-2", { championId: 22, champion: "艾希", role: null }),
    match("bot-1"), match("bot-2"), match("support", { role: "辅助" }),
  ]), 0, now);
  assert.deepEqual(result.preferredRole, { name: "下路", share: 67, sampleSize: 3 });
  assert.equal(result.topChampions[0].name, "薇恩");
  assert.equal(result.topChampions[0].games, 3);
  assert.equal(result.topChampions[1].role, "");
});

test("unavailable assets and section warnings survive profile conversion", () => {
  const result = summarizeProfile(profile(null, {
    assets: { championsOwned: null, championsTotal: null, skinsOwned: 0, skinsTotal: 0 },
    warnings: ["对局记录暂时无法读取"],
  }), 2, now);
  assert.equal(result.assets.championsOwned, null);
  assert.equal(result.assets.skinsOwned, 0);
  assert.deepEqual(result.warnings, ["对局记录暂时无法读取"]);
});

test("browser preview is explicitly demo data and does not share mutable state", async () => {
  const first = await getProfileSummary(false, 3);
  first.summoner.name = "changed";
  const second = await getProfileSummary(false, 1);
  assert.equal(second.source, "demo");
  assert.equal(second.assets.favorites, 1);
  assert.notEqual(second.summoner.name, "changed");
});

test("native profile reading uses IPC and keeps statistics when the avatar is unavailable", async () => {
  const calls = [];
  const native = service(async (command, args) => {
    calls.push({ command, args });
    if (command === "get_profile") return profile([], {
      summoner: { ...profile([]).summoner, iconPath: "/lol-game-data/assets/v1/profile-icons/1.jpg" },
    });
    throw new Error("Image unavailable");
  });
  const result = await native.getProfileSummary(true, 8);
  assert.equal(result.source, "client");
  assert.equal(result.summoner.name, "当前玩家");
  assert.equal(result.summoner.avatarUrl, null);
  assert.equal(result.assets.favorites, 8);
  assert.deepEqual(calls.map((call) => call.command), ["get_profile", "get_skin_image"]);
});

test("native profile failure is surfaced without falling back to a demo account", async () => {
  const native = service(async () => { throw new Error("Account unavailable"); });
  await assert.rejects(native.getProfileSummary(true, 0), /Account unavailable/);
});

const pageCode = compile("../ui/src/main.ts") + `\nexports.testing = {
  receiveSnapshot, hydrateProfileData, reconnectClient, refreshProfileIfNeeded, renderSettingsPage,
  state: () => ({ snapshot, profileData, profileLoading, profileError }),
};`;
const disconnected = {
  connection: "disconnected", phase: "Disconnected", active: false, contextId: null,
  championId: null, championName: null, selectedSkinId: null, writeEnabled: false,
  writeBlockReason: null, skins: [], revision: 1, updatedAtMs: now,
};
const connected = { ...disconnected, connection: "ready", phase: "None", revision: 2 };
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function page({ initial = disconnected, read = async () => summarizeProfile(profile([]), 0, now), storedPreferences = {} } = {}) {
  const app = { innerHTML: "", dataset: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const document = { querySelector: (selector) => selector === "#app" ? app : null, activeElement: null, hidden: false, addEventListener() {} };
  let snapshotListener;
  let reads = 0;
  const nativeCalls = [];
  const window = {
    __TAURI_INTERNALS__: {}, location: { hash: "#profile" }, history: { replaceState() {} },
    localStorage: { getItem: (key) => storedPreferences[key] ?? null, setItem() {} }, addEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  };
  const result = evaluate(pageCode, {
    "@tauri-apps/api/core": { invoke: async (command, args) => {
      nativeCalls.push({ command, args });
      return command === "get_snapshot" ? await initial : false;
    } },
    "@tauri-apps/api/event": { listen: async (_name, callback) => { snapshotListener = callback; return () => {}; } },
    "@tauri-apps/api/window": { getCurrentWindow: () => ({
      onResized: async () => () => {},
      isMaximized: async () => false,
    }) }, lucide: { createIcons() {} },
    "./data/mock": { DEFAULT_PREFERENCES },
    "./services/mock": { getChampionStats: async () => [], getAugmentStats: async () => [], getAssistantLogs: async () => [] },
    "./services/profile": { getProfileSummary: async () => { reads += 1; return read(); } },
    "./styles.css": {},
  }, { window, document });
  return { app, testing: result.testing, nativeCalls, reads: () => reads, emit: (snapshot) => snapshotListener({ payload: snapshot }) };
}

test("startup clears topmost state and ignores legacy enabled preferences", async () => {
  for (const storedPreferences of [{}, {
    "lol-skin-assistant:window-preferences": JSON.stringify({ alwaysOnTop: true }),
    "lol-skin-assistant:app-preferences": JSON.stringify({ alwaysOnTop: true, themeMode: "light" }),
  }]) {
    const ui = page({ storedPreferences });
    await settle();
    assert.deepEqual(ui.nativeCalls.filter(({ command }) => /always_on_top/.test(command)), [
      { command: "disable_always_on_top", args: {} },
    ]);
    assert.doesNotMatch(ui.testing.renderSettingsPage(), /置顶|alwaysOnTop/);
    assert.match(ui.app.innerHTML, /data-action="minimize"/);
    assert.match(ui.app.innerHTML, /data-action="maximize"/);
    assert.match(ui.app.innerHTML, /data-action="close"/);
    assert.doesNotMatch(ui.app.innerHTML, /data-action="top"/);
  }
});

test("disconnected profile shows a waiting state and never requests a demo account", async () => {
  const ui = page();
  await settle();
  assert.equal(ui.reads(), 0);
  assert.match(ui.app.innerHTML, /等待英雄联盟客户端/);
  assert.doesNotMatch(ui.app.innerHTML, /薇恩玩家|正在加载召唤师数据/);
});

test("profile champion icons use numeric client IDs in recent games and most played", async () => {
  const ui = page({ initial: connected, read: async () => summarizeProfile(profile([match("icon")]), 0, now) });
  await settle();
  const paths = [...ui.app.innerHTML.matchAll(/data-icon-path="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(paths.filter((path) => path === "/lol-game-data/assets/v1/champion-icons/67.png").length, 2);
});

test("startup subscribes before loading the snapshot and ignores older connection data", async () => {
  const initial = deferred();
  const ui = page({ initial: initial.promise });
  await settle();
  ui.emit(connected);
  initial.resolve(disconnected);
  await settle();
  assert.equal(ui.reads(), 1);
  assert.equal(ui.testing.state().snapshot.connection, "ready");
  assert.match(ui.app.innerHTML, /当前玩家/);
  assert.doesNotMatch(ui.app.innerHTML, /NaN|undefined/);
});

test("a profile response arriving after disconnect cannot restore the previous account", async () => {
  const pending = deferred();
  const ui = page({ initial: connected, read: () => pending.promise });
  await settle();
  assert.equal(ui.testing.state().profileLoading, true);
  ui.emit({ ...disconnected, revision: 3 });
  pending.resolve(summarizeProfile(profile([]), 0, now));
  await settle();
  assert.equal(ui.testing.state().profileLoading, false);
  assert.equal(ui.testing.state().profileData, null);
  assert.match(ui.app.innerHTML, /等待英雄联盟客户端/);
  assert.doesNotMatch(ui.app.innerHTML, /当前玩家/);
});

test("reconnected account wins over an older profile request that finishes last", async () => {
  const old = deferred();
  let readCount = 0;
  const next = summarizeProfile(profile([], { summoner: { ...profile([]).summoner, name: "新账号" } }), 0, now);
  const ui = page({ initial: connected, read: () => ++readCount === 1 ? old.promise : next });
  await settle();
  ui.emit({ ...disconnected, revision: 3 });
  ui.emit({ ...connected, revision: 4 });
  await settle();
  old.resolve(summarizeProfile(profile([]), 0, now));
  await settle();
  assert.equal(ui.testing.state().profileData.summoner.name, "新账号");
  assert.match(ui.app.innerHTML, /新账号/);
  assert.doesNotMatch(ui.app.innerHTML, /当前玩家/);
});

test("profile errors finish loading and render a retry action", async () => {
  const ui = page({ initial: connected, read: async () => { throw "SUMMONER_UNAVAILABLE: 请先登录客户端"; } });
  await settle();
  assert.equal(ui.testing.state().profileLoading, false);
  assert.match(ui.app.innerHTML, /请先登录客户端/);
  assert.match(ui.app.innerHTML, /重试读取/);
  assert.doesNotMatch(ui.app.innerHTML, /SUMMONER_UNAVAILABLE|正在加载召唤师数据/);
});

test("manual reconnect reloads profile even when the visible connection snapshot stays ready", async () => {
  const ui = page({ initial: connected });
  await settle();
  assert.equal(ui.reads(), 1);
  await ui.testing.reconnectClient();
  assert.equal(ui.testing.state().profileData, null);
  ui.testing.refreshProfileIfNeeded();
  await settle();
  assert.equal(ui.reads(), 2);
  assert.match(ui.app.innerHTML, /当前玩家/);
});

test("partial profile renders warnings, empty history, and unavailable assets without fabricated values", async () => {
  const partial = summarizeProfile(profile(null, {
    assets: { championsOwned: null, championsTotal: null, skinsOwned: null, skinsTotal: null },
    warnings: ["对局记录暂时无法读取"],
  }), 0, now);
  const ui = page({ initial: connected, read: async () => partial });
  await settle();
  assert.match(ui.app.innerHTML, /当前玩家/);
  assert.match(ui.app.innerHTML, /对局记录暂时无法读取/);
  assert.match(ui.app.innerHTML, /对局记录暂不可用，请稍后刷新/);
  assert.doesNotMatch(ui.app.innerHTML, /NaN|undefined|尚未选择|表现稳定|高于上周/);
});
