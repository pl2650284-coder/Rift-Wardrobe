import { invoke } from "@tauri-apps/api/core";
import type { OfficialRanking, RankingHero, RankingMode, RankingOption, RankingQuery, RankingRow } from "./data/rankings";

const MODES: Record<RankingMode, string> = { rift: "峡谷", aram: "极地大乱斗", classic: "经典模式" };
const POSITIONS: Record<string, string> = { all: "全部", top: "上路", jungle: "打野", mid: "中路", bottom: "下路", support: "辅助" };
const ROLES: Record<string, string> = { all: "综合", tank: "坦克", fighter: "战士", mage: "法师", assassin: "刺客", marksman: "射手", support: "辅助" };
type Sort = { field: "rank" | "tier" | "winRate" | "pickRate" | "banRate"; asc: boolean };
type State = {
  query: RankingQuery; data: OfficialRanking | null; versions: RankingOption[]; tiers: RankingOption[];
  search: string; role: string; sort: Sort; error: string; loading: boolean; request: number;
  requestKey: string; loadedKey: string; loadedAt: number;
};
type Hooks = {
  isNative: boolean; activeMode: () => string; render: () => void; escape: (s: string) => string;
  icon: (name: string, size?: number) => string;
  image: (name: string, color: string, path?: string, url?: string, kind?: string, extraClass?: string) => string;
};
function isMode(mode: string): mode is RankingMode { return Object.hasOwn(MODES, mode); }
function queryKey(query: RankingQuery) { return JSON.stringify(query); }
export function selectRankingRows(rows: RankingRow[], search: string, role: string, sort: Sort): RankingRow[] {
  const needle = search.trim().toLocaleLowerCase("zh-CN");
  return rows.filter(row => (!needle || (row.name + row.title + row.heroId).toLocaleLowerCase("zh-CN").includes(needle)) && (role === "all" || row.roles.includes(role)))
    .sort((a, b) => {
      const value = (row: RankingRow) => sort.field === "tier" ? row.tier == null ? null : Number(row.tier.slice(1)) : row[sort.field];
      const left = value(a), right = value(b);
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      return (left - right) * (sort.asc ? 1 : -1);
    });
}
function validate(data: OfficialRanking, query: RankingQuery) {
  if (!data || data.mode !== query.mode || data.lane !== query.lane || data.tier !== query.tier
    || (query.version !== null && data.version !== query.version)
    || !Array.isArray(data.rows) || !Array.isArray(data.versions) || !Array.isArray(data.tiers) || !Array.isArray(data.warnings)
    || (data.rows.length > 0 && !/^[0-9]{8}$/.test(data.statsDate ?? ""))
    || data.rows.some(row => typeof row.key !== "string" || !Number.isInteger(row.heroId) || !Number.isFinite(row.winRate) || !Number.isFinite(row.pickRate))) {
    throw new Error("官方榜单数据与当前筛选条件不匹配，请刷新重试");
  }
}
export function createRankingsView(h: Hooks) {
  const e = h.escape;
  const initialState = (mode: RankingMode): State => ({
    query: { mode, lane: "all", tier: mode === "rift" ? 26 : null, version: null }, data: null, versions: [], tiers: [],
    search: "", role: "all", sort: { field: mode === "aram" ? "rank" : "tier", asc: true }, error: "", loading: false,
    request: 0, requestKey: "", loadedKey: "", loadedAt: 0,
  });
  const states = { rift: initialState("rift"), aram: initialState("aram"), classic: initialState("classic") };
  function notify(mode: RankingMode) { if (h.activeMode() === mode) h.render(); }
  async function load(mode: RankingMode, force = false) {
    const state = states[mode];
    const key = queryKey(state.query);
    if (!force && ((state.loading && state.requestKey === key) || (state.data && state.loadedKey === key && Date.now() - state.loadedAt < 15 * 60_000))) return;
    const request = ++state.request;
    const query = { ...state.query };
    state.requestKey = key; state.loading = true; state.error = ""; state.data = null;
    notify(mode);
    try {
      if (!h.isNative) throw new Error("请在桌面应用中读取官方榜单");
      const data = await invoke<OfficialRanking>("get_official_ranking", { query, force });
      validate(data, query);
      if (request !== state.request) return;
      state.data = data; state.versions = data.versions; state.tiers = data.tiers;
      state.query.version = data.version;
      state.loadedKey = queryKey(state.query); state.loadedAt = data.rows.length ? Date.now() : 0;
    } catch (error) {
      if (request === state.request) state.error = String(error instanceof Error ? error.message : error);
    } finally {
      if (request === state.request) { state.loading = false; notify(mode); }
    }
  }
  function setFilter(mode: RankingMode, patch: Partial<Pick<RankingQuery, "lane" | "tier" | "version">>) {
    const state = states[mode];
    state.query = { ...state.query, ...patch };
    void load(mode);
  }
  const pct = (value: number | null) => value == null ? "未提供" : value.toFixed(2) + "%";
  const date = (s: string | null) => s ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6) : "暂无";
  const image = (hero: RankingHero, extra = "") => h.image(hero.name, "#bda36b", hero.iconPath ?? undefined, hero.iconUrl ?? undefined, "champion", extra);
  function sortButton(state: State, label: string, field: Sort["field"]) {
    const selected = state.sort.field === field;
    return '<button class="hex-sort" data-ranking-sort="' + field + '" aria-pressed="' + selected + '" aria-label="按' + label + '排序">' + label + '<span>' + (selected ? state.sort.asc ? " ↑" : " ↓" : " ↕") + '</span></button>';
  }
  function filterSelect(label: string, key: string, value: string | number | null, options: RankingOption[], disabled: boolean) {
    return '<label class="ranking-select"><span>' + label + '</span><select aria-label="' + label + '" data-ranking-filter="' + key + '" ' + (disabled ? 'disabled' : '') + '>' + options.map(option => '<option value="' + e(option.value) + '" ' + (String(value) === option.value ? 'selected' : '') + '>' + e(option.label) + '</option>').join("") + '</select></label>';
  }
  function rankChange(row: RankingRow) {
    if (row.rankChange == null || row.rankChange === "0" || row.rankChange === "未变化") return "";
    const change = Number(row.rankChange);
    return '<small class="ranking-change ' + (change > 0 ? 'stat-strong' : change < 0 ? 'trend--down' : '') + '">' + (Number.isFinite(change) ? (change > 0 ? '↑ ' : '↓ ') + Math.abs(change) : e(row.rankChange)) + '</small>';
  }
  function renderPage(mode: RankingMode, navigation: string) {
    const state = states[mode], data = state.data;
    const rows = selectRankingRows(data?.rows ?? [], state.search, state.role, state.sort);
    const isRift = mode === "rift", isAram = mode === "aram";
    const filters = isAram ? ROLES : POSITIONS;
    const activeFilter = isAram ? state.role : state.query.lane;
    const versions = state.versions.length ? state.versions : [{ value: "", label: "读取版本中" }];
    const tiers = state.tiers.length ? state.tiers : [{ value: "26", label: "翡翠+" }];
    const empty = state.loading ? '正在读取' + MODES[mode] + '官方英雄榜…' : state.error ? state.error : data ? '官网暂无符合条件的英雄数据' : '等待加载官方榜单';
    return navigation + '<section class="official-ranking" data-ranking-mode="' + mode + '"><header class="page-head"><div><span class="eyebrow">' + MODES[mode] + '</span><h2>英雄榜</h2><p>英雄联盟国服官网统计</p></div><div><div class="data-freshness">101.qq.com' + (data ? ' · 统计日期 ' + date(data.statsDate) : '') + '</div><button class="secondary-button news-refresh" data-ranking-refresh ' + (state.loading ? 'disabled' : '') + '>' + h.icon("refresh-ccw", 15) + '刷新榜单</button></div></header>'
      + (data?.warnings.length ? '<div class="profile-notice news-notice" role="status">' + h.icon("info", 16) + '<span>' + data.warnings.map(e).join('；') + '</span></div>' : '')
      + (isRift ? '<div class="ranking-settings">' + filterSelect('段位', 'tier', state.query.tier, tiers, !state.tiers.length) + filterSelect('版本', 'version', state.query.version, versions, !state.versions.length) + '</div>' : '')
      + '<div class="segmented ranking-positions" aria-label="' + (isAram ? '英雄职业' : '分路位置') + '">' + Object.entries(filters).map(([key, name]) => '<button class="segment ' + (activeFilter === key ? 'segment--active' : '') + '" data-ranking-position="' + key + '" aria-pressed="' + (activeFilter === key) + '">' + name + '</button>').join('') + '</div>'
      + '<div class="news-toolbar"><label class="search-box"><input type="search" maxlength="50" placeholder="搜索英雄" aria-label="搜索' + MODES[mode] + '英雄" value="' + e(state.search) + '" data-ranking-search /></label><span class="filter-caption">共 ' + rows.length + (isRift ? ' 条英雄位置记录' : ' 位英雄') + '</span></div>'
      + '<div class="hex-table-wrap"><table class="hex-table ranking-table ranking-table--' + mode + '"><thead><tr><th>' + sortButton(state, '排名', 'rank') + '</th><th>英雄</th>' + (!isAram ? '<th>' + sortButton(state, 'T级', 'tier') + '</th>' : '') + (isRift ? '<th>位置</th>' : '') + '<th>' + sortButton(state, '胜率', 'winRate') + '</th><th>' + sortButton(state, isRift ? '登场率' : '出场率', 'pickRate') + '</th>' + (isRift ? '<th>' + sortButton(state, '禁用率', 'banRate') + '</th><th>反制</th>' : '') + '</tr></thead><tbody>'
      + rows.map((row, index) => '<tr data-ranking-row="' + e(row.key) + '"><td title="官网原始排名 ' + row.rank + '">' + (index + 1) + (isRift && state.query.lane !== 'all' ? rankChange(row) : '') + '</td><td><span class="hex-asset">' + image(row) + '<span><strong>' + e(row.name) + '</strong><small>' + e(row.title) + '</small></span></span></td>' + (!isAram ? '<td><span class="hex-tier">' + e(row.tier ?? '未提供') + '</span></td>' : '') + (isRift ? '<td>' + e(POSITIONS[row.lane ?? ''] ?? '未提供') + '</td>' : '') + '<td class="stat-strong">' + pct(row.winRate) + '</td><td>' + pct(row.pickRate) + '</td>' + (isRift ? '<td>' + pct(row.banRate) + '</td><td><div class="ranking-counters">' + row.counters.map(hero => '<span title="' + e(hero.name + ' · ' + hero.title) + '">' + image(hero, 'ranking-counter-icon') + '</span>').join('') + '</div></td>' : '') + '</tr>').join('') + '</tbody></table>'
      + (!rows.length ? '<div class="empty-state" role="status"><span>' + e(empty) + '</span>' + (state.error ? '<button class="secondary-button" data-ranking-refresh>重试</button>' : '') + '</div>' : '') + '</div></section>';
  }
  function bind(container: HTMLElement) {
    const root = container.querySelector<HTMLElement>('[data-ranking-mode]');
    const mode = root?.dataset.rankingMode;
    if (!root || !mode || !isMode(mode)) return;
    const state = states[mode];
    root.querySelectorAll<HTMLElement>('[data-ranking-refresh]').forEach(el => el.addEventListener('click', () => { void load(mode, true); }));
    root.querySelectorAll<HTMLSelectElement>('[data-ranking-filter]').forEach(el => el.addEventListener('change', () => {
      if (el.dataset.rankingFilter === 'tier') setFilter(mode, { tier: Number(el.value) });
      if (el.dataset.rankingFilter === 'version') setFilter(mode, { version: el.value });
    }));
    root.querySelectorAll<HTMLElement>('[data-ranking-position]').forEach(el => el.addEventListener('click', () => {
      const value = el.dataset.rankingPosition!;
      if (mode === 'aram') { state.role = value; notify(mode); }
      else setFilter(mode, { lane: value });
    }));
    root.querySelectorAll<HTMLElement>('[data-ranking-sort]').forEach(el => el.addEventListener('click', () => {
      const field = el.dataset.rankingSort as Sort['field'];
      state.sort = { field, asc: field === state.sort.field ? !state.sort.asc : field === 'tier' || field === 'rank' };
      notify(mode);
    }));
    root.querySelector<HTMLInputElement>('[data-ranking-search]')?.addEventListener('input', event => {
      state.search = (event.currentTarget as HTMLInputElement).value;
      notify(mode);
      container.querySelector<HTMLInputElement>('[data-ranking-search]')?.focus();
    });
  }
  return { load, setFilter, renderPage, bind };
}
