import { invoke } from "@tauri-apps/api/core";
import type { HexAsset, HexDetail, HexHero, HexRanking, HexRune } from "./data/hextech";

export const HEX_ROLES: Record<string, string> = { all: "综合", tank: "坦克", fighter: "战士", mage: "法师", assassin: "刺客", marksman: "射手", support: "辅助" };
export const HEX_QUALITIES: Record<string, string> = { all: "全部", kSilver: "白银阶", kGold: "黄金阶", kPrismatic: "棱彩阶" };
export type HexSort = { field: string; asc: boolean };
const grade: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };
export function sortHexRows<T>(rows: T[], sort: HexSort): T[] {
  return [...rows].sort((a, b) => {
    const value = (r: T) => { const v = (r as Record<string, unknown>)[sort.field]; return sort.field === "strength" ? grade[String(v)] ?? -1 : typeof v === "number" ? v : -1; };
    const diff = (value(a) - value(b)) * (sort.asc ? 1 : -1);
    if (diff) return diff;
    const pa = (a as Record<string, unknown>).pickRate, pb = (b as Record<string, unknown>).pickRate;
    return typeof pa === "number" && typeof pb === "number" ? pb - pa : 0;
  });
}
export function selectHexRunes(rows: HexRune[], quality: string, query: string, sort: HexSort, page: number) {
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = sortHexRows(rows.filter(r => (quality === "all" || r.quality === quality) && (!needle || r.name.toLocaleLowerCase("zh-CN").includes(needle))), sort);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: filtered.slice((current - 1) * 10, current * 10), total: filtered.length, pages, page: current };
}

type Hooks = {
  isNative: boolean;
  render: () => void;
  escape: (s: string) => string;
  icon: (name: string, size?: number) => string;
  image: (name: string, color: string, path?: string, url?: string, kind?: string, extraClass?: string) => string;
};
type Tab = "runes" | "skills" | "equipment" | "partners";
export function createHextechView(h: Hooks) {
  const e = h.escape;
  let ranking: HexRanking | null = null;
  let rankingError = "";
  let rankingLoading = false;
  let rankRequest = 0;
  let rankLoadedAt = 0;
  let query = "";
  let role = "all";
  let rankSort: HexSort = { field: "rank", asc: true };
  let selectedHero: HexHero | null = null;
  let detail: HexDetail | null = null;
  let detailError = "";
  let detailLoading = false;
  let detailRequest = 0;
  let tab: Tab = "runes";
  let quality = "all";
  let runeQuery = "";
  let runePage = 1;
  let priorityId = "";
  let sorts: Record<string, HexSort> = {};
  function resetDetail() {
    tab = "runes"; quality = "all"; runeQuery = ""; runePage = 1; priorityId = "";
    sorts = { runes: { field: "strength", asc: false }, skills: { field: "pickRate", asc: false }, partners: { field: "winRate", asc: false }, starting: { field: "pickRate", asc: false }, shoes: { field: "pickRate", asc: false }, core: { field: "winRate", asc: false }, remain: { field: "winRate", asc: false } };
  }
  resetDetail();
  const pct = (v: number | null | undefined) => v == null ? "未提供" : v.toFixed(2) + "%";
  const date = (s: string) => /^[0-9]{8}$/.test(s) ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6) : s;
  const roleText = (roles: string[]) => roles.map(r => HEX_ROLES[r] ?? r).join(" · ");
  const image = (asset: HexAsset, kind = "champion", extra = "") => h.image(asset.name, "#bda36b", asset.iconPath ?? undefined, asset.iconUrl ?? undefined, kind, extra);
  const tooltip = (asset: HexAsset) => e(asset.name + (asset.description ? String.fromCharCode(10) + asset.description : ""));
  const warnings = (items: string[]) => items.length ? '<div class="profile-notice hex-notice" role="status">' + h.icon("info", 16) + '<span>' + items.map(e).join("；") + '</span></div>' : "";
  const empty = (message = "官网暂无该项数据") => '<div class="empty-state">' + e(message) + '</div>';
  function sortButton(label: string, group: string, field: string) {
    const sort = group === "rank" ? rankSort : sorts[group];
    const active = sort?.field === field;
    return '<button class="hex-sort" data-hex-sort="' + group + '" data-field="' + field + '" aria-label="按' + label + '排序" aria-pressed="' + active + '">' + label + '<span>' + (active ? sort.asc ? " ↑" : " ↓" : " ↕") + '</span></button>';
  }
  async function loadRanking(force = false) {
    if (rankingLoading) return;
    if (ranking && !force && Date.now() - rankLoadedAt < 15 * 60_000) return;
    rankingLoading = true; rankingError = "";
    const request = ++rankRequest;
    h.render();
    try {
      if (!h.isNative) throw new Error("请在桌面应用中读取官方海克斯榜单");
      const value = await invoke<HexRanking>("get_hextech_ranking", { force });
      if (!value || !Array.isArray(value.heroes) || typeof value.statsDate !== "string") throw new Error("海克斯英雄榜格式不兼容");
      if (request === rankRequest) { ranking = value; rankLoadedAt = Date.now(); }
    } catch (error) { if (request === rankRequest) rankingError = String(error instanceof Error ? error.message : error); }
    finally { if (request === rankRequest) { rankingLoading = false; h.render(); } }
  }
  async function loadDetail(hero: HexHero, force = false) {
    const request = ++detailRequest;
    selectedHero = hero; detailLoading = true; detailError = ""; detail = null;
    h.render();
    try {
      const value = await invoke<HexDetail>("get_hextech_detail", { heroId: hero.id, force });
      if (!value || value.heroId !== hero.id || !Array.isArray(value.runes) || !Array.isArray(value.equipment) || !Array.isArray(value.skills) || !Array.isArray(value.partners)) throw new Error("海克斯英雄详情格式不兼容");
      if (request === detailRequest) { detail = value; priorityId = value.skills[0]?.id ?? ""; }
    } catch (error) { if (request === detailRequest) detailError = String(error instanceof Error ? error.message : error); }
    finally { if (request === detailRequest) { detailLoading = false; h.render(); } }
  }
  function renderRunes() {
    if (!detail) return "";
    const result = selectHexRunes(detail.runes, quality, runeQuery, sorts.runes, runePage);
    return '<div class="hex-rune-tools"><div class="segmented">' + Object.entries(HEX_QUALITIES).map(([key, name]) => '<button class="segment ' + (key === quality ? 'segment--active' : '') + '" data-hex-quality="' + key + '" aria-pressed="' + (key === quality) + '">' + name + '</button>').join("") + '</div><label class="search-box"><input type="search" maxlength="50" placeholder="搜索符文" aria-label="搜索英雄海克斯符文" data-hex-rune-search value="' + e(runeQuery) + '" /></label></div><div class="hex-table-wrap"><table class="hex-table"><thead><tr><th>符文名</th><th>' + sortButton("强度", "runes", "strength") + '</th><th>' + sortButton("登场率", "runes", "pickRate") + '</th></tr></thead><tbody>' + result.rows.map(r => '<tr><td><span class="hex-asset" title="' + tooltip(r) + '" tabindex="0">' + image(r, "augment") + '<span><strong>' + e(r.name) + '</strong><small>' + e(HEX_QUALITIES[r.quality] ?? "品质未提供") + '</small></span></span></td><td><span class="hex-grade hex-grade--' + e(r.strength ?? "unknown") + '">' + e(r.strength ?? "—") + '</span></td><td>' + pct(r.pickRate) + '</td></tr>').join("") + '</tbody></table></div>' + (!result.total ? empty("没有符合筛选条件的符文") : '') + '<div class="hex-pagination"><span>共 ' + result.total + ' 个符文 · 每页 10 条</span><div><button class="secondary-button" data-hex-page="' + (result.page - 1) + '" ' + (result.page === 1 ? 'disabled' : '') + '>上一页</button><span>' + result.page + ' / ' + result.pages + '</span><button class="secondary-button" data-hex-page="' + (result.page + 1) + '" ' + (result.page === result.pages ? 'disabled' : '') + '>下一页</button></div></div><p class="hex-note">强度为官方 S / A / B / C 评级；白银、黄金、棱彩表示品质。官网未提供逐英雄、逐符文胜率与样本数。</p>';
  }
  function skillImage(key: string) {
    const spell = detail?.spells.find(s => s.key === key);
    return '<span class="hex-skill" title="' + (spell ? tooltip(spell) : e(key)) + '">' + (spell ? image(spell, "skill") : "") + '<b>' + e(key) + '</b></span>';
  }
  function renderSkills() {
    if (!detail?.skills.length) return empty();
    const priority = detail.skills.find(s => s.id === priorityId) ?? detail.skills[0];
    const plans = sortHexRows(priority.plans, sorts.skills).slice(0, 5);
    return '<h3>技能升级优先级</h3><div class="hex-priorities">' + detail.skills.map(s => '<button class="hex-priority ' + (s.id === priority.id ? 'is-active' : '') + '" data-hex-priority="' + e(s.id) + '" aria-pressed="' + (s.id === priority.id) + '"><strong>' + s.order.map(e).join(" → ") + '</strong><span>登场率 <b>' + pct(s.pickRate) + '</b></span><span>胜率 <b>' + pct(s.winRate) + '</b></span></button>').join("") + '</div><h3>技能加点推荐</h3><div class="hex-table-wrap"><table class="hex-table hex-skill-table"><thead><tr><th>推荐方案</th><th>逐级加点顺序</th><th>' + sortButton("登场率", "skills", "pickRate") + '</th><th>' + sortButton("胜率", "skills", "winRate") + '</th></tr></thead><tbody>' + plans.map((p, i) => '<tr><td>' + (i + 1) + ' · ' + priority.order.map(e).join(" → ") + '</td><td><div class="hex-skill-sequence">' + p.order.map((key, i) => '<span class="hex-level" title="顺序 ' + (i + 1) + '">' + skillImage(key) + '<small>' + (i + 1) + '</small></span>').join("") + '</div></td><td>' + pct(p.pickRate) + '</td><td class="stat-strong">' + pct(p.winRate) + '</td></tr>').join("") + '</tbody></table></div>' + (!plans.length ? empty() : '');
  }
  function renderEquipment() {
    return detail?.equipment.map(section => '<section class="hex-equipment"><h3>' + e(section.title) + '</h3><div class="hex-table-wrap"><table class="hex-table"><thead><tr><th>装备</th><th>' + sortButton("登场率", section.key, "pickRate") + '</th><th>' + sortButton("胜率", section.key, "winRate") + '</th></tr></thead><tbody>' + sortHexRows(section.rows, sorts[section.key]).map(row => '<tr><td><div class="hex-item-combo">' + row.items.map(item => '<span class="hex-item" tabindex="0" title="' + tooltip(item) + '">' + image(item, "item") + '<small>' + e(item.name) + '</small></span>').join('<span class="hex-plus">+</span>') + '</div></td><td>' + pct(row.pickRate) + '</td><td class="stat-strong">' + pct(row.winRate) + '</td></tr>').join("") + '</tbody></table></div>' + (!section.rows.length ? empty() : '') + '</section>').join("") ?? "";
  }
  function renderPartners() {
    const hero = detail?.hero ?? selectedHero;
    if (!hero || !detail?.partners.length) return empty();
    return '<div class="hex-table-wrap"><table class="hex-table hex-partner-table"><thead><tr><th>排名</th><th>英雄组合</th><th>' + sortButton("胜率", "partners", "winRate") + '</th><th>' + sortButton("登场率", "partners", "pickRate") + '</th></tr></thead><tbody>' + sortHexRows(detail.partners, sorts.partners).map((p, i) => '<tr><td>' + (i + 1) + '</td><td><div class="hex-pair"><span class="hex-asset">' + image(hero) + '<span><strong>' + e(hero.name) + '</strong><small>' + e(roleText(hero.roles)) + '</small></span></span><span class="hex-plus">+</span><button class="hex-asset hex-partner-link" data-hex-hero="' + p.hero.id + '" aria-label="查看' + e(p.hero.name) + '海克斯详情">' + image(p.hero) + '<span><strong>' + e(p.hero.name) + '</strong><small>' + e(roleText(p.roles)) + '</small></span></button></div></td><td class="stat-strong">' + pct(p.winRate) + '</td><td>' + pct(p.pickRate) + '</td></tr>').join("") + '</tbody></table></div>';
  }
  function renderDetail() {
    if (!selectedHero) return "";
    // A detail response can have an older official date than the latest hero ranking.
    const hero = detail ? detail.hero : selectedHero;
    const display = hero ?? selectedHero;
    const tabs: Record<Tab, string> = { runes: "符文", skills: "技能加点", equipment: "出装", partners: "最佳拍档" };
    const change = hero?.pickChange;
    return '<div class="detail-backdrop hex-backdrop" data-hex-close><section class="hex-detail" role="dialog" aria-modal="true" aria-label="海克斯大乱斗英雄详情"><header class="hex-detail-heading"><div><span class="eyebrow">海克斯大乱斗 · 英雄详情</span><h2>' + e(display.name) + ' · ' + e(display.title) + '</h2></div><div class="hex-detail-actions"><button class="secondary-button" data-hex-detail-refresh ' + (detailLoading ? 'disabled' : '') + '>刷新详情</button><button class="icon-button" data-hex-close aria-label="关闭海克斯英雄详情">' + h.icon("x", 18) + '</button></div></header><div class="hex-overview"><div class="hex-identity">' + image(display, "champion", "hex-portrait") + '<div><p>' + e(roleText(display.roles)) + '</p><div class="hex-spells">' + (detail?.spells.map(s => skillImage(s.key)).join("") ?? "") + '</div></div></div><div class="hex-metrics"><div><strong>' + e(hero?.tier ?? "—") + '</strong><small>海克斯强度</small></div><div><strong>' + (hero ? '#' + hero.rank : '—') + '</strong><small>国服排名</small></div><div><strong>' + pct(hero?.winRate) + '</strong><small>胜率</small></div><div><strong>' + pct(hero?.pickRate) + '</strong><small>' + (change == null ? '' : '<span class="' + (change >= 0 ? 'stat-strong' : 'trend--down') + '">' + (change >= 0 ? '+' : '') + change.toFixed(2) + '% · </span>') + '登场率</small></div></div></div><div class="hex-detail-content">' + (detailLoading ? '<div class="empty-state" role="status">正在读取官方英雄详情…</div>' : '') + (detailError ? warnings([detailError]) + '<button class="secondary-button" data-hex-detail-refresh>重试</button>' : '') + (detail ? warnings(detail.warnings) + '<h3>海克斯大乱斗推荐构筑</h3><div class="hex-detail-tabs" role="tablist">' + Object.entries(tabs).map(([key, label]) => '<button role="tab" aria-selected="' + (tab === key) + '" class="' + (tab === key ? 'is-active' : '') + '" data-hex-detail-tab="' + key + '">' + label + '</button>').join("") + '</div><div role="tabpanel">' + (tab === 'runes' ? renderRunes() : tab === 'skills' ? renderSkills() : tab === 'equipment' ? renderEquipment() : renderPartners()) + '</div>' : '') + '</div><footer>数据来源：英雄联盟国服官网 101.qq.com' + (detail ? ' · 统计日期 ' + e(date(detail.statsDate)) : '') + '</footer></section></div>';
  }
  function renderPage(tabs: string) {
    const heroes = sortHexRows((ranking?.heroes ?? []).filter(hero => (role === "all" || hero.roles.includes(role)) && (!query.trim() || (hero.name + hero.title).toLocaleLowerCase("zh-CN").includes(query.trim().toLocaleLowerCase("zh-CN")))), rankSort);
    return '<section class="page-head"><div><span class="eyebrow">HEXTECH ARAM</span><h1>海克斯大乱斗</h1><p>国服官方英雄榜与逐英雄推荐构筑。</p></div><div><div class="data-freshness">101.qq.com · ' + (ranking ? '统计日期 ' + e(date(ranking.statsDate)) : '官方数据') + '</div><button class="secondary-button news-refresh" data-hex-refresh ' + (rankingLoading ? 'disabled' : '') + '>' + h.icon("refresh-ccw", 15) + '刷新榜单</button></div></section>' + tabs + (rankingLoading ? warnings(['正在读取官方英雄榜…']) : '') + (rankingError ? warnings([rankingError]) + '<button class="secondary-button" data-hex-refresh>重试读取</button>' : '') + warnings(ranking?.warnings ?? []) + '<div class="news-toolbar hex-rank-tools"><label class="search-box"><input type="search" maxlength="50" aria-label="搜索海克斯英雄" placeholder="搜索英雄名称" data-hex-search value="' + e(query) + '" /></label><div class="segmented">' + Object.entries(HEX_ROLES).map(([key, name]) => '<button class="segment ' + (key === role ? 'segment--active' : '') + '" data-hex-role="' + key + '">' + name + '</button>').join("") + '</div></div><div class="hex-table-wrap hex-ranking"><table class="hex-table"><thead><tr><th>' + sortButton("国服排名", "rank", "rank") + '</th><th>英雄</th><th>职业</th><th>强度</th><th>' + sortButton("胜率", "rank", "winRate") + '</th><th>' + sortButton("登场率", "rank", "pickRate") + '</th><th></th></tr></thead><tbody>' + heroes.map(hero => '<tr><td>#' + hero.rank + '</td><td><button class="hex-asset hex-hero-link" data-hex-hero="' + hero.id + '">' + image(hero) + '<span><strong>' + e(hero.name) + '</strong><small>' + e(hero.title) + '</small></span></button></td><td>' + e(roleText(hero.roles)) + '</td><td><span class="hex-tier">' + e(hero.tier) + '</span></td><td class="stat-strong">' + pct(hero.winRate) + '</td><td>' + pct(hero.pickRate) + '</td><td><button class="secondary-button" data-hex-hero="' + hero.id + '">查看构筑</button></td></tr>').join("") + '</tbody></table>' + (!heroes.length && !rankingLoading && !rankingError ? empty(ranking ? '没有符合条件的英雄' : '点击刷新榜单读取官方数据') : '') + '</div><p class="hex-note">点击英雄查看符文、技能加点、出装与最佳拍档。共 ' + heroes.length + ' 位英雄。</p>' + renderDetail();
  }
  function closeDetail() { if (!selectedHero) return false; ++detailRequest; selectedHero = null; detail = null; detailLoading = false; detailError = ""; h.render(); return true; }
  function bind(container: HTMLElement) {
    container.querySelectorAll<HTMLElement>("[data-hex-refresh]").forEach(el => el.addEventListener("click", () => { void loadRanking(true); }));
    container.querySelectorAll<HTMLElement>("[data-hex-detail-refresh]").forEach(el => el.addEventListener("click", () => { if (selectedHero) void loadDetail(selectedHero, true); }));
    container.querySelectorAll<HTMLElement>("[data-hex-hero]").forEach(el => el.addEventListener("click", () => {
      const hero = ranking?.heroes.find(r => r.id === Number(el.dataset.hexHero));
      if (hero) { resetDetail(); void loadDetail(hero); }
    }));
    container.querySelectorAll<HTMLElement>("[data-hex-close]").forEach(el => el.addEventListener("click", event => { if (el.classList.contains('hex-backdrop') && event.target !== el) return; closeDetail(); }));
    container.querySelector<HTMLElement>(".hex-detail")?.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const controls = [...container.querySelectorAll<HTMLElement>(".hex-detail button:not(:disabled), .hex-detail input, .hex-detail [tabindex='0']")];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    container.querySelectorAll<HTMLElement>("[data-hex-role]").forEach(el => el.addEventListener("click", () => { role = el.dataset.hexRole!; h.render(); }));
    container.querySelectorAll<HTMLElement>("[data-hex-detail-tab]").forEach(el => el.addEventListener("click", () => { tab = el.dataset.hexDetailTab as Tab; h.render(); }));
    container.querySelectorAll<HTMLElement>("[data-hex-quality]").forEach(el => el.addEventListener("click", () => { quality = el.dataset.hexQuality!; runePage = 1; h.render(); }));
    container.querySelectorAll<HTMLElement>("[data-hex-page]").forEach(el => el.addEventListener("click", () => { runePage = Number(el.dataset.hexPage); h.render(); }));
    container.querySelectorAll<HTMLElement>("[data-hex-priority]").forEach(el => el.addEventListener("click", () => { priorityId = el.dataset.hexPriority!; h.render(); }));
    container.querySelectorAll<HTMLElement>("[data-hex-sort]").forEach(el => el.addEventListener("click", () => {
      const group = el.dataset.hexSort!, field = el.dataset.field!;
      const sort = group === "rank" ? rankSort : sorts[group];
      const next = { field, asc: sort.field === field ? !sort.asc : field === 'rank' };
      if (group === "rank") rankSort = next; else sorts[group] = next;
      if (group === "runes") runePage = 1;
      h.render();
    }));
    for (const [selector, isRune] of [["[data-hex-search]", false], ["[data-hex-rune-search]", true]] as const) {
      container.querySelector<HTMLInputElement>(selector)?.addEventListener("input", event => {
        const input = event.currentTarget as HTMLInputElement;
        const value = input.value;
        if (isRune) { runeQuery = value; runePage = 1; } else query = value;
        h.render();
        container.querySelector<HTMLInputElement>(selector)?.focus();
      });
    }
  }
  return { loadRanking, renderPage, bind, closeDetail, isOpen: () => selectedHero !== null };
}
