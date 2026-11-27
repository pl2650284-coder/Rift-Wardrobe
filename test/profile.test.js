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
  renderNewsPage, renderAutomationPage, renderToolkitPage, selectNewsMode, runToolkitAction,
  searchAndOpenPlayer, openMatchDetail, savePlayerTag, deletePlayerTag,
  loadCompanionOngoing, sendOngoingToChampSelectChat,
  saveAutoSelectConfig, toggleAutoSelectPause, saveAutoGameflowConfig,
  benchSwapChampion, benchReroll,
  toggleAutoChampConfigEnabled, saveChampSpellsPreset, toggleSpellTimer, refreshLiveTimers,
  runToolkitInvoke, claimAllRewards, toggleSettingsFileReadonly, loadToolkitFriends, confirmDeleteSelectedFriends,
  updateAutoAccept, updateAutoAcceptDelay, receiveAutomation,
  state: () => ({ snapshot, profileData, profileLoading, profileError, newsMode, newsTab,
    autoAccept, autoAcceptDelaySeconds, autoAcceptReady, autoAcceptSaving, assistantLogs, runtimeStatus,
    activePlayerTab, openPlayerTabs, matchDetailOpen, matchDetail, savedPlayers, ongoingGame,
    autoSelectConfig, autoSelectPaused, autoGameflowConfig, autoChampConfig, liveTimers, spellCooldowns,
    tkFriends, tkSelectedFriendIds, tkSettingsFileStatus }),
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

function page({ initial = disconnected, read = async () => summarizeProfile(profile([]), 0, now), storedPreferences = {}, readHextech = async () => { throw new Error("Unexpected hextech call"); }, readRanking = async () => { throw new Error("Unexpected ranking call"); }, automation = { autoAccept: false, autoAcceptDelaySeconds: 0, configured: true, revision: 0, logs: [] }, saveAutomation, hash = "#profile", search = "", onInvoke } = {}) {
  const app = { innerHTML: "", dataset: {}, style: { setProperty() {}, removeProperty() {} }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const document = { querySelector: (selector) => selector === "#app" ? app : null, querySelectorAll: () => [], activeElement: null, hidden: false, addEventListener() {} };
  let snapshotListener;
  let automationListener;
  let automationState = structuredClone(automation);
  let reads = 0;
  const nativeCalls = [];
  const window = {
    __TAURI_INTERNALS__: {}, location: { hash, search, pathname: "/" }, history: { replaceState() {} },
    localStorage: { getItem: (key) => storedPreferences[key] ?? null, setItem() {} }, addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  };
  const invokeHandler = async (command, args) => {
    nativeCalls.push({ command, args });
    if (onInvoke) {
      const handled = await onInvoke(command, args);
      if (handled !== undefined) return handled;
    }
    if (command === "get_automation_state") return structuredClone(automationState);
    if (command === "set_auto_accept") {
      automationState = saveAutomation ? await saveAutomation(args.enabled, args.delaySeconds) : {
        ...automationState, configured: true, autoAccept: args.enabled, autoAcceptDelaySeconds: args.delaySeconds ?? automationState.autoAcceptDelaySeconds, revision: automationState.revision + 1,
      };
      return structuredClone(automationState);
    }
    return command === "get_snapshot" ? await initial : false;
  };
  const hextechModule = evaluate(compile("../ui/src/hextech-view.ts"), { "@tauri-apps/api/core": { invoke: readHextech } });
  const themeModule = evaluate(compile("../ui/src/theme.ts"), {}, { window });
  const playerDetailModule = evaluate(compile("../ui/src/views/player-detail-view.ts"), {});
  const companionModule = evaluate(compile("../ui/src/companion.ts"), {
    "@tauri-apps/api/core": { invoke: async (command, args) => command === "get_hextech_detail" ? readHextech(command, args) : invokeHandler(command, args) },
    "./hextech-view": hextechModule,
  });
  const result = evaluate(pageCode, {
    "@tauri-apps/api/core": { invoke: invokeHandler },
    "@tauri-apps/api/event": { listen: async (name, callback) => {
      if (name === "snapshot-changed") snapshotListener = callback;
      if (name === "automation-changed") automationListener = callback;
      return () => {};
    } },
    "@tauri-apps/api/window": { getCurrentWindow: () => ({
      onResized: async () => () => {},
      isMaximized: async () => false,
    }) }, lucide: { createIcons() {} },
    "./data/mock": { DEFAULT_PREFERENCES },
    "./services/mock": { getChampionStats: async () => [], getAugmentStats: async () => [], getAssistantLogs: async () => [] },
    "./services/profile": { getProfileSummary: async () => { reads += 1; return read(); } },
    "./hextech-view": hextechModule,
    "./rankings-view": evaluate(compile("../ui/src/rankings-view.ts"), { "@tauri-apps/api/core": { invoke: readRanking } }),
    "./shell": evaluate(compile("../ui/src/shell.ts"), {}),
    "./companion": companionModule,
    "./views/profile-view": evaluate(compile("../ui/src/views/profile-view.ts"), { "./player-detail-view": playerDetailModule }),
    "./views/automation-view": evaluate(compile("../ui/src/views/automation-view.ts"), {}),
    "./views/toolkit-view": evaluate(compile("../ui/src/views/toolkit-view.ts"), {}),
    "./views/settings-view": evaluate(compile("../ui/src/views/settings-view.ts"), { "../theme": themeModule }),
    "./theme": themeModule,
    "./styles.css": {},
    "./immersive.css": {},
  }, { window, document, HTMLInputElement: class HTMLInputElement {} });
  return { app, testing: result.testing, nativeCalls, reads: () => reads,
    emit: (snapshot) => snapshotListener({ payload: snapshot }),
    emitAutomation: (state) => automationListener({ payload: state }),
  };
}

test("auto accept can be enabled in the lobby, queue and ready check before champion select", async () => {
  for (const phase of ["Lobby", "Matchmaking", "ReadyCheck"]) {
    const ui = page({ initial: { ...connected, phase }, hash: "#assistant" });
    await settle();
    const input = ui.app.innerHTML.match(/<input\b[^>]*data-pref="autoAccept"[^>]*>/)?.[0];
    assert.ok(input);
    assert.doesNotMatch(input, /disabled/);
    await ui.testing.updateAutoAccept(true);
    assert.equal(ui.testing.state().autoAccept, true);
    assert.deepEqual(ui.nativeCalls.filter(({ command }) => command === "set_auto_accept"), [
      { command: "set_auto_accept", args: { enabled: true } },
    ]);
  }
});

test("auto accept waits for the native acknowledgement and preserves the old setting on save failure", async () => {
  const pending = deferred();
  const ui = page({ saveAutomation: () => pending.promise });
  await settle();
  const saving = ui.testing.updateAutoAccept(true);
  assert.equal(ui.testing.state().autoAcceptSaving, true);
  assert.equal(ui.testing.state().autoAccept, false);
  pending.resolve({ autoAccept: true, autoAcceptDelaySeconds: 0, configured: true, revision: 1, logs: [] });
  await saving;
  assert.equal(ui.testing.state().autoAccept, true);
  assert.equal(ui.testing.state().autoAcceptSaving, false);

  const failing = page({ saveAutomation: async () => { throw new Error("无法保存自动接受设置"); } });
  await settle();
  await failing.testing.updateAutoAccept(true);
  assert.equal(failing.testing.state().autoAccept, false);
  assert.equal(failing.testing.state().autoAcceptSaving, false);
  assert.match(failing.app.innerHTML, /无法保存自动接受设置/);
});

test("old frontend-only auto accept migrates once and cannot overwrite a saved native preference", async () => {
  const storedPreferences = { "lol-skin-assistant:app-preferences": JSON.stringify({ autoAccept: true }) };
  const migrating = page({ storedPreferences, automation: { autoAccept: false, autoAcceptDelaySeconds: 0, configured: false, revision: 0, logs: [] } });
  await settle();
  assert.equal(migrating.testing.state().autoAccept, true);
  assert.deepEqual(migrating.nativeCalls.filter(({ command }) => command === "set_auto_accept"), [
    { command: "set_auto_accept", args: { enabled: true } },
  ]);
  const configured = page({ storedPreferences });
  await settle();
  assert.equal(configured.testing.state().autoAccept, false);
  assert.equal(configured.nativeCalls.some(({ command }) => command === "set_auto_accept"), false);
});

test("background automation events supply real logs and stale events cannot restore old settings", async () => {
  const ui = page();
  await settle();
  assert.deepEqual(ui.testing.state().assistantLogs, []);
  ui.emitAutomation({ autoAccept: true, autoAcceptDelaySeconds: 0, configured: true, revision: 3, logs: [{
    id: "actual-accept", timestampMs: now, action: "自动接受对局", detail: "客户端已确认接受对局", status: "success",
  }] });
  ui.emitAutomation({ autoAccept: false, autoAcceptDelaySeconds: 0, configured: true, revision: 2, logs: [] });
  assert.equal(ui.testing.state().autoAccept, true);
  assert.equal(ui.testing.state().assistantLogs[0].id, "actual-accept");
  assert.match(ui.testing.state().assistantLogs[0].time, /\d{2}:\d{2}/);
});

test("delay control offers 0–5 seconds and saves to the backend while auto accept is off", async () => {
  const ui = page({ hash: "#assistant" });
  await settle();
  const select = ui.app.innerHTML.match(/<select\b[^>]*data-auto-accept-delay[^>]*>[\s\S]*?<\/select>/)?.[0];
  assert.ok(select);
  assert.doesNotMatch(select, /disabled/);
  assert.deepEqual([...select.matchAll(/<option value="(\d+)"/g)].map(match => Number(match[1])), [0, 1, 2, 3, 4, 5]);
  await ui.testing.updateAutoAcceptDelay(3);
  assert.equal(ui.testing.state().autoAcceptDelaySeconds, 3);
  assert.equal(ui.testing.state().autoAccept, false);
  assert.deepEqual(ui.nativeCalls.find(({ command }) => command === "set_auto_accept"), {
    command: "set_auto_accept", args: { enabled: false, delaySeconds: 3 },
  });
  assert.match(ui.testing.renderSettingsPage(), /value="3" selected/);
  await ui.testing.updateAutoAccept(true);
  assert.equal(ui.testing.state().autoAcceptDelaySeconds, 3);
});

test("delay save waits for acknowledgement, rolls back on failure, and rejects invalid seconds", async () => {
  const pending = deferred();
  const ui = page({ saveAutomation: () => pending.promise });
  await settle();
  const saving = ui.testing.updateAutoAcceptDelay(5);
  assert.equal(ui.testing.state().autoAcceptDelaySeconds, 0);
  assert.equal(ui.testing.state().autoAcceptSaving, true);
  pending.resolve({ autoAccept: false, autoAcceptDelaySeconds: 5, configured: true, revision: 1, logs: [] });
  await saving;
  assert.equal(ui.testing.state().autoAcceptDelaySeconds, 5);
  const failing = page({ saveAutomation: async () => { throw new Error("无法保存等待时间"); } });
  await settle();
  await failing.testing.updateAutoAcceptDelay(2);
  assert.equal(failing.testing.state().autoAcceptDelaySeconds, 0);
  assert.match(failing.app.innerHTML, /无法保存等待时间/);
  const before = ui.nativeCalls.length;
  for (const invalid of [-1, 6, 1.5, NaN, Infinity]) await ui.testing.updateAutoAcceptDelay(invalid);
  assert.equal(ui.nativeCalls.length, before);
  assert.equal(ui.testing.state().autoAcceptDelaySeconds, 5);
});

test("native delay survives page reload and overrides stale browser preferences", async () => {
  const ui = page({ automation: { autoAccept: true, autoAcceptDelaySeconds: 4, configured: true, revision: 0, logs: [] },
    storedPreferences: { "lol-skin-assistant:app-preferences": JSON.stringify({ autoAccept: false, autoAcceptDelaySeconds: 1 }) } });
  await settle();
  assert.equal(ui.testing.state().autoAcceptDelaySeconds, 4);
  assert.equal(ui.testing.state().autoAccept, true);
  assert.equal(ui.nativeCalls.some(({ command }) => command === "set_auto_accept"), false);
  await ui.testing.updateAutoAccept(false, 0);
  assert.equal(ui.testing.state().autoAcceptDelaySeconds, 0);
  assert.equal(ui.testing.state().autoAccept, false);
});

test("ranking navigation starts with four modes and keeps late hextech data inside its mode", async () => {
  const pending = deferred();
  const calls = [];
  const ui = page({ readHextech: async (command) => { calls.push(command); return pending.promise; } });
  const initialHtml = ui.testing.renderNewsPage();
  assert.equal(ui.testing.state().newsMode, "rift");
  assert.deepEqual([...initialHtml.matchAll(/role="tab" aria-selected="(?:true|false)" data-news-mode="([a-z]+)"/g)].map(match => match[1]), ["rift", "hextech", "aram", "classic"]);
  assert.equal(calls.length, 0);
  ui.testing.selectNewsMode("hextech");
  assert.match(ui.testing.renderNewsPage(), /data-news-tab="ranking"/);
  assert.deepEqual(calls, ["get_hextech_ranking"]);
  ui.testing.selectNewsMode("aram");
  pending.resolve({ statsDate: "20261019", heroes: [], warnings: [] });
  await settle();
  const aram = ui.testing.renderNewsPage();
  assert.match(aram, /data-ranking-mode="aram"/);
  assert.match(aram, /<span class="eyebrow">极地大乱斗<\/span>/);
  assert.doesNotMatch(aram, /hex-ranking|data-news-tab=/);
  ui.testing.selectNewsMode("classic");
  assert.match(ui.testing.renderNewsPage(), /data-ranking-mode="classic"/);
  ui.testing.selectNewsMode("__proto__");
  assert.equal(ui.testing.state().newsMode, "classic");
});

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

test("main sidebar exposes five top-level routes and renders automation & toolkit views", async () => {
  const ui = page({ initial: connected, hash: "#automation" });
  await settle();
  const routes = [...ui.app.innerHTML.matchAll(/<button class="nav-item[^"]*" data-route="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(routes, ["profile", "news", "automation", "toolkit", "settings"]);
  assert.match(ui.app.innerHTML, /对局流程/);
  assert.match(ui.app.innerHTML, /执行日志/);
  assert.match(ui.app.innerHTML, /data-pref="autoAccept"/);
  assert.match(ui.app.innerHTML, /data-auto-accept-delay/);

  const toolkitUi = page({ initial: connected, hash: "#toolkit" });
  await settle();
  assert.match(toolkitUi.app.innerHTML, /data-action="toolkit-restart-ux"/);
  assert.match(toolkitUi.app.innerHTML, /data-action="toolkit-play-again"/);
  assert.match(toolkitUi.app.innerHTML, /data-action="toolkit-leave-lobby"/);
  const before = toolkitUi.nativeCalls.length;
  await toolkitUi.testing.runToolkitAction("toolkit_restart_ux", "已请求重启客户端界面");
  await toolkitUi.testing.runToolkitAction("toolkit_play_again", "已请求返回房间");
  await toolkitUi.testing.runToolkitAction("toolkit_leave_lobby", "已退出当前房间");
  assert.deepEqual(
    toolkitUi.nativeCalls.slice(before).filter(({ command }) => command.startsWith("toolkit_")).map(({ command }) => command),
    ["toolkit_restart_ux", "toolkit_play_again", "toolkit_leave_lobby"],
  );
});

test("player search opens multi-tab detail, 10-player match drawer, and persists player tags", async () => {
  const ui = page({
    initial: connected,
    read: async () => summarizeProfile(profile([], { summoner: { ...profile([]).summoner, puuid: "self-puuid" } }), 0, now),
    onInvoke: async (command, args) => {
      if (command === "list_saved_players") return [];
      if (command === "search_player") {
        return { puuid: "target-p1", summonerId: 2, gameName: "目标玩家", tagLine: "8888", level: 210, iconPath: null, privacy: "PUBLIC" };
      }
      if (command === "get_player_detail") {
        return {
          selfPuuid: "self-puuid",
          summoner: { puuid: "target-p1", summonerId: 2, gameName: "目标玩家", tagLine: "8888", level: 210, iconPath: null, privacy: "PUBLIC" },
          ranks: [{ queueType: "RANKED_SOLO_5x5", queueLabel: "单双排", tier: "钻石", division: "III", ranked: true, points: 52, wins: 30, losses: 20, winRate: 60 }],
          matches: [{ id: "HN1:777", gameId: 777, championId: 67, champion: "薇恩", result: "win", mode: "单双排位", queueId: 420, kills: 12, deaths: 1, assists: 5, cs: 240, gold: 16000, damage: 38000, durationSeconds: 1800, playedAtMs: now - hours, items: [3153] }],
          mastery: [{ championId: 67, championName: "薇恩", level: 15, points: 185000 }],
          stats: { sampleSize: 1, wins: 1, losses: 0, winRate: 100, avgKda: 17, avgKills: 12, avgDeaths: 1, avgAssists: 5, streak: 1, score: 94 },
          saved: null,
          encountered: [],
          warnings: [],
        };
      }
      if (command === "get_match_detail") {
        return {
          gameId: args.gameId, mode: "单双排位", queueId: 420, durationSeconds: 1800, playedAtMs: now - hours,
          teams: [{
            teamId: 100, win: true, kills: 12, deaths: 1, assists: 5, totalDamage: 38000, totalGold: 16000,
            players: [{ puuid: "target-p1", gameName: "目标玩家", tagLine: "8888", teamId: 100, championId: 67, championName: "薇恩", kills: 12, deaths: 1, assists: 5, cs: 240, gold: 16000, damage: 38000, damageTaken: 10000, visionScore: 20, win: true, items: [3153], spell1Id: 4, spell2Id: 7, role: "下路", isSelf: false }],
          }],
        };
      }
      if (command === "upsert_saved_player") {
        return { puuid: args.puuid, selfPuuid: args.selfPuuid, tag: args.tag, note: args.note, updatedAtMs: now };
      }
      if (command === "delete_saved_player") return null;
      return undefined;
    },
  });
  await settle();
  await ui.testing.searchAndOpenPlayer("目标玩家#8888");
  assert.equal(ui.testing.state().activePlayerTab, "target-p1");
  assert.match(ui.app.innerHTML, /目标玩家/);
  assert.match(ui.app.innerHTML, /钻石 III/);
  assert.match(ui.app.innerHTML, /英雄熟练度/);

  await ui.testing.savePlayerTag("target-p1", "大腿", "走位很稳");
  assert.equal(ui.testing.state().savedPlayers.length, 1);
  assert.match(ui.app.innerHTML, /大腿/);

  await ui.testing.openMatchDetail(777);
  assert.equal(ui.testing.state().matchDetailOpen, true);
  assert.match(ui.app.innerHTML, /蓝色方 · 胜利/);

  await ui.testing.deletePlayerTag("target-p1");
  assert.equal(ui.testing.state().savedPlayers.length, 0);
});

test("companion ongoing tab renders team analysis, premade group, and sends champ-select chat", async () => {
  const ui = page({
    initial: { ...connected, phase: "ChampSelect", active: true },
    search: "?window=companion&tab=ongoing",
    onInvoke: async (command) => {
      if (command === "get_ongoing_game") {
        return {
          active: true, phase: "ChampSelect", stageLabel: "选人阶段", gameId: 500, queueId: 420,
          selfPuuid: "me", canSendChat: true, updatedAtMs: now, enemyTeam: [],
          myTeam: [
            { puuid: "me", gameName: "我自己", tagLine: "1", iconPath: null, championId: 67, championName: "薇恩", position: "下路", isSelf: true, rankLabel: "翡翠 I", winRate: 60, wins: 6, losses: 4, avgKda: 4.0, streak: 3, score: 82, premadeGroup: "A", tags: ["3连胜"], saved: null, encounteredCount: 0, recentGames: [], privacy: "PUBLIC" },
            { puuid: "mate", gameName: "开黑辅助", tagLine: "2", iconPath: null, championId: 117, championName: "璐璐", position: "辅助", isSelf: false, rankLabel: "钻石 IV", winRate: 70, wins: 7, losses: 3, avgKda: 5.1, streak: 0, score: 86, premadeGroup: "A", tags: ["高胜率"], saved: null, encounteredCount: 2, recentGames: [], privacy: "PUBLIC" },
          ],
        };
      }
      if (command === "send_champ_select_chat") return null;
      return undefined;
    },
  });
  await settle();
  assert.match(ui.app.innerHTML, /本局分析/);
  assert.match(ui.app.innerHTML, /开黑A/);
  assert.match(ui.app.innerHTML, /开黑辅助/);
  assert.match(ui.app.innerHTML, /data-action="companion-send-chat"/);

  await ui.testing.sendOngoingToChampSelectChat();
  const chatCall = ui.nativeCalls.find(({ command }) => command === "send_champ_select_chat");
  assert.ok(chatCall);
  assert.match(chatCall.args.message, /我自己 胜率60% KDA4\.0 3连胜/);
  assert.match(chatCall.args.message, /开黑辅助 胜率70% KDA5\.1/);
});

test("auto-select & auto-gameflow configs persist via IPC and companion exposes per-game pause", async () => {
  let asState = {
    config: {
      pickEnabled: false, pickStrategy: "show-and-lock-in", pickDelaySeconds: 0, showIntent: false, ignoreTeammateIntent: false,
      pickChampions: { default: [], top: [], jungle: [], middle: [], bottom: [], utility: [] },
      banEnabled: false, banStrategy: "show-and-lock-in", banDelaySeconds: 0, banAvoidTeammateIntent: true,
      banChampions: { default: [], top: [], jungle: [], middle: [], bottom: [], utility: [] },
      benchEnabled: false, benchDelaySeconds: 1, benchChampions: [], benchAutoAcceptTrade: false,
    },
    pausedThisGame: false, revision: 0, logs: [],
  };
  let gfState = {
    config: {
      autoHonorEnabled: false, autoHonorStrategy: "random-teammate", autoPlayAgainEnabled: false,
      autoMatchmakingEnabled: false, autoMatchmakingDelaySeconds: 3, autoMatchmakingMinMembers: 1,
      autoReconnectEnabled: false, autoInvitationMode: "off",
    },
    revision: 0, logs: [],
  };
  const onInvoke = async (command, args) => {
    if (command === "get_auto_select_state") return structuredClone(asState);
    if (command === "set_auto_select_config") {
      asState = { ...asState, config: structuredClone(args.config), revision: asState.revision + 1 };
      return structuredClone(asState);
    }
    if (command === "set_auto_select_paused") {
      asState = { ...asState, pausedThisGame: args.paused, revision: asState.revision + 1 };
      return structuredClone(asState);
    }
    if (command === "get_auto_gameflow_state") return structuredClone(gfState);
    if (command === "set_auto_gameflow_config") {
      gfState = { ...gfState, config: structuredClone(args.config), revision: gfState.revision + 1 };
      return structuredClone(gfState);
    }
    return undefined;
  };

  const ui = page({ initial: connected, hash: "#automation", onInvoke });
  await settle();
  assert.match(ui.app.innerHTML, /结算自动点赞/);
  assert.match(ui.app.innerHTML, /房主自动开始匹配/);
  await ui.testing.saveAutoGameflowConfig({ ...gfState.config, autoHonorEnabled: true, autoPlayAgainEnabled: true });
  assert.equal(ui.testing.state().autoGameflowConfig.autoHonorEnabled, true);

  await ui.testing.saveAutoSelectConfig({
    ...asState.config,
    pickEnabled: true,
    pickChampions: { ...asState.config.pickChampions, default: [67, 22] },
  });
  assert.equal(ui.testing.state().autoSelectConfig.pickEnabled, true);
  assert.deepEqual(ui.testing.state().autoSelectConfig.pickChampions.default, [67, 22]);

  const compUi = page({ initial: { ...connected, phase: "ChampSelect", active: true }, search: "?window=companion&tab=skin", onInvoke });
  await settle();
  assert.match(compUi.app.innerHTML, /data-action="toggle-auto-select-pause"/);
  assert.match(compUi.app.innerHTML, /暂停选禁/);
  await compUi.testing.toggleAutoSelectPause();
  assert.equal(compUi.testing.state().autoSelectPaused, true);
  assert.match(compUi.app.innerHTML, /已暂停选禁/);
});

test("companion window renders ARAM bench 5x2 grid and invokes swap & charity reroll", async () => {
  const ui = page({
    initial: {
      ...connected,
      phase: "ChampSelect",
      active: true,
      championId: 67,
      championName: "薇恩",
      bench: {
        enabled: true,
        canUse: true,
        phase: "FINALIZATION",
        rerollsRemaining: 2,
        showReroll: true,
        champions: [
          { championId: 22, swappable: true },
          { championId: 103, swappable: false },
        ],
      },
    },
    search: "?window=companion&tab=skin",
    onInvoke: async (command) => {
      if (command === "bench_swap_champion" || command === "bench_reroll") return null;
      return undefined;
    },
  });
  await settle();
  assert.match(ui.app.innerHTML, /候补席/);
  assert.match(ui.app.innerHTML, /data-bench-swap="22"/);
  assert.match(ui.app.innerHTML, /data-action="bench-reroll"/);
  assert.match(ui.app.innerHTML, /data-action="bench-reroll-grab"/);

  await ui.testing.benchSwapChampion(22);
  await ui.testing.benchReroll(true);
  assert.deepEqual(
    ui.nativeCalls.filter(({ command }) => command.startsWith("bench_")),
    [
      { command: "bench_swap_champion", args: { championId: 22 } },
      { command: "bench_reroll", args: { grabBack: true } },
    ],
  );
});

test("auto champ config saves presets and companion timer tab tracks enemy spells & respawn", async () => {
  let ccState = { data: { enabled: false, presets: {} }, revision: 0, logs: [] };
  const onInvoke = async (command, args) => {
    if (command === "get_auto_champ_config") return structuredClone(ccState);
    if (command === "set_auto_champ_config_enabled") {
      ccState = { ...ccState, data: { ...ccState.data, enabled: args.enabled }, revision: ccState.revision + 1 };
      return structuredClone(ccState);
    }
    if (command === "upsert_champ_preset") {
      const k = `${args.entry.championId}:${args.entry.mode}`;
      ccState = {
        ...ccState,
        data: { ...ccState.data, presets: { ...ccState.data.presets, [k]: args.entry } },
        revision: ccState.revision + 1,
      };
      return structuredClone(ccState);
    }
    if (command === "get_live_game_timers") {
      return {
        inGame: true, gameTimeSeconds: 615, gameMode: "CLASSIC",
        selfRespawn: { isDead: true, respawnTimer: 18.4, championName: "薇恩" },
        enemies: [{
          summonerName: "敌方中单", championName: "阿狸", isDead: false, respawnTimer: 0,
          hasIonianBoots: true, hasCosmicInsight: false,
          spell1: { name: "闪现", rawKey: "Flash", baseCd: 300, effectiveCd: 273 },
          spell2: { name: "点燃", rawKey: "Dot", baseCd: 180, effectiveCd: 164 },
        }],
      };
    }
    return undefined;
  };

  const ui = page({ initial: connected, hash: "#automation", onInvoke });
  await settle();
  await ui.testing.toggleAutoChampConfigEnabled(true);
  await ui.testing.saveChampSpellsPreset();
  assert.equal(ui.testing.state().autoChampConfig.enabled, true);
  assert.ok(ui.testing.state().autoChampConfig.presets["67:default"]);

  const compUi = page({ initial: connected, search: "?window=companion&tab=timer", onInvoke });
  await settle();
  assert.match(compUi.app.innerHTML, /复活倒计时/);
  assert.match(compUi.app.innerHTML, /阿狸/);
  assert.match(compUi.app.innerHTML, /273s/);
  compUi.testing.toggleSpellTimer("live-0-1", 273);
  assert.ok(compUi.testing.state().spellCooldowns["live-0-1"] > Date.now());
  assert.match(compUi.app.innerHTML, /is-cooling/);
});

test("expanded toolkit executes lobby, persona, rewards, readonly lock, and confirmed friend cleanup", async () => {
  const ui = page({
    initial: connected,
    hash: "#toolkit",
    onInvoke: async (command, args) => {
      if (command === "toolkit_create_queue_lobby") return null;
      if (command === "toolkit_set_fake_rank") return null;
      if (command === "toolkit_claim_rewards") return { claimedGrants: 2, viewedMissions: 3 };
      if (command === "toolkit_set_settings_readonly") return { found: true, readonly: args.readonly, path: "C:/Game/Config/PersistedSettings.json" };
      if (command === "toolkit_list_friends") {
        return [{ id: "f-1", puuid: "p-1", gameName: "旧好友", tagLine: "001", availability: "offline", groupName: "默认", note: "" }];
      }
      if (command === "toolkit_delete_friends") return args.ids.length;
      return undefined;
    },
  });
  await settle();
  assert.match(ui.app.innerHTML, /创建模式房间/);
  assert.match(ui.app.innerHTML, /锁定游戏设置只读/);

  await ui.testing.runToolkitInvoke("toolkit_create_queue_lobby", { queueId: 450 }, "已创建房间");
  await ui.testing.runToolkitInvoke("toolkit_set_fake_rank", { queue: "RANKED_SOLO_5x5", tier: "CHALLENGER", division: "I" }, "已更新伪装段位");
  await ui.testing.claimAllRewards();
  await ui.testing.toggleSettingsFileReadonly(true);
  assert.equal(ui.testing.state().tkSettingsFileStatus.readonly, true);

  await ui.testing.loadToolkitFriends();
  assert.equal(ui.testing.state().tkFriends.length, 1);
  ui.testing.state().tkSelectedFriendIds.add("f-1");
  await ui.testing.confirmDeleteSelectedFriends();
  assert.equal(ui.testing.state().tkFriends.length, 0);
  assert.ok(ui.nativeCalls.some(({ command }) => command === "toolkit_delete_friends"));
});
