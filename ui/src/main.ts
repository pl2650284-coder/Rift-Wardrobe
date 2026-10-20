import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  Check,
  ChevronRight,
  CircleUser,
  Clock3,
  createIcons,
  Database,
  Gamepad2,
  Gauge,
  Heart,
  ImageOff,
  Info,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  Lock,
  Moon,
  Palette,
  Radio,
  RefreshCw,
  RefreshCcw,
  Search,
  SearchX,
  Settings2,
  ShieldCheck,
  Star as StarIcon,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Swords,
  X,
  Trophy,
  UserRound,
  Users,
  Wifi,
  Zap,
} from "lucide";
import { DEFAULT_PREFERENCES } from "./data/mock";
import type { AppPreferences, AssistantLog, AugmentStat, ChampionStat, NewsDataMeta, AugmentCombo, ProfileSummary } from "./data/types";
import { getAssistantLogs, getAugmentStats, getChampionStats, getNewsData } from "./services/mock";
import { getProfileSummary } from "./services/profile";
import "./styles.css";

type ConnectionState = "disconnected" | "ready";

type Skin = {
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

type Snapshot = {
  connection: ConnectionState;
  phase: string;
  active: boolean;
  contextId: string | null;
  championId: number | null;
  championName: string | null;
  selectedSkinId: number | null;
  writeEnabled: boolean;
  writeBlockReason: string | null;
  skins: Skin[];
  revision: number;
  updatedAtMs: number;
};

type WindowApi = {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
};

const demoSkins: Skin[] = [
  { id: 67000, championId: 67, name: "经典", availability: "available", available: true, selected: false, isBase: true, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67064, championId: 67, name: "觅心猎手", availability: "available", available: true, selected: true, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67065, championId: 67, name: "烈羽之道", availability: "available", available: true, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67066, championId: 67, name: "灵魂莲华", availability: "available", available: true, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67067, championId: 67, name: "摄魂使者", availability: "locked", available: false, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67068, championId: 67, name: "电玩女神", availability: "available", available: true, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67069, championId: 67, name: "苍穹之光", availability: "locked", available: false, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
];

const demoSnapshot: Snapshot = {
  connection: "ready",
  phase: "Champ Select",
  active: true,
  contextId: "demo-context",
  championId: 67,
  championName: "薇恩",
  selectedSkinId: 67064,
  writeEnabled: true,
  writeBlockReason: null,
  skins: demoSkins,
  revision: 1,
  updatedAtMs: Date.now(),
};

const icon = (name: string, size = 18): string => `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
const iconSet = {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  Check,
  ChevronRight,
  CircleUser,
  Clock3,
  ImageOff,
  Info,
  Database,
  Gamepad2,
  Gauge,
  Heart,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  Lock,
  Moon,
  Palette,
  Radio,
  RefreshCw,
  RefreshCcw,
  Search,
  SearchX,
  Settings2,
  ShieldCheck,
  Star: StarIcon,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Swords,
  Trophy,
  UserRound,
  Users,
  Wifi,
  Zap,
  X,
};

const isTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const disconnectedSnapshot: Snapshot = {
  connection: "disconnected",
  phase: "Disconnected",
  active: false,
  contextId: null,
  championId: null,
  championName: null,
  selectedSkinId: null,
  writeEnabled: false,
  writeBlockReason: null,
  skins: [],
  revision: 0,
  updatedAtMs: 0,
};

let snapshot: Snapshot = isTauri ? disconnectedSnapshot : demoSnapshot;
type CatalogFilter = "可用" | "全部" | "收藏";
type AppRoute = "profile" | "assistant" | "news" | "settings";
type NewsTab = "champions" | "augments";
type ChampionRole = "全部" | "上路" | "打野" | "中路" | "下路" | "辅助";

function isAppRoute(value: string): value is AppRoute {
  return value === "profile" || value === "assistant" || value === "news" || value === "settings";
}

const FAVORITES_STORAGE_KEY = "lol-skin-assistant:favorites";
const CATALOG_STATE_STORAGE_KEY = "lol-skin-assistant:catalog-state";
const APP_PREFERENCES_STORAGE_KEY = "lol-skin-assistant:app-preferences";

let activeFilter: CatalogFilter = "可用";
let searchQuery = "";
let favoriteSkinIds = new Set<number>();
let selectedSkinId = snapshot.selectedSkinId;
let previewOnlySelectionId: number | null = null;
let busy = false;
let windowMaximized = false;
let launchAtStartup = false;
let settingsOpen = false;
let settingsBusy = false;
const initialRoute = window.location.hash.slice(1);
let currentRoute: AppRoute = isAppRoute(initialRoute) ? initialRoute : "profile";
let newsTab: NewsTab = "champions";
let championRole: ChampionRole = "全部";
let newsQuery = "";
let profileData: ProfileSummary | null = null;
let profileLoading = false;
let profileError: string | null = null;
let profileRequestId = 0;
let profileLastAttemptMs = 0;
let profileRefreshTimer: number | undefined;
let championStats: ChampionStat[] = [];
let augmentStats: AugmentStat[] = [];
let augmentCombos: AugmentCombo[] = [];
let newsMeta: NewsDataMeta = {
  patch: null,
  updatedAtMs: 0,
  officialSource: "",
  statsSource: null,
  warnings: [],
  source: "unavailable",
};
let assistantLogs: AssistantLog[] = [];
let dashboardLoading = true;
let logsOpen = false;
let newsDetailId: string | null = null;
let autoAccept = DEFAULT_PREFERENCES.autoAccept;
let autoSkin = DEFAULT_PREFERENCES.autoSkin;
let notifyEnabled = DEFAULT_PREFERENCES.notify;
let compactMode = DEFAULT_PREFERENCES.compactMode;
let animationsEnabled = DEFAULT_PREFERENCES.animations;
let themeMode: AppPreferences["themeMode"] = DEFAULT_PREFERENCES.themeMode;
let accentColor = DEFAULT_PREFERENCES.accentColor;
let toastTimer: number | undefined;
let toastMessage: string | null = null;
let toastKind: "info" | "error" = "info";
let cleanupListener: UnlistenFn | undefined;
let cleanupWindowResize: UnlistenFn | undefined;
const imageCache = new Map<string, string>();
const MAX_IMAGE_CACHE_ENTRIES = 24;
const imageRequests = new Set<string>();
const imageFailures = new Set<string>();
let imageLoadFrame = 0;
let imageErrorNotice: string | null = null;

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("app root is missing");
const app: HTMLDivElement = appRoot;

const windowApi: WindowApi = {
  minimize: async () => {
    if (isTauri) await invoke("minimize_main_window");
  },
  maximize: async () => {
    if (isTauri) {
      await getCurrentWindow().toggleMaximize();
      await syncWindowMaximized();
    }
  },
  close: async () => {
    if (isTauri) await invoke("hide_main_window");
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function persistCatalogState(): void {
  try {
    window.localStorage.setItem(CATALOG_STATE_STORAGE_KEY, JSON.stringify({ activeFilter, searchQuery }));
  } catch {
    // Local storage is optional; the catalog remains usable when it is blocked.
  }
}

function persistFavorites(): void {
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteSkinIds]));
  } catch {
    // Local storage is optional; favorite changes still apply for this session.
  }
}

function currentPreferences(): AppPreferences {
  return {
    themeMode,
    accentColor,
    compactMode,
    animations: animationsEnabled,
    launchAtStartup,
    autoAccept,
    autoSkin,
    notify: notifyEnabled,
  };
}

function persistAppPreferences(): void {
  try {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(currentPreferences()));
  } catch {
    // Preferences are best-effort in browser preview mode.
  }
}

function applyAppearance(): void {
  app.dataset.theme = themeMode;
  app.dataset.accent = accentColor;
  app.dataset.compact = String(compactMode);
  app.dataset.motion = String(animationsEnabled);
}

async function hydrateDashboardData(force = false): Promise<void> {
  dashboardLoading = true;
  render();
  try {
    const newsLoader = typeof getNewsData === "function"
      ? getNewsData(isTauri, force)
      : Promise.all([getChampionStats(), getAugmentStats()]).then(([champions, augments]) => ({
        champions,
        augments,
        combos: [],
        meta: {
          patch: null,
          updatedAtMs: Date.now(),
          officialSource: "演示数据",
          statsSource: "演示数据",
          warnings: [],
          source: "demo" as const,
        },
      }));
    const [news, logs] = await Promise.all([newsLoader, getAssistantLogs()]);
    championStats = news.champions;
    augmentStats = news.augments;
    augmentCombos = news.combos;
    newsMeta = news.meta;
    assistantLogs = logs;
  } catch (error) {
    championStats = [];
    augmentStats = [];
    augmentCombos = [];
    newsMeta = { ...newsMeta, source: "unavailable", warnings: [error instanceof Error ? error.message : String(error)] };
    showToast(error instanceof Error ? error.message : "暂时无法加载游戏资讯", "error");
  } finally {
    dashboardLoading = false;
    render();
  }
}

function clearProfileData(): void {
  profileRequestId += 1;
  profileData = null;
  profileError = null;
  profileLoading = false;
  profileLastAttemptMs = 0;
}

async function hydrateProfileData(): Promise<void> {
  if (profileLoading) return;
  if (isTauri && snapshot.connection !== "ready") {
    clearProfileData();
    render();
    return;
  }
  const requestId = ++profileRequestId;
  profileLoading = true;
  profileError = null;
  profileLastAttemptMs = Date.now();
  render();
  try {
    const profile = await getProfileSummary(isTauri, favoriteSkinIds.size);
    if (requestId !== profileRequestId) return;
    profile.assets.favorites = favoriteSkinIds.size;
    profileData = profile;
  } catch (error) {
    if (requestId !== profileRequestId) return;
    profileData = null;
    profileError = (error instanceof Error ? error.message : String(error)).replace(/^[A-Z_]+:\s*/, "");
  } finally {
    if (requestId === profileRequestId) {
      profileLoading = false;
      render();
    }
  }
}

function refreshProfileIfNeeded(): void {
  const refreshAfterMs = profileError ? 5_000 : 60_000;
  if (isTauri && currentRoute === "profile" && !document.hidden
    && snapshot.connection === "ready" && Date.now() - profileLastAttemptMs >= refreshAfterMs) {
    void hydrateProfileData();
  }
}

function loadLocalPreferences(): void {
  const storedFavorites = readLocalStorage<unknown>(FAVORITES_STORAGE_KEY, []);
  if (Array.isArray(storedFavorites)) {
    favoriteSkinIds = new Set(storedFavorites
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0));
  }
  const catalogState = readLocalStorage<unknown>(CATALOG_STATE_STORAGE_KEY, {});
  if (catalogState && typeof catalogState === "object") {
    const state = catalogState as { activeFilter?: unknown; searchQuery?: unknown };
    if (state.activeFilter === "可用" || state.activeFilter === "全部" || state.activeFilter === "收藏") {
      activeFilter = state.activeFilter;
    }
    if (typeof state.searchQuery === "string") searchQuery = state.searchQuery.slice(0, 80);
  }
  const storedPreferences = readLocalStorage<unknown>(APP_PREFERENCES_STORAGE_KEY, {});
  if (storedPreferences && typeof storedPreferences === "object") {
    const preferences = storedPreferences as Partial<AppPreferences>;
    if (preferences.themeMode === "dark" || preferences.themeMode === "light") themeMode = preferences.themeMode;
    if (typeof preferences.accentColor === "string") accentColor = preferences.accentColor;
    if (typeof preferences.compactMode === "boolean") compactMode = preferences.compactMode;
    if (typeof preferences.animations === "boolean") animationsEnabled = preferences.animations;
    if (typeof preferences.autoAccept === "boolean") autoAccept = preferences.autoAccept;
    if (typeof preferences.autoSkin === "boolean") autoSkin = preferences.autoSkin;
    if (typeof preferences.notify === "boolean") notifyEnabled = preferences.notify;
    if (typeof preferences.launchAtStartup === "boolean") launchAtStartup = preferences.launchAtStartup;
  }
}

function skinImage(skin: Skin, large = false): string {
  const paths = large
    ? [skin.splashImagePath, skin.tileImagePath]
    : [skin.tileImagePath, skin.splashImagePath];
  const path = paths.find((candidate) => candidate && imageCache.has(candidate));
  if (path) {
    return `<img class="skin-image" src="${escapeHtml(imageCache.get(path) ?? "")}" alt="${escapeHtml(skin.name)}" />`;
  }
  const hue = (skin.id * 37) % 360;
  const label = skin.isBase ? "ORIGINAL" : skin.name.slice(0, 2);
  return `<div class="skin-art ${large ? "skin-art--large" : ""}" style="--skin-hue:${hue}deg"><span>${escapeHtml(label)}</span></div>`;
}

function cacheImage(path: string, dataUrl: string): void {
  if (imageCache.has(path)) imageCache.delete(path);
  while (imageCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const oldest = imageCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
  imageCache.set(path, dataUrl);
}

function connectionLabel(): string {
  if (snapshot.connection === "ready" && snapshot.active) return "已连接 · 选人阶段";
  if (snapshot.connection === "ready") return "已连接 · 等待选人";
  return "连接失败";
}

function connectionTitle(): string {
  if (snapshot.connection === "ready") return connectionLabel();
  const reason = snapshot.writeBlockReason ?? "";
  if (reason === "league-client-not-found" || reason === "No active League client credentials were found") {
    return "未找到客户端连接信息";
  }
  if (reason === "Could not communicate with the local League client") {
    return "已发现客户端，但本地连接失败";
  }
  if (reason.startsWith("LCU request failed with HTTP 401")) {
    return "客户端连接信息已过期";
  }
  if (reason.startsWith("LCU request failed with HTTP ")) {
    return "客户端接口连接失败";
  }
  if (reason.startsWith("LCU returned an unsupported response:")) {
    return "客户端接口返回了无法识别的数据";
  }
  return reason || "未连接到客户端，助手会在后台自动重试";
}

function phaseLabel(): string {
  const labels: Record<string, string> = {
    ChampSelect: "英雄选择",
    Lobby: "房间中",
    None: "客户端空闲",
    Disconnected: "等待客户端",
  };
  return labels[snapshot.phase] ?? snapshot.phase;
}

function writeBlockLabel(): string | null {
  if (snapshot.writeEnabled || !snapshot.writeBlockReason) return null;
  const labels: Record<string, string> = {
    "champion-not-selected": "先在客户端选择英雄",
    "outside-champion-select": "进入选人阶段后才能切换皮肤",
    "client-disabled-skin-selection": "客户端暂时禁止皮肤切换",
    "skin-selector-hidden": "客户端暂时隐藏皮肤选择",
  };
  return labels[snapshot.writeBlockReason] ?? "当前状态暂不允许切换皮肤";
}

function filteredSkins(): Skin[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("zh-CN");
  return snapshot.skins.filter((skin) => {
    if (activeFilter === "可用" && !skin.available) return false;
    if (activeFilter === "收藏" && !favoriteSkinIds.has(skin.id)) return false;
    if (!normalizedQuery) return true;
    return skin.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
  });
}

function favoriteLabel(skin: Skin): string {
  return favoriteSkinIds.has(skin.id) ? `取消收藏 ${skin.name}` : `收藏 ${skin.name}`;
}

function toggleFavorite(skinId: number): void {
  if (favoriteSkinIds.has(skinId)) favoriteSkinIds.delete(skinId);
  else favoriteSkinIds.add(skinId);
  persistFavorites();
  if (profileData) profileData.assets.favorites = favoriteSkinIds.size;
  render();
}

function renderSkinCard(skin: Skin): string {
  const favorite = favoriteSkinIds.has(skin.id);
  return `
    <article class="skin-card-wrap">
      <button class="skin-card ${skin.id === selectedSkinId ? "skin-card--selected" : ""} ${!skin.available ? "skin-card--locked" : ""}" data-skin-id="${skin.id}" ${busy ? "disabled" : ""}>
        <div class="skin-thumb">${skinImage(skin)}${skin.id === selectedSkinId ? `<span class="selected-mark">${icon("check", 13)}</span>` : ""}${!skin.available ? `<span class="lock-mark">${icon("lock", 13)}</span>` : ""}</div>
        <div class="skin-info"><strong>${escapeHtml(skin.name)}</strong><span>${skin.isBase ? "默认外观" : skin.isChroma ? "炫彩预览" : skin.available ? "可用" : "不可用"}</span></div>
      </button>
      <button class="favorite-button ${favorite ? "favorite-button--active" : ""}" data-favorite-id="${skin.id}" aria-label="${escapeHtml(favoriteLabel(skin))}" title="${escapeHtml(favoriteLabel(skin))}">${icon("star", 13)}</button>
    </article>`;
}

function renderSettingsDialog(): string {
  if (!settingsOpen) return "";
  return `
    <div class="modal-backdrop" data-action="close-settings">
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-head">
          <div><span class="eyebrow">PREFERENCES</span><h2 id="settings-title">偏好设置</h2></div>
          <button class="icon-button" data-action="close-settings" aria-label="关闭设置">${icon("x", 18)}</button>
        </header>
        <div class="settings-body">
          <label class="setting-row">
            <span><strong>开机自动启动</strong><small>登录 Windows 后在后台启动助手</small></span>
            <input class="switch-input" type="checkbox" data-setting="launch-at-startup" ${launchAtStartup ? "checked" : ""} ${settingsBusy ? "disabled" : ""} />
            <span class="switch-track" aria-hidden="true"></span>
          </label>
          <div class="setting-row setting-row--button">
            <span><strong>图片内存缓存</strong><small>清除后会从客户端重新加载当前皮肤图片</small></span>
            <button class="secondary-button" data-action="clear-image-cache">清除缓存</button>
          </div>
        </div>
        <footer class="settings-foot"><span>收藏、筛选和搜索条件保存在本机</span><button class="primary-button" data-action="close-settings">完成</button></footer>
      </section>
    </div>`;
}

function renderWindowActions(): string {
  return `<div class="window-actions">
    <button class="window-button" title="最小化" aria-label="最小化" data-action="minimize"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6.5h10" fill="none" stroke="currentColor" /></svg></button>
    <button class="window-button" title="${windowMaximized ? "还原" : "最大化"}" aria-label="${windowMaximized ? "还原" : "最大化"}" data-action="maximize">${maximizeIcon()}</button>
    <button class="window-button window-button--close" title="关闭（隐藏到托盘）" aria-label="关闭" data-action="close"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9" fill="none" stroke="currentColor" /></svg></button>
  </div>`;
}

function maximizeIcon(): string {
  return `<svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">${windowMaximized
    ? '<path d="M3.5 3.5V1.5h7v7h-2"/><path d="M1.5 3.5h7v7h-7z"/>'
    : '<path d="M1.5 1.5h9v9h-9z"/>'}</svg>`;
}

async function syncWindowMaximized(): Promise<void> {
  if (!isTauri) return;
  try {
    windowMaximized = await getCurrentWindow().isMaximized();
    const button = app.querySelector<HTMLButtonElement>('[data-action="maximize"]');
    if (button) {
      button.title = windowMaximized ? "还原" : "最大化";
      button.setAttribute("aria-label", button.title);
      button.innerHTML = maximizeIcon();
    }
  } catch (error) {
    console.error("Failed to read window maximized state", error);
  }
}

async function runWindowAction(action: "minimize" | "maximize" | "close"): Promise<void> {
  try {
    await windowApi[action]();
  } catch (error) {
    console.error(`Failed to ${action} window`, error);
    showToast("窗口操作失败，请重试", "error");
  }
}

function renderSkinWorkspace(): void {
  const restoreSearchFocus = document.activeElement instanceof HTMLInputElement
    && document.activeElement.matches("[data-search]");
  const current = snapshot.skins.find((skin) => skin.id === selectedSkinId) ?? snapshot.skins[0];
  const champion = snapshot.championName ?? "等待选择英雄";
  const availableCount = snapshot.skins.filter((skin) => skin.available).length;
  const filtered = filteredSkins();
  const ready = snapshot.connection === "ready" && snapshot.active;
  const canApply = ready && snapshot.contextId !== null && snapshot.writeEnabled && !busy;
  const statusClass = snapshot.connection === "ready" ? "status-ready" : "status-offline";

  app.innerHTML = `
    <div class="shell">
      <header class="titlebar">
        <div class="brand" data-action="home">
          <img class="brand-mark" src="/app-mark.svg" alt="" />
          <div><strong>峡谷换肤助手</strong><span>SKIN SELECTOR</span></div>
        </div>
        ${renderWindowActions()}
      </header>

      <div class="workspace">
        <aside class="sidebar">
          <div class="sidebar-section">
            <span class="eyebrow">WORKSPACE</span>
            <button class="nav-item ${currentRoute === "profile" ? "nav-item--active" : ""}" data-route="profile">${icon("circle-user", 17)}<span>个人信息</span></button>
            <button class="nav-item ${currentRoute === "assistant" ? "nav-item--active" : ""}" data-route="assistant">${icon("gamepad-2", 17)}<span>游戏辅助</span><b>${snapshot.skins.length}</b></button>
            <button class="nav-item ${currentRoute === "news" ? "nav-item--active" : ""}" data-route="news">${icon("book-open", 17)}<span>游戏资讯</span></button>
          </div>
          <div class="sidebar-section sidebar-section--bottom">
            <span class="eyebrow">SYSTEM</span>
            <button class="nav-item" data-action="refresh">${icon("refresh-cw", 17)}<span>重新连接</span></button>
            <button class="nav-item ${currentRoute === "settings" ? "nav-item--active" : ""}" data-route="settings">${icon("settings-2", 17)}<span>应用设置</span></button>
          </div>
          <div class="sidebar-foot"><span class="version-dot"></span><span>v0.2 · 本地运行</span></div>
        </aside>

        <main class="main-content" data-page="${currentRoute}" tabindex="0" aria-label="游戏辅助内容">
          <section class="topline">
            <div><span class="eyebrow">CURRENT SESSION</span><h1>${escapeHtml(champion)}</h1><p class="phase-copy">${escapeHtml(phaseLabel() || "等待游戏客户端")} <span class="slash">/</span> 皮肤选择</p></div>
            <div class="connection ${statusClass}" title="${escapeHtml(connectionTitle())}"><span class="connection-dot"></span><span>${connectionLabel()}</span>${icon(snapshot.connection === "ready" ? "radio" : "wifi", 15)}</div>
          </section>

          <section class="hero-panel">
            <div class="hero-copy"><span class="eyebrow">SELECTED SKIN</span><h2>${current ? escapeHtml(current.name) : "尚未选择"}</h2><p>${writeBlockLabel() ?? (current?.isBase ? "使用英雄默认外观" : current?.isChroma ? "炫彩皮肤暂仅提供预览" : current && !current.available ? "当前皮肤不可用，仅提供预览" : "客户端将使用当前选择完成换肤")}</p><button class="primary-button" data-action="apply" ${canApply && current && current.available && !current.isChroma && !current.selected ? "" : "disabled"}>${icon("check", 16)}${busy ? "正在应用" : current?.selected ? "当前已使用" : current?.isChroma ? "炫彩暂不支持" : current && !current.available ? "不可应用" : "应用皮肤"}</button></div>
            <div class="hero-art">${current ? skinImage(current, true) : `<div class="empty-art">${icon("image-off", 30)}<span>等待皮肤数据</span></div>`}<div class="hero-art-glow"></div></div>
            <div class="hero-meta"><div><span>英雄</span><strong>${escapeHtml(champion)}</strong></div><div><span>可用皮肤</span><strong>${availableCount}<em> / ${snapshot.skins.length}</em></strong></div><div><span>同步状态</span><strong class="meta-ready">${ready ? "实时" : "暂停"}</strong></div></div>
          </section>

          <section class="assistant-controls"><div class="assistant-control-head"><div><span class="eyebrow">AUTOMATION</span><h2>游戏辅助</h2></div><span class="assist-status ${ready ? "assist-status--ready" : "assist-status--offline"}"><i></i>${ready ? "客户端已就绪" : "等待客户端"}</span></div><div class="assist-control-grid"><label class="assist-toggle"><span class="assist-toggle-icon">${icon("zap", 16)}</span><span><strong>自动接受对局</strong><small>匹配成功后自动确认</small></span><input class="switch-input" type="checkbox" data-pref="autoAccept" ${autoAccept ? "checked" : ""} ${!ready ? "disabled" : ""} /><span class="switch-track"></span></label><label class="assist-toggle"><span class="assist-toggle-icon assist-toggle-icon--pink">${icon("sparkles", 16)}</span><span><strong>自动应用皮肤</strong><small>进入选人后应用上次选择</small></span><input class="switch-input" type="checkbox" data-pref="autoSkin" ${autoSkin ? "checked" : ""} ${!ready ? "disabled" : ""} /><span class="switch-track"></span></label><div class="assist-log"><span class="assist-log-icon">${icon("list-checks", 16)}</span><div><strong>最近动作</strong><small>${assistantLogs[0] ? `${escapeHtml(assistantLogs[0].action)} · ${escapeHtml(assistantLogs[0].time)}` : "暂无执行记录"}</small></div><button class="text-button" data-action="show-logs">${logsOpen ? "收起日志" : "查看日志"} ${icon("chevron-right", 12)}</button></div></div>${logsOpen ? `<div class="operation-log"><div class="operation-log-head"><span>时间</span><span>操作</span><span>详情</span><span>状态</span></div>${assistantLogs.map((log) => `<div class="operation-log-row"><span>${escapeHtml(log.time)}</span><strong>${escapeHtml(log.action)}</strong><span>${escapeHtml(log.detail)}</span><em class="log-status log-status--${log.status}">${log.status === "success" ? "成功" : log.status === "pending" ? "等待确认" : "失败"}</em></div>`).join("")}</div>` : ""}</section>

          <section class="catalog-head"><div><span class="eyebrow">SKIN CATALOG</span><h2>选择一个外观</h2></div><div class="catalog-tools"><label class="search-box">${icon("search", 15)}<input type="search" maxlength="80" value="${escapeHtml(searchQuery)}" placeholder="搜索皮肤" aria-label="搜索皮肤" data-search /></label><div class="segmented">${(["可用", "全部", "收藏"] satisfies CatalogFilter[]).map((filter) => `<button class="segment ${activeFilter === filter ? "segment--active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}</div><button class="secondary-button" data-action="random" ${canApply ? "" : "disabled"}>${icon("shuffle", 16)}随机一款</button></div></section>

          <section class="skin-grid">${filtered.length ? filtered.map(renderSkinCard).join("") : `<div class="empty-state">${icon("search-x", 22)}<span>${activeFilter === "收藏" && favoriteSkinIds.size === 0 ? "还没有收藏皮肤" : "没有符合条件的皮肤"}</span>${searchQuery ? `<button class="text-button" data-action="clear-search">清除搜索</button>` : ""}</div>`}</section>
          <footer class="content-foot"><span>${icon("shield-check", 14)}只通过客户端接口操作，不修改游戏文件</span><span>最后同步 ${formatTime(snapshot.updatedAtMs)}</span></footer>
        </main>
      </div>
      ${renderSettingsDialog()}
      <div id="toast" class="toast ${toastMessage ? "toast--visible" : ""}" data-kind="${toastKind}" aria-live="polite">${toastMessage ? escapeHtml(toastMessage) : ""}</div>
    </div>`;
  wireEvents();
  refreshIcons();
  if (restoreSearchFocus) {
    const input = app.querySelector<HTMLInputElement>("[data-search]");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
  void loadSkinImages();
}

function trendBars(values: Array<number | null>): string {
  return `<div class="trend-bars" role="img" aria-label="最近七天每日胜率；空白表示暂无对局">${values.map((value) => `<span class="${value === null ? "trend-bar--empty" : ""}" style="height:${value ?? 0}%;min-height:0" title="${value === null ? "暂无对局" : `胜率 ${value}%`}"></span>`).join("")}</div>`;
}

function renderProfilePage(): string {
  if (profileLoading && !profileData) {
    return `<div class="loading-panel"><span class="loading-spinner">${icon("loader-circle", 22)}</span><strong>正在加载召唤师数据</strong><span>正在整理最近对局与资产信息</span></div>`;
  }
  if (!profileData) {
    const connected = snapshot.connection === "ready";
    return `<section class="page-head"><div><span class="eyebrow">SUMMONER OVERVIEW</span><h1>个人信息</h1><p>连接客户端后自动读取当前登录账号。</p></div></section><div class="loading-panel" role="status">${icon(connected ? "circle-user" : "wifi", 28)}<strong>${connected ? "暂时无法读取个人信息" : "等待英雄联盟客户端"}</strong><span>${escapeHtml(profileError ?? "请启动并登录客户端，连接成功后会自动加载。")}</span><button class="secondary-button" data-action="${connected ? "profile-refresh" : "refresh"}">${icon("refresh-ccw", 15)}${connected ? "重试读取" : "重新连接"}</button></div>`;
  }
  const data = profileData;
  const percent = (value: number | null): string => value === null ? "—" : `${value}%`;
  const count = (value: number | null): string => value === null ? "—" : String(value);
  const progress = (owned: number | null, total: number | null): number => owned === null || !total ? 0 : Math.min(100, Math.round(owned / total * 100));
  const rank = data.rank;
  const gamesEmpty = data.matchHistoryAvailable ? "暂无近期对局，完成游戏后刷新查看" : "对局记录暂不可用，请稍后刷新";
  const refreshDisabled = profileLoading ? "disabled" : "";
  return `
    <section class="page-head page-head--profile">
      <div><span class="eyebrow">SUMMONER OVERVIEW</span><h1>个人信息</h1><p>${data.source === "demo" ? "浏览器预览 · 演示数据" : `已连接客户端 · 更新于 ${formatTime(data.updatedAtMs)}`}</p></div>
      <button class="secondary-button" data-action="profile-refresh" ${refreshDisabled} aria-busy="${profileLoading}">${icon(profileLoading ? "loader-circle" : "refresh-ccw", 15)}${profileLoading ? "正在刷新" : "刷新数据"}</button>
    </section>
    ${data.warnings.length ? `<div class="profile-notice" role="status">${icon("info", 16)}<span>${data.warnings.map(escapeHtml).join("；")}。可稍后刷新重试。</span></div>` : ""}
    <section class="profile-hero">
      <div class="avatar-badge">${data.summoner.avatarUrl ? `<img src="${escapeHtml(data.summoner.avatarUrl)}" alt="召唤师头像" />` : escapeHtml(data.summoner.avatarLabel)}</div>
      <div class="profile-identity"><span class="eyebrow">召唤师</span><h2>${escapeHtml(data.summoner.name)}${data.summoner.tag ? `<small>#${escapeHtml(data.summoner.tag)}</small>` : ""}</h2><p>${escapeHtml(data.summoner.region)} <i></i> Lv.${data.summoner.level}</p></div>
      <div class="profile-rank"><span class="eyebrow">当前段位${rank ? ` · ${escapeHtml(rank.queue)}` : ""}</span><strong><b>${escapeHtml(rank?.tier ?? "暂不可用")}</b> ${escapeHtml(rank?.division ?? "")}</strong><span>${rank ? `${rank.ranked ? `${rank.points} LP` : "尚未完成定级"}<em>${rank.wins} 胜 ${rank.losses} 负</em>` : "请稍后刷新"}</span></div>
      <div class="rank-badge">${icon("trophy", 24)}<span>${percent(rank?.winRate ?? null)}<small>排位胜率</small></span></div>
    </section>
    <section class="metric-grid">
      <article class="metric-card"><div class="metric-icon metric-icon--mint">${icon("activity", 17)}</div><span>近 5 场胜率</span><strong>${percent(data.recentWinRate)}</strong><small>${data.recentWinRateSampleSize ? `统计 ${data.recentWinRateSampleSize} 场，重开不计入` : "暂无可统计对局"}</small></article>
      <article class="metric-card"><div class="metric-icon metric-icon--blue">${icon("gauge", 17)}</div><span>排位胜率</span><strong>${percent(rank?.winRate ?? null)}</strong><small>${rank ? `共 ${rank.wins + rank.losses} 场${escapeHtml(rank.queue)}` : "排位信息暂不可用"}</small></article>
      <article class="metric-card"><div class="metric-icon metric-icon--gold">${icon("swords", 17)}</div><span>常用位置</span><strong>${escapeHtml(data.preferredRole?.name ?? "暂无分路")}</strong><small>${data.preferredRole ? `占比 ${data.preferredRole.share}% · ${data.preferredRole.sampleSize} 场分路对局` : "近期对局无明确分路记录"}</small></article>
      <article class="metric-card"><div class="metric-icon metric-icon--pink">${icon("heart", 17)}</div><span>收藏皮肤</span><strong>${favoriteSkinIds.size}</strong><small>已保存于当前设备</small></article>
    </section>
    <section class="dashboard-grid">
      <article class="dashboard-panel performance-panel">
        <header class="panel-heading"><div><span class="eyebrow">RECENT PERFORMANCE</span><h2>近期表现</h2></div><span class="panel-note">近 7 天 · 最多 20 场</span></header>
        <div class="chart-summary"><div><span>期间胜率</span><strong>${percent(data.trends.averageWinRate)}</strong><small>${data.trends.sampleSize} 场有效对局</small></div><div><span>平均 KDA</span><strong>${data.trends.averageKda?.toFixed(1) ?? "—"}</strong></div></div>
        <div class="chart-area">${trendBars(data.trends.winRate)}<div class="chart-labels">${data.trends.labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div></div>
      </article>
      <article class="dashboard-panel asset-panel">
        <header class="panel-heading"><div><span class="eyebrow">COLLECTION</span><h2>个人资产</h2></div><button class="text-button" data-action="route-assistant">查看皮肤库 ${icon("chevron-right", 13)}</button></header>
        <div class="asset-list"><div class="asset-row"><span class="asset-glyph asset-glyph--blue">${icon("users", 16)}</span><span>英雄</span><strong>${count(data.assets.championsOwned)}<small> / ${count(data.assets.championsTotal)}</small></strong><div class="progress"><i style="width:${progress(data.assets.championsOwned, data.assets.championsTotal)}%"></i></div></div><div class="asset-row"><span class="asset-glyph asset-glyph--pink">${icon("sparkles", 16)}</span><span>普通皮肤</span><strong>${count(data.assets.skinsOwned)}<small> / ${count(data.assets.skinsTotal)}</small></strong><div class="progress progress--pink"><i style="width:${progress(data.assets.skinsOwned, data.assets.skinsTotal)}%"></i></div></div><p class="asset-note">仅统计永久拥有的资产；皮肤不含默认外观与炫彩。</p></div>
      </article>
    </section>
    <section class="dashboard-grid dashboard-grid--lower">
      <article class="dashboard-panel games-panel"><header class="panel-heading"><div><span class="eyebrow">MATCH HISTORY</span><h2>最近对局</h2></div><button class="text-button" data-action="profile-refresh" ${refreshDisabled}>更新 ${icon("refresh-ccw", 12)}</button></header><div class="games-list">${data.recentGames.length ? data.recentGames.map((game) => `<div class="game-row"><span class="game-result ${game.result}" title="${game.result === "win" ? "胜利" : game.result === "remake" ? "重开" : "失败"}"></span><span class="champion-token" style="--token-color:${game.result === "win" ? "#70c7a6" : game.result === "remake" ? "#9ba5ad" : "#c47e85"}">${escapeHtml(game.championShort)}</span><div class="game-main"><strong>${escapeHtml(game.champion)}${game.result === "remake" ? " · 重开" : ""}</strong><small>${escapeHtml(game.mode)} · ${escapeHtml(game.playedAt)}</small></div><span class="game-kda">${escapeHtml(game.kda)}<small>${game.cs} CS · ${escapeHtml(game.duration)}</small></span></div>`).join("") : `<div class="empty-state">${icon("swords", 22)}<span>${gamesEmpty}</span></div>`}</div></article>
      <article class="dashboard-panel champion-panel"><header class="panel-heading"><div><span class="eyebrow">MOST PLAYED</span><h2>常用英雄</h2></div><span class="panel-note">近期 ${data.matchCount} 场</span></header><div class="top-champion-list">${data.topChampions.length ? data.topChampions.map((champion, index) => `<div class="top-champion-row"><b>${String(index + 1).padStart(2, "0")}</b><span class="champion-token" style="--token-color:${champion.color}">${escapeHtml(champion.name.slice(0, 2))}</span><div><strong>${escapeHtml(champion.name)}</strong><small>${champion.role ? `${escapeHtml(champion.role)} · ` : ""}${champion.games} 场</small></div><span class="champion-rate">${champion.winRate}%</span><div class="mini-progress"><i style="width:${champion.winRate}%"></i></div></div>`).join("") : `<div class="empty-state">${icon("users", 22)}<span>${gamesEmpty}</span></div>`}</div></article>
    </section>`;
}

function newsPercent(value: number | null): string {
  return value === null ? "未提供" : `${value.toFixed(1)}%`;
}

function newsSourceLabel(): string {
  const updated = newsMeta.updatedAtMs > 0 ? ` · ${formatTime(newsMeta.updatedAtMs)} 更新` : "";
  if (newsMeta.source === "demo") return "演示数据";
  if (newsMeta.source === "third-party") return `${newsMeta.statsSource ?? "第三方统计"} · ${newsMeta.patch ?? "当前版本"}${updated}`;
  if (newsMeta.source === "official") return `${newsMeta.officialSource} · ${newsMeta.patch ?? "当前版本"}${updated}`;
  return "官方数据暂时不可用";
}

function championCombos(championId: number): AugmentCombo[] {
  return augmentCombos.filter((combo) => combo.championId === championId);
}

function renderChampionComboSummary(championId: number): string {
  const combos = championCombos(championId);
  if (!combos.length) return "当前数据源没有返回该英雄的海克斯组合目录。";
  const names = [...new Set(combos.flatMap((combo) => combo.augmentIds)
    .map((id) => augmentStats.find((augment) => augment.id === id))
    .filter((augment): augment is AugmentStat => Boolean(augment))
    .map((augment) => `${augment.name}（全局选取率 ${newsPercent(augment.pickRate)}）`))].slice(0, 8);
  return names.length
    ? `可查组合：${names.map(escapeHtml).join("、")}。组合目录没有逐英雄选取率或胜率。`
    : "已返回组合目录，但海克斯名称暂时无法匹配。";
}

function renderNewsWarning(): string {
  if (!newsMeta.warnings.length) return "";
  return `<div class="profile-notice news-notice" role="status">${icon("info", 16)}<span>${newsMeta.warnings.map(escapeHtml).join("；")}</span></div>`;
}

function renderNewsPage(): string {
  const roleOptions: ChampionRole[] = ["全部", "上路", "打野", "中路", "下路", "辅助"];
  const query = newsQuery.trim().toLocaleLowerCase("zh-CN");
  const champions = championStats.filter((champion) => (championRole === "全部" || champion.role === championRole) && (!query || champion.name.toLocaleLowerCase("zh-CN").includes(query)));
  const augments = augmentStats.filter((augment) => !query || augment.name.toLocaleLowerCase("zh-CN").includes(query));
  const detail = newsDetailId === null ? "" : renderNewsDetail();
  const loadingNotice = dashboardLoading
    ? `<div class="profile-notice news-notice" role="status">${icon("loader-circle", 16)}<span>正在读取官方资料和海克斯数据，页面可以先浏览。</span></div>`
    : "";
  return `
    <section class="page-head"><div><span class="eyebrow">LIVE DATA DESK</span><h1>游戏资讯</h1><p>官方静态资料与可验证的海克斯大乱斗选取率。</p></div><div><div class="data-freshness"><span class="connection-dot ${newsMeta.source === "unavailable" ? "status-error" : "status-ready"}"></span><span>${escapeHtml(newsSourceLabel())}</span></div><button class="secondary-button news-refresh" data-action="news-refresh" ${dashboardLoading ? "disabled" : ""}>${icon("refresh-ccw", 15)}刷新数据</button></div></section>
    ${loadingNotice}
    ${renderNewsWarning()}
    <div class="news-tabs"><button class="news-tab ${newsTab === "champions" ? "news-tab--active" : ""}" data-news-tab="champions">${icon("swords", 16)}英雄数据</button><button class="news-tab ${newsTab === "augments" ? "news-tab--active" : ""}" data-news-tab="augments">${icon("sparkles", 16)}海克斯大乱斗符文</button></div>
    <section class="news-toolbar"><label class="search-box news-search">${icon("search", 15)}<input type="search" maxlength="40" value="${escapeHtml(newsQuery)}" placeholder="搜索${newsTab === "champions" ? "英雄" : "符文"}" aria-label="搜索资讯" data-news-search /></label>${newsTab === "champions" ? `<div class="segmented role-segmented">${roleOptions.map((role) => `<button class="segment ${championRole === role ? "segment--active" : ""}" data-role="${role}">${role}</button>`).join("")}</div>` : `<span class="filter-caption">极地大乱斗 · 全段位 · 最近 30 天</span>`}</section>
    ${newsTab === "champions" ? `<section class="news-summary-row"><article><span>官方英雄资料</span><strong>${championStats.length || "—"}</strong><small>${newsMeta.officialSource || "暂无"}</small></article><article><span>英雄选取率</span><strong>${championStats.filter((item) => item.pickRate !== null).length || "—"}</strong><small>${newsMeta.statsSource ? "第三方有限样本" : "官方未提供"}</small></article><article><span>胜率</span><strong>未提供</strong><small>官方接口未开放</small></article></section><section class="news-table-panel"><div class="news-table news-table--champions"><div class="news-table-head"><span>#</span><span>英雄</span><span>位置</span><span>评级</span><span>胜率</span><span>登场率</span><span>趋势</span><span></span></div>${champions.length ? champions.map((champion, index) => `<div class="news-table-row"><span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="news-champion"><span class="champion-token" style="--token-color:${champion.color}">${escapeHtml(champion.shortName)}</span><strong>${escapeHtml(champion.name)}<small>KDA ${champion.kda === null ? "官方未提供" : champion.kda.toFixed(1)}</small></strong></span><span>${escapeHtml(champion.role)}</span><span class="tier tier--${champion.tier.replace("+", "plus")}">${escapeHtml(champion.tier)}</span><span class="stat-strong">${newsPercent(champion.winRate)}</span><span>${newsPercent(champion.pickRate)}</span><span class="trend trend--${champion.trend}">${champion.trend === "up" ? "↑" : champion.trend === "down" ? "↓" : "—"}</span><button class="icon-button table-arrow" data-news-detail="${champion.id}" aria-label="查看${escapeHtml(champion.name)}详情">${icon("chevron-right", 15)}</button></div>`).join("") : `<div class="empty-state">${icon("search-x", 22)}<span>没有符合条件的英雄</span></div>`}</div></section>` : `<section class="news-summary-row"><article><span>可查海克斯</span><strong>${augmentStats.length || "—"}</strong><small>第三方选取率数据</small></article><article><span>最高选取率</span><strong>${newsPercent(Math.max(...augmentStats.map((item) => item.pickRate ?? 0), 0) || null)}</strong><small>胜率官方未提供</small></article><article><span>组合推荐</span><strong>${augmentCombos.length || "—"}</strong><small>仅展示组合目录</small></article></section><section class="news-table-panel"><div class="news-table news-table--augments"><div class="news-table-head"><span>#</span><span>符文</span><span>评级</span><span>胜率</span><span>选择率</span><span>样本</span><span></span></div>${augments.length ? augments.map((augment, index) => `<div class="news-table-row"><span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="news-champion"><span class="augment-token" style="--token-color:${augment.color}">${icon("sparkles", 15)}</span><strong>${escapeHtml(augment.name)}<small>${escapeHtml(augment.description || "暂无官方描述")}</small></strong></span><span class="tier tier--${augment.tier.replace("+", "plus")}">${escapeHtml(augment.tier)}</span><span class="stat-strong">${newsPercent(augment.winRate)}</span><span>${newsPercent(augment.pickRate)}</span><span>${augment.sampleSize === null ? "未提供" : augment.sampleSize.toLocaleString("zh-CN")}</span><button class="icon-button table-arrow" data-news-detail="${escapeHtml(augment.id)}" aria-label="查看${escapeHtml(augment.name)}详情">${icon("chevron-right", 15)}</button></div>`).join("") : `<div class="empty-state">${icon("search-x", 22)}<span>没有符合条件的符文</span></div>`}</div></section>`}${detail}`;
}

function renderNewsDetail(): string {
  if (newsDetailId === null) return "";
  if (newsTab === "champions") {
    const champion = championStats.find((item) => String(item.id) === newsDetailId);
    if (!champion) return "";
    return `<div class="detail-backdrop" data-action="close-news-detail"><aside class="detail-drawer"><header><div><span class="eyebrow">CHAMPION DETAIL</span><h2>${escapeHtml(champion.name)}</h2></div><button class="icon-button" data-action="close-news-detail" aria-label="关闭详情">${icon("x", 17)}</button></header><div class="detail-hero"><span class="champion-token detail-token" style="--token-color:${champion.color}">${escapeHtml(champion.shortName)}</span><div><strong>${escapeHtml(champion.role)} · ${escapeHtml(champion.tier)} 级</strong><p>英雄名称与基础分类来自 Riot Data Dragon。</p></div></div><div class="detail-stat-grid"><div><span>胜率</span><strong>${newsPercent(champion.winRate)}</strong></div><div><span>登场率</span><strong>${newsPercent(champion.pickRate)}</strong></div><div><span>禁用率</span><strong>${newsPercent(champion.banRate)}</strong></div><div><span>KDA</span><strong>${champion.kda === null ? "未提供" : champion.kda.toFixed(1)}</strong></div></div><div class="detail-copy"><span class="eyebrow">海克斯组合</span><h3>只展示可验证的组合目录</h3><p>${renderChampionComboSummary(champion.id)}</p></div><footer>${escapeHtml(newsSourceLabel())}</footer></aside></div>`;
  }
  const augment = augmentStats.find((item) => item.id === newsDetailId);
  if (!augment) return "";
  return `<div class="detail-backdrop" data-action="close-news-detail"><aside class="detail-drawer"><header><div><span class="eyebrow">AUGMENT DETAIL</span><h2>${escapeHtml(augment.name)}</h2></div><button class="icon-button" data-action="close-news-detail" aria-label="关闭详情">${icon("x", 17)}</button></header><div class="detail-hero"><span class="augment-token detail-token" style="--token-color:${augment.color}">${icon("sparkles", 18)}</span><div><strong>${escapeHtml(augment.tier)} 级符文</strong><p>${escapeHtml(augment.description || "暂无官方描述")}</p></div></div><div class="detail-stat-grid"><div><span>胜率</span><strong>${newsPercent(augment.winRate)}</strong></div><div><span>选择率</span><strong>${newsPercent(augment.pickRate)}</strong></div><div><span>样本数</span><strong>${augment.sampleSize === null ? "未提供" : augment.sampleSize.toLocaleString("zh-CN")}</strong></div><div><span>模式</span><strong>海克斯大乱斗</strong></div></div><div class="detail-copy"><span class="eyebrow">数据说明</span><h3>选取率来自第三方有限样本</h3><p>Riot 官方公开接口未提供海克斯胜率，应用不会从选取率推导胜率。</p></div><footer>${escapeHtml(newsSourceLabel())}</footer></aside></div>`;
}

function preferenceRow(key: string, title: string, description: string, checked: boolean): string {
  return `<label class="preference-row"><span><strong>${title}</strong><small>${description}</small></span><input class="switch-input" type="checkbox" data-pref="${key}" ${checked ? "checked" : ""} /><span class="switch-track" aria-hidden="true"></span></label>`;
}

function renderSettingsPage(): string {
  const colors = ["mint", "blue", "gold", "rose"];
  return `
    <section class="page-head"><div><span class="eyebrow">APP CONTROL CENTER</span><h1>应用设置</h1><p>调整外观、自动化行为和本地数据偏好。</p></div><span class="settings-saved">${icon("check-circle-2", 14)}设置自动保存</span></section>
    <section class="settings-layout"><div class="settings-column"><article class="settings-panel"><header class="panel-heading"><div><span class="eyebrow">APPEARANCE</span><h2>外观</h2></div><span class="settings-panel-icon">${icon("palette", 17)}</span></header><div class="preference-content"><div class="preference-row preference-row--static"><span><strong>主题模式</strong><small>选择适合当前环境的显示模式</small></span><div class="theme-choice"><button class="theme-option ${themeMode === "dark" ? "theme-option--active" : ""}" data-theme="dark">${icon("moon", 14)}深色</button><button class="theme-option ${themeMode === "light" ? "theme-option--active" : ""}" data-theme="light">${icon("sun", 14)}浅色</button></div></div><div class="preference-row preference-row--static"><span><strong>主题色</strong><small>用于强调按钮、状态和选中项</small></span><div class="accent-choice">${colors.map((color) => `<button class="accent-swatch accent-swatch--${color} ${accentColor === color ? "accent-swatch--active" : ""}" data-accent="${color}" aria-label="${color}主题色"></button>`).join("")}</div></div>${preferenceRow("compact", "紧凑布局", "减少列表间距，显示更多信息", compactMode)}${preferenceRow("animations", "界面动效", "保留页面切换和反馈动效", animationsEnabled)}</div></article><article class="settings-panel"><header class="panel-heading"><div><span class="eyebrow">LOCAL DATA</span><h2>本地数据</h2></div><span class="settings-panel-icon">${icon("database", 17)}</span></header><div class="preference-content"><div class="preference-row preference-row--button"><span><strong>皮肤图片缓存</strong><small>缓存仅保存在本机内存中，当前占用约 18 MB</small></span><button class="secondary-button" data-action="clear-image-cache">清理缓存</button></div><div class="preference-row preference-row--button"><span><strong>恢复默认设置</strong><small>清除外观和行为偏好，不影响收藏皮肤</small></span><button class="secondary-button" data-action="reset-preferences">恢复默认</button></div></div></article></div><div class="settings-column"><article class="settings-panel"><header class="panel-heading"><div><span class="eyebrow">AUTOMATION</span><h2>行为偏好</h2></div><span class="settings-panel-icon">${icon("settings-2", 17)}</span></header><div class="preference-content">${preferenceRow("autoAccept", "自动接受对局", "检测到匹配成功后自动确认进入房间", autoAccept)}${preferenceRow("autoSkin", "自动应用皮肤", "进入选人阶段后使用上次选择的皮肤", autoSkin)}${preferenceRow("notify", "桌面通知", "在后台完成自动化操作时提醒我", notifyEnabled)}${preferenceRow("launchAtStartup", "开机启动", "登录 Windows 后自动运行助手", launchAtStartup)}</div></article><article class="settings-panel settings-info-panel"><div class="info-block"><span class="info-icon">${icon("shield-check", 17)}</span><div><strong>本地优先</strong><p>账号信息、收藏和偏好仅保存在当前设备。换肤操作通过客户端接口完成，不修改游戏文件。</p></div></div><div class="info-block"><span class="info-icon info-icon--blue">${icon("wifi", 17)}</span><div><strong>数据状态</strong><p>游戏资讯优先读取 Riot Data Dragon；海克斯大乱斗选取率会标注第三方有限样本，官方未提供的胜率不会显示。</p></div></div></article></div></section>`;
}

function renderDashboardShell(): void {
  const routeTitle = currentRoute === "profile" ? "个人信息" : currentRoute === "news" ? "游戏资讯" : "应用设置";
  const content = currentRoute === "profile" ? renderProfilePage() : currentRoute === "news" ? renderNewsPage() : renderSettingsPage();
  app.innerHTML = `
    <div class="shell">
      <header class="titlebar"><div class="brand" data-route="profile"><img class="brand-mark" src="/app-mark.svg" alt="" /><div><strong>峡谷换肤助手</strong><span>SUMMONER DESK · ${routeTitle.toUpperCase()}</span></div></div>${renderWindowActions()}</header>
      <div class="workspace"><aside class="sidebar"><div class="sidebar-section"><span class="eyebrow">WORKSPACE</span><button class="nav-item ${currentRoute === "profile" ? "nav-item--active" : ""}" data-route="profile">${icon("circle-user", 17)}<span>个人信息</span></button><button class="nav-item ${currentRoute === "assistant" ? "nav-item--active" : ""}" data-route="assistant">${icon("gamepad-2", 17)}<span>游戏辅助</span><b>${snapshot.skins.length}</b></button><button class="nav-item ${currentRoute === "news" ? "nav-item--active" : ""}" data-route="news">${icon("book-open", 17)}<span>游戏资讯</span></button></div><div class="sidebar-section sidebar-section--bottom"><span class="eyebrow">SYSTEM</span><button class="nav-item" data-action="refresh">${icon("refresh-cw", 17)}<span>重新连接</span></button><button class="nav-item ${currentRoute === "settings" ? "nav-item--active" : ""}" data-route="settings">${icon("settings-2", 17)}<span>应用设置</span></button></div><div class="sidebar-foot"><span class="version-dot"></span><span>v0.3 · 本地运行</span></div></aside><main class="main-content main-content--dashboard" data-page="${currentRoute}" tabindex="0" aria-label="${routeTitle}内容">${content}</main></div><div id="toast" class="toast ${toastMessage ? "toast--visible" : ""}" data-kind="${toastKind}" aria-live="polite">${toastMessage ? escapeHtml(toastMessage) : ""}</div>
    </div>`;
  wireEvents();
  applyAppearance();
  refreshIcons();
}

function render(): void {
  const previousContent = app.querySelector<HTMLElement>(".main-content");
  const scrollTop = previousContent?.scrollTop ?? 0;
  const previousPage = previousContent?.dataset.page;
  const restoreContentFocus = previousContent === document.activeElement;
  applyAppearance();
  if (currentRoute === "assistant") renderSkinWorkspace();
  else renderDashboardShell();
  if (previousPage === currentRoute) {
    const content = app.querySelector<HTMLElement>(".main-content");
    if (content) {
      content.scrollTop = scrollTop;
      if (restoreContentFocus) content.focus({ preventScroll: true });
    }
  }
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "--:--";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(timestamp);
}

function refreshIcons(): void {
  createIcons({ icons: iconSet });
}

async function loadSkinImages(): Promise<void> {
  if (!isTauri) return;
  const current = snapshot.skins.find((skin) => skin.id === selectedSkinId);
  const paths = new Set<string>();
  if (current?.splashImagePath) paths.add(current.splashImagePath);
  if (current?.tileImagePath) paths.add(current.tileImagePath);
  const visibleSkinIds = new Set(
    [...document.querySelectorAll<HTMLButtonElement>(".skin-card")]
      .filter((card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.top < window.innerHeight + 320 && bounds.bottom > -320;
      })
      .map((card) => Number(card.dataset.skinId)),
  );
  for (const skin of filteredSkins().filter((item) => visibleSkinIds.has(item.id))) {
    if (skin.tileImagePath) {
      paths.add(skin.tileImagePath);
      if (skin.splashImagePath && imageFailures.has(skin.tileImagePath)) {
        paths.add(skin.splashImagePath);
      }
    } else if (skin.splashImagePath) {
      paths.add(skin.splashImagePath);
    }
  }
  const candidates = [...paths].filter((path) =>
    !imageCache.has(path) && !imageRequests.has(path) && !imageFailures.has(path),
  );
  await Promise.all(candidates.map(async (path) => {
    imageRequests.add(path);
    try {
      const dataUrl = await invokeCommand<string>("get_skin_image", { path });
      cacheImage(path, dataUrl);
      render();
    } catch (error) {
      imageFailures.add(path);
      console.error("Failed to load League skin image", { path, error });
      if (
        imageErrorNotice === null
        && current
        && [current.tileImagePath, current.splashImagePath].includes(path)
      ) {
        const reason = error instanceof Error ? error.message : String(error);
        imageErrorNotice = `皮肤图片读取失败：${reason}`;
      }
      render();
      if (imageErrorNotice) showToast(imageErrorNotice, "error");
    } finally {
      imageRequests.delete(path);
    }
  }));
}

function showToast(message: string, kind: "info" | "error" = "info"): void {
  toastMessage = message;
  toastKind = kind;
  const toast = document.querySelector<HTMLDivElement>("#toast");
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add("toast--visible");
  toastTimer = window.setTimeout(() => {
    toastMessage = null;
    document.querySelector<HTMLDivElement>("#toast")?.classList.remove("toast--visible");
  }, 2800);
}

async function invokeCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

function markSelectedLocally(skinId: number): void {
  previewOnlySelectionId = null;
  snapshot = {
    ...snapshot,
    selectedSkinId: skinId,
    skins: snapshot.skins.map((skin) => ({ ...skin, selected: skin.id === skinId })),
    updatedAtMs: Date.now(),
  };
}

async function applySkin(skinId: number): Promise<void> {
  if (busy) return;
  busy = true;
  render();
  try {
    let elapsedMs: number | undefined;
    if (isTauri) {
      const result = await invokeCommand<{ status: string; reason?: string; totalMs?: number }>("apply_skin", { skinId, expectedContextId: snapshot.contextId });
      if (result.status !== "success") throw new Error(result.reason ?? "客户端没有确认换肤");
      elapsedMs = result.totalMs;
      markSelectedLocally(skinId);
    } else {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 420));
      markSelectedLocally(skinId);
    }
    selectedSkinId = skinId;
    showToast(elapsedMs === undefined ? "皮肤已应用，客户端已确认" : `皮肤已应用，客户端已确认（${elapsedMs}ms）`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "换肤失败，请稍后重试", "error");
  } finally {
    busy = false;
    render();
  }
}

async function applyRandom(): Promise<void> {
  if (busy) return;
  if (isTauri) {
    busy = true;
    render();
    try {
      const result = await invokeCommand<{ status: string; skinId: number; reason?: string; totalMs?: number }>("apply_random_skin", { expectedContextId: snapshot.contextId });
      if (result.status !== "success") throw new Error(result.reason ?? "客户端没有确认随机换肤");
      selectedSkinId = result.skinId;
      markSelectedLocally(result.skinId);
      showToast(result.totalMs === undefined ? "随机皮肤已应用，客户端已确认" : `随机皮肤已应用，客户端已确认（${result.totalMs}ms）`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "随机换肤失败，请稍后重试", "error");
    } finally {
      busy = false;
      render();
    }
    return;
  }
  const candidates = snapshot.skins.filter((skin) => skin.available && skin.id !== snapshot.selectedSkinId && !skin.selected && !skin.isBase && !skin.isChroma);
  if (!candidates.length) {
    showToast("当前没有可随机的其他皮肤", "error");
    return;
  }
  const candidate = candidates[Math.floor(Math.random() * candidates.length)];
  previewOnlySelectionId = null;
  selectedSkinId = candidate.id;
  render();
  await applySkin(candidate.id);
}

function canApplySkinImmediately(skin: Skin): boolean {
  return snapshot.connection === "ready"
    && snapshot.active
    && snapshot.contextId !== null
    && snapshot.writeEnabled
    && !busy
    && skin.available
    && !skin.isChroma
    && skin.id !== snapshot.selectedSkinId;
}

async function startWindowDrag(event: MouseEvent): Promise<void> {
  if (!isTauri || event.button !== 0) return;
  const target = event.target;
  if (target instanceof Element && target.closest("button")) return;
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // The browser demo has no native window to move.
  }
}

function isCatalogFilter(value: string | undefined): value is CatalogFilter {
  return value === "可用" || value === "全部" || value === "收藏";
}

async function clearImageCache(): Promise<void> {
  imageCache.clear();
  imageRequests.clear();
  imageFailures.clear();
  imageErrorNotice = null;
  if (isTauri) {
    try {
      await invokeCommand("clear_image_cache", {});
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法清理图片缓存", "error");
      return;
    }
  }
  render();
  showToast("图片缓存已清除，正在重新加载");
}

async function updateLaunchAtStartup(enabled: boolean): Promise<void> {
  if (settingsBusy) return;
  settingsBusy = true;
  render();
  try {
    launchAtStartup = isTauri
      ? await invokeCommand<boolean>("set_launch_at_startup", { enabled })
      : enabled;
    persistAppPreferences();
    showToast(launchAtStartup ? "已开启开机自动启动" : "已关闭开机自动启动");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法修改开机启动设置", "error");
  } finally {
    settingsBusy = false;
    render();
  }
}

function wireEvents(): void {
  app.querySelector<HTMLElement>(".titlebar")?.addEventListener("mousedown", (event) => {
    void startWindowDrag(event);
  });
  app.querySelectorAll<HTMLElement>("[data-filter]").forEach((element) => element.addEventListener("click", () => {
    if (!isCatalogFilter(element.dataset.filter)) return;
    activeFilter = element.dataset.filter;
    persistCatalogState();
    render();
  }));
  app.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    searchQuery = input.value;
    persistCatalogState();
    render();
  });
  app.querySelectorAll<HTMLElement>("[data-skin-id]").forEach((element) => element.addEventListener("click", () => {
    const id = Number(element.dataset.skinId);
    if (!Number.isNaN(id)) {
      const skin = snapshot.skins.find((candidate) => candidate.id === id);
      previewOnlySelectionId = skin && (!skin.available || skin.isChroma) ? id : null;
      selectedSkinId = id;
      if (skin && canApplySkinImmediately(skin)) {
        void applySkin(id);
      } else {
        render();
      }
    }
  }));
  app.querySelectorAll<HTMLElement>("[data-favorite-id]").forEach((element) => element.addEventListener("click", () => {
    const id = Number(element.dataset.favoriteId);
    if (!Number.isNaN(id)) toggleFavorite(id);
  }));
  app.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((element) => element.addEventListener("change", () => {
    if (element.dataset.setting === "launch-at-startup") void updateLaunchAtStartup(element.checked);
  }));
  app.querySelectorAll<HTMLElement>("[data-route]").forEach((element) => element.addEventListener("click", () => {
    const route = element.dataset.route;
    if (route !== "profile" && route !== "assistant" && route !== "news" && route !== "settings") return;
    currentRoute = route;
    window.history.replaceState(null, "", `#${route}`);
    settingsOpen = false;
    render();
    refreshProfileIfNeeded();
  }));
  app.querySelectorAll<HTMLElement>("[data-news-tab]").forEach((element) => element.addEventListener("click", () => {
    const tab = element.dataset.newsTab;
    if (tab !== "champions" && tab !== "augments") return;
    newsTab = tab;
    newsQuery = "";
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-role]").forEach((element) => element.addEventListener("click", () => {
    const role = element.dataset.role as ChampionRole | undefined;
    if (!role || !["全部", "上路", "打野", "中路", "下路", "辅助"].includes(role)) return;
    championRole = role;
    render();
  }));
  app.querySelector<HTMLInputElement>("[data-news-search]")?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    newsQuery = input.value;
    render();
    window.setTimeout(() => app.querySelector<HTMLInputElement>("[data-news-search]")?.focus(), 0);
  });
  app.querySelectorAll<HTMLInputElement>("[data-pref]").forEach((element) => element.addEventListener("change", (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const key = input.dataset.pref;
    if (key === "autoAccept") autoAccept = input.checked;
    if (key === "autoSkin") autoSkin = input.checked;
    if (key === "notify") notifyEnabled = input.checked;
    if (key === "launchAtStartup") void updateLaunchAtStartup(input.checked);
    if (key === "compact") compactMode = input.checked;
    if (key === "animations") animationsEnabled = input.checked;
    persistAppPreferences();
    render();
    showToast(input.checked ? "偏好已开启" : "偏好已关闭");
  }));
  app.querySelectorAll<HTMLElement>("[data-theme]").forEach((element) => element.addEventListener("click", () => {
    const mode = element.dataset.theme;
    if (mode !== "dark" && mode !== "light") return;
    themeMode = mode;
    persistAppPreferences();
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-accent]").forEach((element) => element.addEventListener("click", () => {
    const color = element.dataset.accent;
    if (!color) return;
    accentColor = color;
    persistAppPreferences();
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => element.addEventListener("click", (event) => {
    const action = element.dataset.action;
    if (action === "close-settings" && element.classList.contains("modal-backdrop") && event.target !== element) return;
    if (action === "apply" && selectedSkinId !== null) void applySkin(selectedSkinId);
    if (action === "random") void applyRandom();
    if (action === "minimize" || action === "maximize" || action === "close") void runWindowAction(action);
    if (action === "refresh") void reconnectClient();
    if (action === "news-refresh") void hydrateDashboardData(true);
    if (action === "settings") {
      currentRoute = "settings";
      settingsOpen = true;
      render();
    }
    if (action === "home") {
      currentRoute = "profile";
      settingsOpen = false;
      render();
    }
    if (action === "close-settings") {
      settingsOpen = false;
      render();
    }
    if (action === "clear-image-cache") void clearImageCache();
    if (action === "clear-search") {
      searchQuery = "";
      persistCatalogState();
      render();
    }
    if (action === "route-assistant") {
      currentRoute = "assistant";
      window.history.replaceState(null, "", "#assistant");
      render();
    }
    if (action === "profile-refresh") void hydrateProfileData();
    if (action === "reset-preferences") {
      themeMode = DEFAULT_PREFERENCES.themeMode;
      accentColor = DEFAULT_PREFERENCES.accentColor;
      compactMode = DEFAULT_PREFERENCES.compactMode;
      animationsEnabled = DEFAULT_PREFERENCES.animations;
      autoAccept = DEFAULT_PREFERENCES.autoAccept;
      autoSkin = DEFAULT_PREFERENCES.autoSkin;
      notifyEnabled = DEFAULT_PREFERENCES.notify;
      persistAppPreferences();
      render();
      showToast("已恢复默认设置");
    }
    if (action === "show-logs") {
      logsOpen = !logsOpen;
      render();
    }
    if (action === "close-news-detail") {
      if (element.classList.contains("detail-backdrop") && event.target !== element) return;
      newsDetailId = null;
      render();
    }
  }));
  app.querySelectorAll<HTMLElement>("[data-news-detail]").forEach((element) => element.addEventListener("click", () => {
    const id = element.dataset.newsDetail;
    if (!id) return;
    newsDetailId = id;
    render();
  }));
}

async function reconnectClient(): Promise<void> {
  if (!isTauri) {
    showToast("演示模式已连接");
    return;
  }
  try {
    clearProfileData();
    render();
    await invokeCommand("reconnect_client", {});
    imageCache.clear();
    imageRequests.clear();
    imageFailures.clear();
    imageErrorNotice = null;
    showToast("已请求重新连接，客户端将在后台检测");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "重新连接失败", "error");
  }
}

async function hydrateNativePreferences(): Promise<void> {
  if (!isTauri) return;
  try {
    // Clear native topmost state even if an older version enabled it.
    await invokeCommand("disable_always_on_top", {});
  } catch (error) {
    console.error("Failed to disable always-on-top", error);
    showToast("无法取消窗口置顶，请重启应用", "error");
  }
  try {
    launchAtStartup = await invokeCommand<boolean>("get_launch_at_startup", {});
  } catch (error) {
    console.error("Failed to read launch-at-startup preference", error);
  }
  render();
}

function receiveSnapshot(next: Snapshot): void {
  if (next.revision < snapshot.revision) return;
  const previous = snapshot;
  snapshot = next;
  if (snapshot.contextId !== previous.contextId) {
    imageCache.clear();
    imageRequests.clear();
    imageFailures.clear();
    imageErrorNotice = null;
    previewOnlySelectionId = null;
    selectedSkinId = snapshot.selectedSkinId;
  }
  if (previewOnlySelectionId !== null && snapshot.selectedSkinId !== previous.selectedSkinId && snapshot.selectedSkinId !== previewOnlySelectionId) {
    previewOnlySelectionId = null;
  }
  if (snapshot.selectedSkinId !== null && !busy && previewOnlySelectionId === null) selectedSkinId = snapshot.selectedSkinId;
  if (snapshot.connection !== "ready") {
    clearProfileData();
  } else if (previous.connection !== "ready" || (previous.phase !== snapshot.phase
    && ["PreEndOfGame", "EndOfGame"].includes(snapshot.phase))) {
    void hydrateProfileData();
  }
  render();
}

async function bootstrap(): Promise<void> {
  loadLocalPreferences();
  render();
  void hydrateDashboardData();
  if (!isTauri) {
    void hydrateProfileData();
    return;
  }
  void hydrateNativePreferences();
  try {
    cleanupWindowResize = await getCurrentWindow().onResized(() => { void syncWindowMaximized(); });
    await syncWindowMaximized();
  } catch (error) {
    console.error("Failed to listen for window resize", error);
  }
  try {
    // Listen first so a connection established during startup cannot be missed.
    cleanupListener = await listen<Snapshot>("snapshot-changed", (event: { payload: Snapshot }) => receiveSnapshot(event.payload));
    receiveSnapshot(await invokeCommand<Snapshot>("get_snapshot", {}));
    profileRefreshTimer = window.setInterval(refreshProfileIfNeeded, 5_000);
  } catch {
    showToast("暂时无法读取客户端状态", "error");
  }
}

window.addEventListener("beforeunload", () => {
  cleanupListener?.();
  cleanupWindowResize?.();
  window.clearInterval(profileRefreshTimer);
});
window.addEventListener("focus", refreshProfileIfNeeded);
document.addEventListener("visibilitychange", refreshProfileIfNeeded);
app.addEventListener("scroll", () => {
  if (currentRoute !== "assistant") return;
  if (imageLoadFrame) return;
  imageLoadFrame = window.requestAnimationFrame(() => {
    imageLoadFrame = 0;
    void loadSkinImages();
  });
}, { capture: true, passive: true });
window.addEventListener("keydown", (event) => {
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if ((event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f")) && !settingsOpen) {
    event.preventDefault();
    app.querySelector<HTMLInputElement>("[data-search]")?.focus();
    return;
  }
  if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !typing && !settingsOpen) void applyRandom();
  if (event.key === "Escape") {
    if (settingsOpen) {
      settingsOpen = false;
      render();
    } else if (searchQuery && typing) {
      searchQuery = "";
      persistCatalogState();
      render();
    } else {
      void runWindowAction("close");
    }
  }
});

void bootstrap();
