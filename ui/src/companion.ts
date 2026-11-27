import { invoke } from "@tauri-apps/api/core";
import type { HexDetail } from "./data/hextech";
import type { LiveGameTimerSnapshot, OngoingGameSnapshot, OngoingPlayer } from "./data/types";
import { HEX_QUALITIES } from "./hextech-view";

export type CompanionTab = "skin" | "build" | "ongoing" | "timer";

export type CompanionSkin = {
  id: number;
  championId: number;
  name: string;
  availability: string;
  available: boolean;
  selected: boolean;
  isBase: boolean;
  isChroma: boolean;
  parentSkinId: number | null;
  tileImagePath: string | null;
  splashImagePath: string | null;
};

export type CompanionBenchChampion = {
  championId: number;
  swappable: boolean;
};

export type CompanionBenchState = {
  enabled: boolean;
  canUse: boolean;
  phase: string;
  rerollsRemaining: number;
  showReroll: boolean;
  champions: CompanionBenchChampion[];
};

export type CompanionSnapshot = {
  connection: "disconnected" | "ready";
  phase: string;
  active: boolean;
  contextId: string | null;
  championId: number | null;
  championName: string | null;
  selectedSkinId: number | null;
  writeEnabled: boolean;
  writeBlockReason: string | null;
  skins: CompanionSkin[];
  bench?: CompanionBenchState | null;
};

export type CompanionRenderContext = {
  isTauri: boolean;
  tab: CompanionTab;
  pinned: boolean;
  snapshot: CompanionSnapshot;
  selectedSkinId: number | null;
  busy: boolean;
  activeFilter: "可用" | "全部" | "收藏";
  searchQuery: string;
  favoriteSkinIds: Set<number>;
  autoAccept: boolean;
  autoAcceptDelaySeconds: number;
  autoAcceptReady: boolean;
  autoAcceptSaving: boolean;
  buildHeroId: number | null;
  buildDetail: HexDetail | null;
  buildLoading: boolean;
  buildError: string;
  ongoingGame: OngoingGameSnapshot | null;
  ongoingLoading: boolean;
  ongoingError: string;
  sendingChat: boolean;
  quickTagPuuid: string | null;
  autoSelectActive: boolean;
  autoSelectPaused: boolean;
  benchBusy: boolean;
  benchPriorityIds: number[];
  liveTimers: LiveGameTimerSnapshot | null;
  spellCooldowns: Record<string, number>;
  nowMs: number;
  championNameById: (id: number) => string;
  escape: (s: string) => string;
  icon: (name: string, size?: number) => string;
  skinImage: (skin: CompanionSkin, large?: boolean) => string;
  gameIcon: (name: string, color: string, path?: string, url?: string, kind?: string, extraClass?: string) => string;
  canApply: (skin: CompanionSkin) => boolean;
  phaseLabel: () => string;
  blockReason: () => string | null;
  filteredSkins: () => CompanionSkin[];
};

const demoBuild: HexDetail = {
  heroId: 67,
  statsDate: "20261127",
  hero: {
    id: 67,
    name: "薇恩",
    description: "暗夜猎手",
    title: "暗夜猎手",
    roles: ["marksman", "assassin"],
    rank: 14,
    tier: "A",
    winRate: 51.92,
    pickRate: 5.84,
    pickChange: 0.42,
    iconPath: null,
    iconUrl: null,
  },
  spells: [
    { id: 1, key: "Q", name: "闪避突袭", description: "", iconPath: null, iconUrl: null },
    { id: 2, key: "W", name: "圣银弩箭", description: "", iconPath: null, iconUrl: null },
    { id: 3, key: "E", name: "恶魔审判", description: "", iconPath: null, iconUrl: null },
    { id: 4, key: "R", name: "终极时刻", description: "", iconPath: null, iconUrl: null },
  ],
  runes: [
    { id: 101, name: "终极刷新", description: "终极技能急速与额外伤害提升", quality: "kPrismatic", strength: "S", rank: 1, pickRate: 12.6, iconPath: null, iconUrl: null },
    { id: 102, name: "珠光护手", description: "技能可暴击并强化爆发", quality: "kPrismatic", strength: "S", rank: 2, pickRate: 8.9, iconPath: null, iconUrl: null },
    { id: 103, name: "灵巧打击", description: "普攻提供额外攻速与移速", quality: "kGold", strength: "A", rank: 3, pickRate: 14.1, iconPath: null, iconUrl: null },
    { id: 104, name: "不倒翁", description: "低血量触发护盾与韧性", quality: "kSilver", strength: "A", rank: 4, pickRate: 10.4, iconPath: null, iconUrl: null },
  ],
  skills: [
    { id: "s1", order: ["W", "Q", "E"], pickRate: 62.4, winRate: 53.1, plans: [] },
    { id: "s2", order: ["Q", "W", "E"], pickRate: 31.2, winRate: 51.2, plans: [] },
  ],
  equipment: [
    {
      key: "core",
      title: "核心三件套",
      rows: [
        {
          id: 1,
          pickRate: 28.4,
          winRate: 55.6,
          items: [
            { id: 3153, name: "破败王者之刃", description: "", iconPath: null, iconUrl: null },
            { id: 3124, name: "鬼索的狂暴之刃", description: "", iconPath: null, iconUrl: null },
            { id: 3302, name: "界弓", description: "", iconPath: null, iconUrl: null },
          ],
        },
        {
          id: 2,
          pickRate: 19.2,
          winRate: 54.1,
          items: [
            { id: 6672, name: "海妖杀手", description: "", iconPath: null, iconUrl: null },
            { id: 3124, name: "鬼索的狂暴之刃", description: "", iconPath: null, iconUrl: null },
            { id: 3091, name: "智慧末刃", description: "", iconPath: null, iconUrl: null },
          ],
        },
      ],
    },
  ],
  partners: [
    {
      hero: { id: 117, name: "璐璐", description: "", iconPath: null, iconUrl: null },
      title: "仙灵女巫",
      roles: ["support"],
      rank: 1,
      winRate: 56.8,
      pickRate: 4.3,
    },
    {
      hero: { id: 89, name: "蕾欧娜", description: "", iconPath: null, iconUrl: null },
      title: "曙光女神",
      roles: ["support"],
      rank: 2,
      winRate: 54.9,
      pickRate: 5.1,
    },
  ],
  warnings: [],
};

export async function fetchCompanionBuild(isTauri: boolean, heroId: number, force = false): Promise<HexDetail> {
  if (!isTauri) {
    return { ...demoBuild, heroId };
  }
  return invoke<HexDetail>("get_hextech_detail", { heroId, force });
}

const demoOngoingGame: OngoingGameSnapshot = {
  active: true,
  phase: "ChampSelect",
  stageLabel: "选人阶段",
  gameId: 90001,
  queueId: 420,
  selfPuuid: "demo-self",
  canSendChat: true,
  myTeam: [
    {
      puuid: "demo-self",
      gameName: "峡印演示",
      tagLine: "CN1",
      iconPath: null,
      championId: 67,
      championName: "薇恩",
      position: "下路",
      isSelf: true,
      rankLabel: "翡翠 II",
      winRate: 60,
      wins: 6,
      losses: 4,
      avgKda: 4.1,
      streak: 3,
      score: 79,
      premadeGroup: "A",
      tags: ["3连胜"],
      saved: null,
      encounteredCount: 0,
      recentGames: [
        { gameId: 1, championId: 67, result: "win", kills: 9, deaths: 2, assists: 5 },
        { gameId: 2, championId: 67, result: "win", kills: 7, deaths: 3, assists: 6 },
        { gameId: 3, championId: 22, result: "win", kills: 5, deaths: 1, assists: 11 },
        { gameId: 4, championId: 67, result: "loss", kills: 3, deaths: 6, assists: 4 },
        { gameId: 5, championId: 81, result: "win", kills: 8, deaths: 2, assists: 7 },
      ],
      privacy: "PUBLIC",
    },
    {
      puuid: "demo-mate-1",
      gameName: "轻舟过万山",
      tagLine: "2048",
      iconPath: null,
      championId: 117,
      championName: "璐璐",
      position: "辅助",
      isSelf: false,
      rankLabel: "钻石 IV",
      winRate: 70,
      wins: 7,
      losses: 3,
      avgKda: 5.2,
      streak: 4,
      score: 88,
      premadeGroup: "A",
      tags: ["大腿", "4连胜", "高胜率"],
      saved: { puuid: "demo-mate-1", selfPuuid: "demo-self", tag: "大腿", note: "保护极稳", updatedAtMs: Date.now() },
      encounteredCount: 2,
      recentGames: [
        { gameId: 1, championId: 117, result: "win", kills: 1, deaths: 1, assists: 18 },
        { gameId: 2, championId: 117, result: "win", kills: 2, deaths: 2, assists: 15 },
        { gameId: 3, championId: 412, result: "win", kills: 1, deaths: 3, assists: 14 },
        { gameId: 4, championId: 117, result: "win", kills: 0, deaths: 2, assists: 19 },
        { gameId: 5, championId: 89, result: "loss", kills: 1, deaths: 6, assists: 9 },
      ],
      privacy: "PUBLIC",
    },
  ],
  enemyTeam: [],
  updatedAtMs: Date.now(),
};

export async function fetchCompanionOngoing(isTauri: boolean): Promise<OngoingGameSnapshot> {
  if (!isTauri) {
    return structuredClone(demoOngoingGame);
  }
  return invoke<OngoingGameSnapshot>("get_ongoing_game");
}

export function formatOngoingChatSummary(ongoing: OngoingGameSnapshot): string {
  return ongoing.myTeam
    .slice(0, 5)
    .map((p) => {
      const wr = p.winRate !== null ? `${p.winRate}%` : "--";
      const kda = p.avgKda !== null ? p.avgKda.toFixed(1) : "--";
      const streak = p.streak >= 3 ? ` ${p.streak}连胜` : p.streak <= -3 ? ` ${-p.streak}连败` : "";
      return `${p.gameName} 胜率${wr} KDA${kda}${streak}`;
    })
    .join(" | ");
}

export function renderCompanionShell(ctx: CompanionRenderContext): string {
  const { escape: e, icon, snapshot, tab, pinned } = ctx;
  const ready = snapshot.connection === "ready" && snapshot.active;
  const champLabel = snapshot.championName ?? (snapshot.connection === "ready" ? "等待选人" : "未连接");
  const body = tab === "skin"
    ? renderCompanionSkins(ctx)
    : tab === "build"
      ? renderCompanionBuild(ctx)
      : tab === "ongoing"
        ? renderCompanionOngoing(ctx)
        : renderCompanionTimer(ctx);

  return `<div class="companion-shell">
    <header class="titlebar companion-titlebar">
      <div class="companion-title">
        <span class="companion-dot ${ready ? "is-live" : ""}"></span>
        <strong>${e(champLabel)}</strong>
        <span class="companion-phase">${ctx.isTauri ? e(ctx.phaseLabel()) : "演示小窗"}</span>
      </div>
      <div class="companion-win-tools">
        <button class="companion-icon-btn ${pinned ? "is-active" : ""}" data-action="toggle-companion-pin" title="${pinned ? "已置顶（点击取消置顶）" : "置顶在游戏客户端上方"}" aria-pressed="${pinned}">
          ${icon("pin", 14)}
        </button>
        <button class="companion-icon-btn" data-action="show-main-window" title="打开主窗口">
          ${icon("maximize-2", 13)}
        </button>
        <button class="companion-icon-btn companion-close-btn" data-action="close-companion" title="隐藏小窗">
          ${icon("x", 15)}
        </button>
      </div>
    </header>

    <nav class="companion-tabs" role="tablist" aria-label="选人伴随功能">
      <button class="companion-tab ${tab === "skin" ? "is-active" : ""}" role="tab" aria-selected="${tab === "skin"}" data-companion-tab="skin">
        ${icon("sparkles", 13)}<span>换肤</span>
      </button>
      <button class="companion-tab ${tab === "build" ? "is-active" : ""}" role="tab" aria-selected="${tab === "build"}" data-companion-tab="build">
        ${icon("swords", 13)}<span>海克斯</span>
      </button>
      <button class="companion-tab ${tab === "ongoing" ? "is-active" : ""}" role="tab" aria-selected="${tab === "ongoing"}" data-companion-tab="ongoing">
        ${icon("users", 13)}<span>本局</span>
      </button>
      <button class="companion-tab ${tab === "timer" ? "is-active" : ""}" role="tab" aria-selected="${tab === "timer"}" data-companion-tab="timer">
        ${icon("clock-3", 13)}<span>计时</span>
      </button>
    </nav>

    <main class="companion-body" data-page="companion">${body}</main>

    <footer class="companion-foot">
      <label class="companion-auto">
        <input class="switch-input" type="checkbox" data-pref="autoAccept" ${ctx.autoAccept ? "checked" : ""} ${!ctx.autoAcceptReady || ctx.autoAcceptSaving ? "disabled" : ""} />
        <span class="switch-track" aria-hidden="true"></span>
        <span>自动接受</span>
      </label>
      <select class="companion-delay" data-auto-accept-delay aria-label="自动接受延迟" ${!ctx.autoAcceptReady || ctx.autoAcceptSaving ? "disabled" : ""}>
        ${[0, 1, 2, 3, 4, 5].map((s) => `<option value="${s}" ${ctx.autoAcceptDelaySeconds === s ? "selected" : ""}>${s}s</option>`).join("")}
      </select>
      ${ctx.autoSelectActive ? `<button class="companion-pause-btn ${ctx.autoSelectPaused ? "is-paused" : ""}" data-action="toggle-auto-select-pause">${ctx.autoSelectPaused ? "已暂停选禁" : "暂停选禁"}</button>` : ""}
    </footer>
  </div>`;
}

function renderCompanionBench(ctx: CompanionRenderContext): string {
  const { escape: e, icon, snapshot, benchBusy, benchPriorityIds, championNameById } = ctx;
  const bench = snapshot.bench;
  if (!bench || !bench.enabled) return "";

  const currentChampId = snapshot.championId;
  const currentChampIcon = currentChampId
    ? ctx.gameIcon(
        snapshot.championName ?? championNameById(currentChampId),
        "#6b8afd",
        `/lol-game-data/assets/v1/champion-icons/${currentChampId}.png`,
        undefined,
        "champion",
        "comp-bench-self-icon",
      )
    : `<span class="comp-bench-self-empty">${icon("gamepad-2", 16)}</span>`;

  const slots = bench.champions.slice(0, 10);
  const emptyCount = Math.max(0, 10 - slots.length);

  return `<section class="comp-bench" aria-label="大乱斗候补席">
    <div class="comp-bench-head">
      <strong>候补席</strong>
      <span class="num">${slots.length} / 10</span>
    </div>
    <div class="comp-bench-body">
      <div class="comp-bench-self">
        <div class="comp-bench-self-avatar" title="${e(snapshot.championName ?? "当前英雄")}">${currentChampIcon}</div>
        ${bench.showReroll ? `<div class="comp-bench-rerolls">
          <button class="comp-bench-btn" data-action="bench-reroll" title="使用骰子重随（剩余 ${bench.rerollsRemaining}）" ${bench.rerollsRemaining === 0 || benchBusy ? "disabled" : ""}>
            ${icon("refresh-cw", 12)}<span class="num">${bench.rerollsRemaining}</span>
          </button>
          <button class="comp-bench-btn" data-action="bench-reroll-grab" title="重随并立即抢回原英雄（给队友发福利）" ${bench.rerollsRemaining === 0 || benchBusy || !currentChampId ? "disabled" : ""}>
            ${icon("shuffle", 12)}
          </button>
        </div>` : ""}
      </div>
      <div class="comp-bench-divider" aria-hidden="true"></div>
      <div class="comp-bench-grid">
        ${slots.map((item) => {
          const name = championNameById(item.championId);
          const priority = benchPriorityIds.includes(item.championId);
          const disabled = !item.swappable || !bench.canUse || benchBusy;
          return `<button class="comp-bench-slot ${disabled ? "is-locked" : ""} ${priority ? "is-priority" : ""}" data-bench-swap="${item.championId}" title="${e(disabled ? `${name}（暂不可换）` : `点击抢 ${name}（右键切换自动秒抢）`)}" ${disabled ? "disabled" : ""}>
            ${ctx.gameIcon(name, "#6b8afd", `/lol-game-data/assets/v1/champion-icons/${item.championId}.png`, undefined, "champion")}
            ${priority ? `<span class="comp-bench-star" aria-hidden="true"></span>` : ""}
          </button>`;
        }).join("")}
        ${Array.from({ length: emptyCount }, () => `<span class="comp-bench-slot is-empty" aria-hidden="true"></span>`).join("")}
      </div>
    </div>
  </section>`;
}

function renderCompanionSkins(ctx: CompanionRenderContext): string {
  const { escape: e, icon, snapshot } = ctx;
  const benchHtml = renderCompanionBench(ctx);
  const current = snapshot.skins.find((s) => s.id === ctx.selectedSkinId) ?? snapshot.skins[0];
  const filtered = ctx.filteredSkins();
  const ready = snapshot.connection === "ready" && snapshot.active;
  const currentFav = current ? ctx.favoriteSkinIds.has(current.id) : false;
  const blockReason = ctx.blockReason();

  const stage = current
    ? `<section class="comp-hero">
        <div class="comp-art">${ctx.skinImage(current, true)}</div>
        <div class="comp-hero-bar">
          <div class="comp-hero-text">
            <strong>${e(current.name)}</strong>
            <span>${ctx.busy ? "切换中…" : current.selected ? "使用中" : !current.available ? "未拥有" : current.isChroma ? "炫彩预览" : blockReason ?? "可用"}</span>
          </div>
          <div class="comp-hero-actions">
            <button class="comp-fav-btn ${currentFav ? "is-on" : ""}" data-favorite-id="${current.id}" aria-label="收藏皮肤" title="${currentFav ? "取消收藏" : "收藏皮肤"}">${icon("heart", 15)}</button>
          </div>
        </div>
      </section>`
    : `<section class="comp-empty-hero">
        ${icon("gamepad-2", 26)}
        <strong>${snapshot.connection === "ready" ? "等待进入选人阶段" : "等待英雄联盟客户端"}</strong>
        <span>${snapshot.connection === "ready" ? "选择英雄后，可用皮肤会自动出现在这里，不遮挡游戏窗口。" : "请先登录国服客户端，助手会自动同步选人状态。"}</span>
        ${snapshot.connection !== "ready" ? `<button class="secondary-button" data-action="refresh">重新连接</button>` : ""}
      </section>`;

  const tools = `<div class="comp-tools">
    <label class="search-box comp-search">
      ${icon("search", 14)}
      <input type="search" maxlength="60" value="${e(ctx.searchQuery)}" placeholder="搜索皮肤 (/)" aria-label="搜索皮肤" data-search />
    </label>
    <button class="secondary-button comp-rand-btn" data-action="random" title="随机可用皮肤 (R)" ${ready && snapshot.writeEnabled && !ctx.busy ? "" : "disabled"}>
      ${icon("shuffle", 14)}
    </button>
  </div>
  <div class="comp-filters" role="group" aria-label="皮肤筛选">
    ${(["可用", "全部", "收藏"] as const).map((f) => `<button class="comp-filter ${ctx.activeFilter === f ? "is-active" : ""}" data-filter="${f}">${f}</button>`).join("")}
  </div>`;

  const list = filtered.length
    ? `<div class="comp-skin-grid">
        ${filtered.map((skin) => {
          const fav = ctx.favoriteSkinIds.has(skin.id);
          const sel = skin.id === ctx.selectedSkinId;
          return `<button class="comp-skin-item ${sel ? "is-selected" : ""} ${!skin.available ? "is-locked" : ""}" data-skin-id="${skin.id}" ${ctx.busy ? "disabled" : ""}>
            <div class="comp-skin-thumb">
              ${ctx.skinImage(skin, false)}
              ${skin.selected ? `<span class="comp-badge is-live">使用中</span>` : !skin.available ? `<span class="comp-badge">未拥有</span>` : ""}
              ${fav ? `<span class="comp-fav-dot" title="已收藏"></span>` : ""}
            </div>
            <span class="comp-skin-name">${e(skin.name)}</span>
          </button>`;
        }).join("")}
      </div>`
    : `<div class="comp-list-empty">${snapshot.skins.length ? "没有符合筛选条件的皮肤" : "进入选人后自动加载皮肤列表"}</div>`;

  return `${benchHtml}${stage}${tools}${list}`;
}

function renderCompanionBuild(ctx: CompanionRenderContext): string {
  const { escape: e, icon, buildDetail, buildLoading, buildError, buildHeroId } = ctx;
  if (!buildHeroId) {
    return `<div class="comp-empty-hero">
      ${icon("swords", 26)}
      <strong>等待锁定英雄</strong>
      <span>选人阶段选择英雄后，这里会自动加载该英雄的海克斯符文、加点与核心出装。</span>
    </div>`;
  }
  if (buildLoading && !buildDetail) {
    return `<div class="comp-empty-hero">
      <span class="loading-spinner">${icon("loader-circle", 22)}</span>
      <strong>正在读取构筑数据</strong>
      <span>自动同步当前所选英雄的官方推荐…</span>
    </div>`;
  }
  if (buildError && !buildDetail) {
    return `<div class="comp-empty-hero">
      ${icon("info", 24)}
      <strong>暂时无法读取该英雄构筑</strong>
      <span>${e(buildError)}</span>
      <button class="secondary-button" data-action="companion-build-refresh">重试</button>
    </div>`;
  }
  if (!buildDetail) return "";

  const hero = buildDetail.hero;
  const topRunes = [...buildDetail.runes]
    .sort((a, b) => {
      const g: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };
      return (g[b.strength ?? ""] ?? 0) - (g[a.strength ?? ""] ?? 0) || (b.pickRate ?? 0) - (a.pickRate ?? 0);
    })
    .slice(0, 6);
  const topSkill = buildDetail.skills[0];
  const coreEquip = buildDetail.equipment.find((s) => s.key === "core") ?? buildDetail.equipment[0];
  const topPartners = buildDetail.partners.slice(0, 3);

  return `<div class="comp-build">
    <div class="comp-build-head">
      <div class="comp-build-hero">
        ${hero ? ctx.gameIcon(hero.name, "#6b8afd", hero.iconPath ?? undefined, hero.iconUrl ?? undefined, "champion") : ""}
        <div>
          <strong>${e(hero?.name ?? ctx.snapshot.championName ?? "当前英雄")}</strong>
          <span>${hero ? `强度 ${e(hero.tier)} · 胜率 ${hero.winRate.toFixed(1)}% · #${hero.rank}` : "海克斯大乱斗速查"}</span>
        </div>
      </div>
      <button class="companion-icon-btn" data-action="companion-build-refresh" title="刷新构筑" ${buildLoading ? "disabled" : ""}>
        ${icon("refresh-ccw", 14)}
      </button>
    </div>

    ${topSkill ? `<section class="comp-sec">
      <h3>主升技能</h3>
      <div class="comp-skill-order">
        <strong>${topSkill.order.map(e).join(" > ")}</strong>
        <span class="num">胜率 ${topSkill.winRate.toFixed(1)}% · 登场 ${topSkill.pickRate.toFixed(1)}%</span>
      </div>
    </section>` : ""}

    <section class="comp-sec">
      <h3>推荐海克斯符文</h3>
      <div class="comp-rune-list">
        ${topRunes.map((r) => `<div class="comp-rune-row" title="${e(r.description || r.name)}">
          ${ctx.gameIcon(r.name, "#6b8afd", r.iconPath ?? undefined, r.iconUrl ?? undefined, "augment")}
          <div class="comp-rune-text">
            <strong>${e(r.name)}</strong>
            <span>${e(HEX_QUALITIES[r.quality] ?? "符文")}</span>
          </div>
          <span class="comp-grade comp-grade--${e(r.strength ?? "C")}">${e(r.strength ?? "—")}</span>
          <span class="comp-rate num">${r.pickRate != null ? `${r.pickRate.toFixed(1)}%` : "—"}</span>
        </div>`).join("")}
      </div>
    </section>

    ${coreEquip?.rows.length ? `<section class="comp-sec">
      <h3>${e(coreEquip.title)}</h3>
      <div class="comp-equip-list">
        ${coreEquip.rows.slice(0, 2).map((row) => `<div class="comp-equip-row">
          <div class="comp-equip-items">${row.items.map((item) => `<span class="comp-item-chip" title="${e(item.name)}">${e(item.name)}</span>`).join("")}</div>
          <span class="comp-rate num">${row.winRate.toFixed(1)}%</span>
        </div>`).join("")}
      </div>
    </section>` : ""}

    ${topPartners.length ? `<section class="comp-sec">
      <h3>最佳拍档</h3>
      <div class="comp-partners">
        ${topPartners.map((p) => `<span class="comp-partner-chip">${e(p.hero.name)} <b class="num">${p.winRate.toFixed(1)}%</b></span>`).join("")}
      </div>
    </section>` : ""}
  </div>`;
}

function renderOngoingPlayerCard(ctx: CompanionRenderContext, p: OngoingPlayer): string {
  const { escape: e, icon, quickTagPuuid } = ctx;
  const champIcon = p.championId
    ? ctx.gameIcon(p.championName ?? p.gameName, "#6b8afd", `/lol-game-data/assets/v1/champion-icons/${p.championId}.png`, undefined, "champion")
    : `<span class="comp-og-avatar">${e(Array.from(p.gameName).slice(0, 2).join(""))}</span>`;
  const tagOpen = quickTagPuuid === p.puuid;
  const scoreClass = (p.score ?? 0) >= 75 ? "is-high" : (p.score ?? 100) < 50 ? "is-low" : "";

  return `<article class="comp-og-card ${p.isSelf ? "is-self" : ""}">
    <div class="comp-og-row">
      ${champIcon}
      <div class="comp-og-main">
        <div class="comp-og-name">
          <strong>${e(p.gameName)}</strong>
          ${p.premadeGroup ? `<span class="comp-og-premade">开黑${e(p.premadeGroup)}</span>` : ""}
          ${p.position ? `<span class="comp-og-pos">${e(p.position)}</span>` : ""}
        </div>
        <div class="comp-og-meta num">
          <span>${e(p.rankLabel)}</span>
          <span>胜率 ${p.winRate !== null ? `${p.winRate}%` : "—"}</span>
          <span>KDA ${p.avgKda !== null ? p.avgKda.toFixed(1) : "—"}</span>
        </div>
      </div>
      <div class="comp-og-right">
        ${p.score !== null ? `<span class="comp-og-score num ${scoreClass}">${p.score}</span>` : ""}
        ${!p.isSelf ? `<button class="companion-icon-btn ${p.saved ? "is-active" : ""}" data-quick-tag-toggle="${e(p.puuid)}" title="标记玩家">${icon("star", 13)}</button>` : ""}
      </div>
    </div>
    ${(p.tags.length || p.recentGames.length) ? `<div class="comp-og-sub">
      <div class="comp-og-tags">
        ${p.tags.slice(0, 3).map((tag) => `<span class="comp-og-tag ${tag === "拉黑" || tag.includes("连败") ? "is-bad" : tag === "大腿" || tag.includes("连胜") || tag === "高胜率" ? "is-good" : ""}">${e(tag)}</span>`).join("")}
      </div>
      <div class="comp-og-dots" aria-label="近期胜负">
        ${p.recentGames.slice(0, 5).map((g) => `<span class="comp-wl-dot is-${g.result}" title="${g.kills}/${g.deaths}/${g.assists}"></span>`).join("")}
      </div>
    </div>` : ""}
    ${tagOpen ? `<div class="comp-og-tagbar">
      ${(["大腿", "靠谱", "谨慎", "拉黑"] as const).map((preset) => `<button class="comp-og-preset ${p.saved?.tag === preset ? "is-active" : ""}" data-quick-tag-set="${e(p.puuid)}" data-tag-value="${preset}">${preset}</button>`).join("")}
      ${p.saved ? `<button class="comp-og-preset" data-quick-tag-clear="${e(p.puuid)}">清除</button>` : ""}
    </div>` : ""}
  </article>`;
}

function renderCompanionOngoing(ctx: CompanionRenderContext): string {
  const { escape: e, icon, ongoingGame, ongoingLoading, ongoingError, sendingChat } = ctx;
  if (ongoingLoading && !ongoingGame) {
    return `<div class="comp-empty-hero">
      <span class="loading-spinner">${icon("loader-circle", 22)}</span>
      <strong>正在分析本局玩家</strong>
    </div>`;
  }
  if (ongoingError && !ongoingGame) {
    return `<div class="comp-empty-hero">
      ${icon("info", 22)}
      <strong>暂时无法分析对局</strong>
      <span>${e(ongoingError)}</span>
      <button class="secondary-button" data-action="companion-ongoing-refresh">重试</button>
    </div>`;
  }
  if (!ongoingGame || !ongoingGame.active) {
    return `<div class="comp-empty-hero">
      ${icon("users", 24)}
      <strong>等待进入房间或选人</strong>
      <button class="secondary-button" data-action="companion-ongoing-refresh" ${ongoingLoading ? "disabled" : ""}>刷新</button>
    </div>`;
  }

  return `<div class="comp-ongoing">
    <div class="comp-build-head">
      <div class="comp-og-head-title">
        <strong>${e(ongoingGame.stageLabel)}</strong>
        <span class="num">${ongoingGame.myTeam.length + ongoingGame.enemyTeam.length} 人</span>
      </div>
      <div class="comp-og-head-actions">
        ${ongoingGame.canSendChat ? `<button class="secondary-button comp-chat-btn" data-action="companion-send-chat" ${sendingChat ? "disabled" : ""}>${sendingChat ? "发送中" : "发战绩"}</button>` : ""}
        <button class="companion-icon-btn" data-action="companion-ongoing-refresh" title="刷新本局分析" ${ongoingLoading ? "disabled" : ""}>
          ${icon("refresh-ccw", 14)}
        </button>
      </div>
    </div>

    ${ongoingGame.myTeam.length ? `<section class="comp-sec">
      <h3>我方</h3>
      <div class="comp-og-list">
        ${ongoingGame.myTeam.map((p) => renderOngoingPlayerCard(ctx, p)).join("")}
      </div>
    </section>` : ""}

    ${ongoingGame.enemyTeam.length ? `<section class="comp-sec">
      <h3>敌方</h3>
      <div class="comp-og-list">
        ${ongoingGame.enemyTeam.map((p) => renderOngoingPlayerCard(ctx, p)).join("")}
      </div>
    </section>` : ""}
  </div>`;
}

const MANUAL_TIMER_LANES = [
  { key: "top", label: "上路", spell1: { name: "闪现", cd: 300 }, spell2: { name: "传送", cd: 300 } },
  { key: "jg", label: "打野", spell1: { name: "闪现", cd: 300 }, spell2: { name: "惩戒", cd: 90 } },
  { key: "mid", label: "中路", spell1: { name: "闪现", cd: 300 }, spell2: { name: "点燃", cd: 180 } },
  { key: "bot", label: "下路", spell1: { name: "闪现", cd: 300 }, spell2: { name: "治疗", cd: 240 } },
  { key: "sup", label: "辅助", spell1: { name: "闪现", cd: 300 }, spell2: { name: "虚弱", cd: 240 } },
] as const;

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function renderSpellTimerButton(
  key: string,
  name: string,
  cdSeconds: number,
  spellCooldowns: Record<string, number>,
  nowMs: number,
  escape: (s: string) => string,
): string {
  const expiresAt = spellCooldowns[key] ?? 0;
  const remaining = Math.ceil((expiresAt - nowMs) / 1000);
  const active = remaining > 0;
  return `<button class="comp-cd-btn ${active ? "is-cooling" : ""}" data-spell-timer-key="${escape(key)}" data-spell-timer-cd="${cdSeconds}">
    <span>${escape(name)}</span>
    <b class="num">${active ? `${remaining}s` : `${cdSeconds}s`}</b>
  </button>`;
}

function renderCompanionTimer(ctx: CompanionRenderContext): string {
  const { escape: e, icon, liveTimers, spellCooldowns, nowMs } = ctx;
  const inGame = Boolean(liveTimers?.inGame);

  if (inGame && liveTimers) {
    const respawn = liveTimers.selfRespawn;
    return `<div class="comp-timer">
      <div class="comp-build-head">
        <div class="comp-og-head-title">
          <strong>对局计时</strong>
          <span class="num">${formatClock(liveTimers.gameTimeSeconds)}</span>
        </div>
        <div class="comp-og-head-actions">
          <button class="secondary-button comp-chat-btn" data-action="reset-spell-timers">重置</button>
          <button class="companion-icon-btn" data-action="refresh-live-timers" title="刷新对局数据">${icon("refresh-ccw", 14)}</button>
        </div>
      </div>

      ${respawn?.isDead ? `<div class="comp-respawn-banner">
        <span>${e(respawn.championName)} 复活倒计时</span>
        <strong class="num">${Math.ceil(respawn.respawnTimer)}s</strong>
      </div>` : ""}

      <div class="comp-timer-list">
        ${liveTimers.enemies.map((enemy, idx) => `<div class="comp-timer-row">
          <div class="comp-timer-who">
            <strong>${e(enemy.championName)}</strong>
            <span class="num">
              ${enemy.isDead ? `阵亡 ${Math.ceil(enemy.respawnTimer)}s` : e(enemy.summonerName)}
              ${enemy.hasIonianBoots ? " · CD鞋" : ""}${enemy.hasCosmicInsight ? " · 星界" : ""}
            </span>
          </div>
          <div class="comp-timer-spells">
            ${renderSpellTimerButton(`live-${idx}-1`, enemy.spell1.name, enemy.spell1.effectiveCd, spellCooldowns, nowMs, e)}
            ${renderSpellTimerButton(`live-${idx}-2`, enemy.spell2.name, enemy.spell2.effectiveCd, spellCooldowns, nowMs, e)}
          </div>
        </div>`).join("")}
      </div>
    </div>`;
  }

  return `<div class="comp-timer">
    <div class="comp-build-head">
      <div class="comp-og-head-title">
        <strong>技能计时</strong>
        <span>手动模式</span>
      </div>
      <div class="comp-og-head-actions">
        <button class="secondary-button comp-chat-btn" data-action="reset-spell-timers">重置</button>
        <button class="companion-icon-btn" data-action="refresh-live-timers" title="检测对局">${icon("refresh-ccw", 14)}</button>
      </div>
    </div>
    <div class="comp-timer-list">
      ${MANUAL_TIMER_LANES.map((lane) => `<div class="comp-timer-row">
        <div class="comp-timer-who">
          <strong>${lane.label}</strong>
        </div>
        <div class="comp-timer-spells">
          ${renderSpellTimerButton(`manual-${lane.key}-1`, lane.spell1.name, lane.spell1.cd, spellCooldowns, nowMs, e)}
          ${renderSpellTimerButton(`manual-${lane.key}-2`, lane.spell2.name, lane.spell2.cd, spellCooldowns, nowMs, e)}
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}
