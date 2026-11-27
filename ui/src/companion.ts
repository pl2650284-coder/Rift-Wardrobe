import { invoke } from "@tauri-apps/api/core";
import type { HexDetail } from "./data/hextech";
import { HEX_QUALITIES } from "./hextech-view";

export type CompanionTab = "skin" | "build";

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

export function renderCompanionShell(ctx: CompanionRenderContext): string {
  const { escape: e, icon, snapshot, tab, pinned } = ctx;
  const ready = snapshot.connection === "ready" && snapshot.active;
  const champLabel = snapshot.championName ?? (snapshot.connection === "ready" ? "等待选人" : "未连接");
  const body = tab === "skin" ? renderCompanionSkins(ctx) : renderCompanionBuild(ctx);

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
        ${icon("sparkles", 14)}<span>选人换肤</span>
      </button>
      <button class="companion-tab ${tab === "build" ? "is-active" : ""}" role="tab" aria-selected="${tab === "build"}" data-companion-tab="build">
        ${icon("swords", 14)}<span>海克斯速查</span>
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
    </footer>
  </div>`;
}

function renderCompanionSkins(ctx: CompanionRenderContext): string {
  const { escape: e, icon, snapshot } = ctx;
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

  return `${stage}${tools}${list}`;
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
