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
  ExternalLink,
  Gamepad2,
  Gauge,
  Heart,
  ImageOff,
  Info,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  Lock,
  Maximize2,
  Monitor,
  Moon,
  Palette,
  PanelRightOpen,
  Pin,
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
  Wrench,
  Zap,
} from "lucide";
import { DEFAULT_PREFERENCES } from "./data/mock";
import type {
  AppPreferences,
  AssistantLog,
  AutoGameflowConfig,
  AutoGameflowSnapshot,
  AutoSelectConfig,
  AutoSelectSnapshot,
  AutoSelectStrategy,
  AutomationSnapshot,
  AugmentStat,
  ChampionCatalogItem,
  ChampionStat,
  MatchDetail,
  NewsDataMeta,
  AugmentCombo,
  OngoingGameSnapshot,
  PlayerDetail,
  PositionKey,
  ProfileSummary,
  RuntimeStatus,
  SavedPlayer,
  SummonerOverview,
} from "./data/types";
import { getAssistantLogs, getAugmentStats, getChampionStats, getNewsData } from "./services/mock";
import { getProfileSummary } from "./services/profile";
import { createHextechView } from "./hextech-view";
import { createRankingsView } from "./rankings-view";
import { renderShell } from "./shell";
import {
  fetchCompanionBuild,
  fetchCompanionOngoing,
  formatOngoingChatSummary,
  renderCompanionShell,
  type CompanionBenchState,
  type CompanionTab,
} from "./companion";
import { renderProfileView, type OpenPlayerTab } from "./views/profile-view";
import { renderAutomationView, type AutomationSubTab } from "./views/automation-view";
import { renderToolkitView } from "./views/toolkit-view";
import { renderSettingsView } from "./views/settings-view";
import type { HexDetail } from "./data/hextech";
import { applyThemeAndAccent, isHexColor, isPresetAccent, watchSystemTheme, type ThemeMode } from "./theme";
import "./styles.css";
import "./immersive.css";

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
  bench?: CompanionBenchState | null;
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
  { id: 67004, championId: 67, name: "觅心猎手", availability: "available", available: true, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67014, championId: 67, name: "灵魂莲华", availability: "available", available: true, selected: true, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67011, championId: 67, name: "源计划：净化", availability: "available", available: true, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
  { id: 67010, championId: 67, name: "摄魂使者", availability: "locked", available: false, selected: false, isBase: false, isChroma: false, parentSkinId: null, tileImagePath: null, splashImagePath: null },
];

const demoSkinImages: Record<number, string> = {
  67000: "vayne-classic.jpg", 67004: "vayne-heartseeker.jpg", 67014: "vayne-spirit.jpg",
  67011: "vayne-project.jpg", 67010: "vayne-soulstealer.jpg",
};

const demoSnapshot: Snapshot = {
  connection: "ready",
  phase: "ChampSelect",
  active: true,
  contextId: "demo-context",
  championId: 67,
  championName: "薇恩",
  selectedSkinId: 67014,
  writeEnabled: true,
  writeBlockReason: null,
  skins: demoSkins,
  bench: {
    enabled: true,
    canUse: true,
    phase: "FINALIZATION",
    rerollsRemaining: 2,
    showReroll: true,
    champions: [
      { championId: 22, swappable: true },
      { championId: 81, swappable: true },
      { championId: 103, swappable: true },
      { championId: 157, swappable: true },
      { championId: 117, swappable: false },
    ],
  },
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
  ExternalLink,
  Gamepad2,
  Gauge,
  Heart,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  Lock,
  Maximize2,
  Monitor,
  Moon,
  Palette,
  PanelRightOpen,
  Pin,
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
  Wrench,
  Zap,
  X,
};

const isTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const urlParams = new URLSearchParams(window.location.search);
const isCompanionWindow = urlParams.get("window") === "companion";
const urlCompanionTab = urlParams.get("tab");
const initialCompanionTab: CompanionTab = urlCompanionTab === "build"
  ? "build"
  : urlCompanionTab === "ongoing"
    ? "ongoing"
    : "skin";
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
type AppRoute = "profile" | "assistant" | "news" | "automation" | "toolkit" | "settings";
const NEWS_MODES = { rift: "峡谷", hextech: "海克斯大乱斗", aram: "极地大乱斗", classic: "经典模式" } as const;
type NewsMode = keyof typeof NEWS_MODES;
type NewsTab = "ranking" | "champions" | "augments";
type ChampionRole = "全部" | "上路" | "打野" | "中路" | "下路" | "辅助";

function isAppRoute(value: string): value is AppRoute {
  return value === "profile"
    || value === "assistant"
    || value === "news"
    || value === "automation"
    || value === "toolkit"
    || value === "settings";
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
let benchBusy = false;
let windowMaximized = false;
let launchAtStartup = false;
let settingsOpen = false;
let settingsBusy = false;
const initialRoute = window.location.hash.slice(1);
let currentRoute: AppRoute = isAppRoute(initialRoute) ? initialRoute : "profile";
let companionTab: CompanionTab = initialCompanionTab;
let companionBuildHeroId: number | null = snapshot.championId;
let companionBuildDetail: HexDetail | null = null;
let companionBuildLoading = false;
let companionBuildError = "";
let companionBuildRequest = 0;
let ongoingGame: OngoingGameSnapshot | null = null;
let ongoingLoading = false;
let ongoingError = "";
let ongoingRequest = 0;
let sendingChat = false;
let quickTagPuuid: string | null = null;
let activePlayerTab = "self";
let openPlayerTabs: OpenPlayerTab[] = [];
let playerSearchQuery = "";
let playerSearching = false;
let tagDraft = "";
let noteDraft = "";
let savingTag = false;
let savedPlayers: SavedPlayer[] = [];
let savedPlayersOpen = false;
let matchDetailOpen = false;
let matchDetailLoading = false;
let matchDetailError: string | null = null;
let matchDetail: MatchDetail | null = null;
let matchDetailRequest = 0;
let profileModeFilter: "all" | "排位赛" | "极地大乱斗" = "all";
let profileExpandedMatchId: string | null = null;
let profileTrendMetric: "winRate" | "kda" = "winRate";
let newsMode: NewsMode = "rift";
let newsTab: NewsTab = "ranking";
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
let autoSelectLogs: AssistantLog[] = [];
let autoGameflowLogs: AssistantLog[] = [];
let automationSubTab: AutomationSubTab = "flow";
let autoSelectPickPos: PositionKey = "default";
let autoSelectBanPos: PositionKey = "default";
let autoSelectPaused = false;
let autoSelectRevision = -1;
let autoGameflowRevision = -1;
let autoSelectConfig: AutoSelectConfig = {
  pickEnabled: false,
  pickStrategy: "show-and-lock-in",
  pickDelaySeconds: 0,
  showIntent: false,
  ignoreTeammateIntent: false,
  pickChampions: { default: [], top: [], jungle: [], middle: [], bottom: [], utility: [] },
  banEnabled: false,
  banStrategy: "show-and-lock-in",
  banDelaySeconds: 0,
  banAvoidTeammateIntent: true,
  banChampions: { default: [], top: [], jungle: [], middle: [], bottom: [], utility: [] },
  benchEnabled: false,
  benchDelaySeconds: 1,
  benchChampions: [],
  benchAutoAcceptTrade: false,
};
let autoGameflowConfig: AutoGameflowConfig = {
  autoHonorEnabled: false,
  autoHonorStrategy: "random-teammate",
  autoPlayAgainEnabled: false,
  autoMatchmakingEnabled: false,
  autoMatchmakingDelaySeconds: 3,
  autoMatchmakingMinMembers: 1,
  autoReconnectEnabled: false,
  autoInvitationMode: "off",
};
let championCatalog: ChampionCatalogItem[] = [
  { id: 67, name: "薇恩" },
  { id: 22, name: "艾希" },
  { id: 81, name: "伊泽瑞尔" },
  { id: 103, name: "阿狸" },
  { id: 157, name: "亚索" },
  { id: 238, name: "劫" },
  { id: 117, name: "璐璐" },
  { id: 412, name: "锤石" },
  { id: 64, name: "李青" },
  { id: 24, name: "贾克斯" },
];
let runtimeStatus: RuntimeStatus = { wsConnected: false, connectionEpoch: 0, sessionEpoch: 0 };
let toolkitBusy = false;
let dashboardLoading = true;
let logsOpen = false;
let newsDetailId: string | null = null;
const hextech = createHextechView({
  isNative: isTauri,
  render,
  escape: escapeHtml,
  icon,
  image: renderGameIcon,
  openCompanionBuild: (heroId) => { void openCompanionWindow("build", heroId); },
});
const rankings = createRankingsView({ isNative: isTauri, activeMode: () => newsMode, render, escape: escapeHtml, icon, image: renderGameIcon });
let autoAccept = DEFAULT_PREFERENCES.autoAccept;
let autoAcceptDelaySeconds = DEFAULT_PREFERENCES.autoAcceptDelaySeconds;
let autoAcceptReady = !isTauri;
let autoAcceptSaving = false;
let automationRevision = -1;
let autoSkin = DEFAULT_PREFERENCES.autoSkin;
let autoPopupCompanion = DEFAULT_PREFERENCES.autoPopupCompanion;
let companionAlwaysOnTop = DEFAULT_PREFERENCES.companionAlwaysOnTop;
let notifyEnabled = DEFAULT_PREFERENCES.notify;
let compactMode = DEFAULT_PREFERENCES.compactMode;
let animationsEnabled = DEFAULT_PREFERENCES.animations;
let themeMode: ThemeMode = DEFAULT_PREFERENCES.themeMode;
let accentColor = DEFAULT_PREFERENCES.accentColor;
let toastTimer: number | undefined;
let toastMessage: string | null = null;
let toastKind: "info" | "error" = "info";
let cleanupListener: UnlistenFn | undefined;
let cleanupAutomationListener: UnlistenFn | undefined;
let cleanupAutoSelectListener: UnlistenFn | undefined;
let cleanupAutoGameflowListener: UnlistenFn | undefined;
let cleanupAppearanceListener: UnlistenFn | undefined;
let cleanupCompanionNavListener: UnlistenFn | undefined;
let cleanupWindowResize: UnlistenFn | undefined;
let cleanupSystemTheme: (() => void) | undefined;
const imageCache = new Map<string, string>();
const MAX_IMAGE_CACHE_ENTRIES = 64;
const imageRequests = new Set<string>();
const imageFailures = new Set<string>();
const gameIconCache = new Map<string, string>();
const gameIconRequests = new Set<string>();
const gameIconFailures = new Set<string>();
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
    autoAcceptDelaySeconds,
    autoSkin,
    autoPopupCompanion,
    companionAlwaysOnTop,
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
  const resolved = applyThemeAndAccent(app, themeMode, accentColor);
  app.dataset.compact = String(compactMode);
  app.dataset.motion = String(animationsEnabled);
  const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = resolved === "dark" ? "#0f1115" : "#fafafa";
}

function broadcastAppearance(): void {
  if (!isTauri) return;
  void invokeCommand("sync_appearance", {
    appearance: { themeMode, accentColor, compactMode, animations: animationsEnabled },
  }).catch(() => {});
}

async function openCompanionWindow(tab: CompanionTab = "skin", heroId?: number): Promise<void> {
  if (isTauri) {
    try {
      await invokeCommand("open_companion_window", { tab, heroId: heroId ?? null });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法打开选人小窗", "error");
    }
    return;
  }
  const params = new URLSearchParams({ window: "companion", tab });
  if (heroId) params.set("heroId", String(heroId));
  const url = `${window.location.pathname}?${params.toString()}`;
  const popup = window.open(url, "lol-companion", "width=400,height=690,resizable=yes");
  if (!popup) {
    window.location.href = url;
  }
}

async function closeCompanionWindow(): Promise<void> {
  if (isTauri) {
    try {
      await invokeCommand("hide_companion_window", {});
    } catch {
      // Ignore if already hidden.
    }
    return;
  }
  if (window.opener) {
    window.close();
  } else {
    window.location.href = window.location.pathname;
  }
}

async function showMainWindow(): Promise<void> {
  if (isTauri) {
    try {
      await invokeCommand("show_main_window_cmd", {});
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法打开主窗口", "error");
    }
    return;
  }
  window.location.href = window.location.pathname;
}

async function updateCompanionPin(enabled: boolean): Promise<void> {
  companionAlwaysOnTop = enabled;
  persistAppPreferences();
  if (isTauri) {
    try {
      await invokeCommand("set_companion_pin", { enabled });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法切换小窗悬浮状态", "error");
    }
  }
  render();
}

async function updateAutoPopupCompanion(enabled: boolean): Promise<void> {
  autoPopupCompanion = enabled;
  persistAppPreferences();
  if (isTauri) {
    try {
      await invokeCommand("set_auto_popup_companion", { enabled });
    } catch {
      // Fallback safely.
    }
  }
  render();
}

async function loadCompanionBuild(heroId: number | null, force = false): Promise<void> {
  companionBuildHeroId = heroId;
  if (!heroId) {
    companionBuildDetail = null;
    companionBuildError = "";
    companionBuildLoading = false;
    render();
    return;
  }
  if (!force && companionBuildDetail?.heroId === heroId) return;
  const req = ++companionBuildRequest;
  companionBuildLoading = true;
  companionBuildError = "";
  if (force) companionBuildDetail = null;
  render();
  try {
    const detail = await fetchCompanionBuild(isTauri, heroId, force);
    if (req !== companionBuildRequest) return;
    companionBuildDetail = detail;
  } catch (error) {
    if (req !== companionBuildRequest) return;
    companionBuildDetail = null;
    companionBuildError = error instanceof Error ? error.message : String(error);
  } finally {
    if (req === companionBuildRequest) {
      companionBuildLoading = false;
      render();
    }
  }
}

async function loadCompanionOngoing(force = false): Promise<void> {
  if (!force && ongoingLoading) return;
  const req = ++ongoingRequest;
  ongoingLoading = true;
  ongoingError = "";
  render();
  try {
    const next = await fetchCompanionOngoing(isTauri);
    if (req !== ongoingRequest) return;
    ongoingGame = next;
  } catch (error) {
    if (req !== ongoingRequest) return;
    ongoingError = error instanceof Error ? error.message : String(error);
  } finally {
    if (req === ongoingRequest) {
      ongoingLoading = false;
      render();
    }
  }
}

async function sendOngoingToChampSelectChat(): Promise<void> {
  if (sendingChat || !ongoingGame || !ongoingGame.canSendChat) return;
  const message = formatOngoingChatSummary(ongoingGame);
  if (!message) return;
  if (!isTauri) {
    showToast("演示：已发送本局战绩到选人频道");
    return;
  }
  sendingChat = true;
  render();
  try {
    await invokeCommand("send_champ_select_chat", { message });
    showToast("已发送到选人频道");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  } finally {
    sendingChat = false;
    render();
  }
}

async function hydrateSavedPlayers(): Promise<void> {
  const selfPuuid = profileData?.summoner.puuid || ongoingGame?.selfPuuid || "";
  if (!isTauri || !selfPuuid) return;
  try {
    const list = await invokeCommand<SavedPlayer[]>("list_saved_players", { selfPuuid });
    if (Array.isArray(list)) {
      savedPlayers = list;
      render();
    }
  } catch {
    // Non-critical DB load.
  }
}

async function searchAndOpenPlayer(rawQuery: string): Promise<void> {
  const query = rawQuery.trim();
  if (!query || playerSearching) return;
  if (!isTauri) {
    const demoPuuid = `demo-${encodeURIComponent(query)}`;
    await openPlayerTab(demoPuuid, query.split("#")[0] || query, true);
    return;
  }
  playerSearching = true;
  render();
  try {
    const overview = await invokeCommand<SummonerOverview>("search_player", { query });
    playerSearchQuery = "";
    await openPlayerTab(overview.puuid, overview.gameName, true);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  } finally {
    playerSearching = false;
    render();
  }
}

async function openPlayerTab(puuid: string, label: string, force = false): Promise<void> {
  let tab = openPlayerTabs.find((item) => item.puuid === puuid);
  if (!tab) {
    tab = { puuid, label, detail: null, loading: false, error: null };
    openPlayerTabs = [...openPlayerTabs.slice(-4), tab];
  } else if (label && tab.label !== label) {
    tab.label = label;
  }
  activePlayerTab = puuid;
  tagDraft = tab.detail?.saved?.tag ?? "";
  noteDraft = tab.detail?.saved?.note ?? "";
  if (!force && tab.detail) {
    render();
    return;
  }
  tab.loading = true;
  tab.error = null;
  render();
  try {
    if (!isTauri) {
      tab.detail = {
        selfPuuid: "demo-self",
        summoner: {
          puuid,
          summonerId: 1001,
          gameName: label,
          tagLine: "CN1",
          level: 142,
          iconPath: null,
          privacy: "PUBLIC",
        },
        ranks: [{ queueType: "RANKED_SOLO_5x5", queueLabel: "单双排", tier: "翡翠", division: "II", ranked: true, points: 64, wins: 48, losses: 39, winRate: 55 }],
        matches: [
          { id: "demo:9001", gameId: 9001, championId: 67, champion: "薇恩", result: "win", mode: "单双排位", queueId: 420, kills: 11, deaths: 2, assists: 6, cs: 224, gold: 15200, damage: 34800, durationSeconds: 1740, playedAtMs: Date.now() - 3600_000, items: [3153, 3124] },
          { id: "demo:9002", gameId: 9002, championId: 103, champion: "阿狸", result: "loss", mode: "极地大乱斗", queueId: 450, kills: 6, deaths: 7, assists: 12, cs: 62, gold: 12400, damage: 26100, durationSeconds: 1120, playedAtMs: Date.now() - 7200_000, items: [3089] },
        ],
        mastery: [
          { championId: 67, championName: "薇恩", level: 18, points: 245000 },
          { championId: 103, championName: "阿狸", level: 12, points: 118000 },
        ],
        stats: { sampleSize: 2, wins: 1, losses: 1, winRate: 50, avgKda: 3.9, avgKills: 8.5, avgDeaths: 4.5, avgAssists: 9.0, streak: 1, score: 74 },
        saved: savedPlayers.find((s) => s.puuid === puuid) ?? null,
        encountered: [],
        warnings: [],
      };
    } else {
      const detail = await invokeCommand<PlayerDetail>("get_player_detail", { puuid, begIndex: 0, endIndex: 19 });
      tab.detail = detail;
      tab.label = detail.summoner.gameName;
    }
    if (activePlayerTab === puuid && tab.detail) {
      tagDraft = tab.detail.saved?.tag ?? "";
      noteDraft = tab.detail.saved?.note ?? "";
    }
  } catch (error) {
    tab.error = error instanceof Error ? error.message : String(error);
  } finally {
    tab.loading = false;
    render();
  }
}

function closePlayerTab(puuid: string): void {
  openPlayerTabs = openPlayerTabs.filter((tab) => tab.puuid !== puuid);
  if (activePlayerTab === puuid) {
    activePlayerTab = "self";
    tagDraft = "";
    noteDraft = "";
  }
  render();
}

async function openMatchDetail(gameId: number): Promise<void> {
  if (!Number.isInteger(gameId) || gameId <= 0) return;
  const req = ++matchDetailRequest;
  matchDetailOpen = true;
  matchDetailLoading = true;
  matchDetailError = null;
  matchDetail = null;
  render();
  try {
    if (!isTauri) {
      matchDetail = {
        gameId,
        mode: "单双排位",
        queueId: 420,
        durationSeconds: 1740,
        playedAtMs: Date.now() - 3600_000,
        teams: [
          {
            teamId: 100, win: true, kills: 28, deaths: 14, assists: 51, totalDamage: 124000, totalGold: 64200,
            players: [
              { puuid: "demo-self", gameName: "峡印演示", tagLine: "CN1", teamId: 100, championId: 67, championName: "薇恩", kills: 11, deaths: 2, assists: 6, cs: 224, gold: 15200, damage: 34800, damageTaken: 14200, visionScore: 22, win: true, items: [3153, 3124], spell1Id: 4, spell2Id: 7, role: "下路", isSelf: true },
              { puuid: "demo-mate-1", gameName: "轻舟过万山", tagLine: "2048", teamId: 100, championId: 117, championName: "璐璐", kills: 2, deaths: 1, assists: 20, cs: 34, gold: 10400, damage: 11200, damageTaken: 10800, visionScore: 48, win: true, items: [], spell1Id: 4, spell2Id: 3, role: "辅助", isSelf: false },
            ],
          },
          {
            teamId: 200, win: false, kills: 14, deaths: 28, assists: 24, totalDamage: 92000, totalGold: 53100,
            players: [
              { puuid: "demo-enemy-1", gameName: "晚风知我意", tagLine: "8848", teamId: 200, championId: 103, championName: "阿狸", kills: 6, deaths: 6, assists: 4, cs: 196, gold: 11800, damage: 26100, damageTaken: 18500, visionScore: 19, win: false, items: [], spell1Id: 4, spell2Id: 14, role: "中路", isSelf: false },
            ],
          },
        ],
      };
    } else {
      const detail = await invokeCommand<MatchDetail>("get_match_detail", { gameId });
      if (req !== matchDetailRequest) return;
      matchDetail = detail;
    }
  } catch (error) {
    if (req !== matchDetailRequest) return;
    matchDetailError = error instanceof Error ? error.message : String(error);
  } finally {
    if (req === matchDetailRequest) {
      matchDetailLoading = false;
      render();
    }
  }
}

async function savePlayerTag(puuid: string, tag: string, note: string): Promise<void> {
  if (savingTag) return;
  const selfPuuid = profileData?.summoner.puuid || ongoingGame?.selfPuuid || openPlayerTabs.find((t) => t.puuid === puuid)?.detail?.selfPuuid || "demo-self";
  savingTag = true;
  render();
  try {
    const saved: SavedPlayer = isTauri
      ? await invokeCommand<SavedPlayer>("upsert_saved_player", { puuid, selfPuuid, tag, note })
      : { puuid, selfPuuid, tag, note, updatedAtMs: Date.now() };
    savedPlayers = [saved, ...savedPlayers.filter((s) => s.puuid !== puuid)];
    const tab = openPlayerTabs.find((t) => t.puuid === puuid);
    if (tab?.detail) tab.detail.saved = saved;
    if (ongoingGame) {
      for (const p of [...ongoingGame.myTeam, ...ongoingGame.enemyTeam]) {
        if (p.puuid === puuid) {
          p.saved = saved;
          p.tags = [saved.tag, ...p.tags.filter((t) => !["大腿", "靠谱", "谨慎", "拉黑", saved.tag].includes(t))];
        }
      }
    }
    showToast("已保存玩家标记");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  } finally {
    savingTag = false;
    render();
  }
}

async function deletePlayerTag(puuid: string): Promise<void> {
  if (savingTag) return;
  const selfPuuid = profileData?.summoner.puuid || ongoingGame?.selfPuuid || openPlayerTabs.find((t) => t.puuid === puuid)?.detail?.selfPuuid || "demo-self";
  savingTag = true;
  render();
  try {
    if (isTauri) {
      await invokeCommand("delete_saved_player", { puuid, selfPuuid });
    }
    savedPlayers = savedPlayers.filter((s) => s.puuid !== puuid);
    const tab = openPlayerTabs.find((t) => t.puuid === puuid);
    if (tab?.detail) tab.detail.saved = null;
    if (activePlayerTab === puuid) {
      tagDraft = "";
      noteDraft = "";
    }
    if (ongoingGame) {
      for (const p of [...ongoingGame.myTeam, ...ongoingGame.enemyTeam]) {
        if (p.puuid === puuid) {
          const oldTag = p.saved?.tag;
          p.saved = null;
          if (oldTag) p.tags = p.tags.filter((t) => t !== oldTag);
        }
      }
    }
    showToast("已清除玩家标记");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  } finally {
    savingTag = false;
    render();
  }
}

async function hydrateDashboardData(force = false): Promise<void> {
  if (force) gameIconFailures.clear();
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
    const [news, logs] = await Promise.all([newsLoader, isTauri ? Promise.resolve(null) : getAssistantLogs()]);
    championStats = news.champions;
    augmentStats = news.augments;
    augmentCombos = news.combos;
    newsMeta = news.meta;
    if (logs) assistantLogs = logs;
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
    void hydrateSavedPlayers();
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
    if (preferences.themeMode === "system" || preferences.themeMode === "dark" || preferences.themeMode === "light") {
      themeMode = preferences.themeMode;
    }
    if (typeof preferences.accentColor === "string" && (isPresetAccent(preferences.accentColor) || isHexColor(preferences.accentColor))) {
      accentColor = preferences.accentColor;
    }
    if (typeof preferences.compactMode === "boolean") compactMode = preferences.compactMode;
    if (typeof preferences.animations === "boolean") animationsEnabled = preferences.animations;
    if (typeof preferences.autoAccept === "boolean") autoAccept = preferences.autoAccept;
    if (Number.isInteger(preferences.autoAcceptDelaySeconds) && preferences.autoAcceptDelaySeconds! >= 0 && preferences.autoAcceptDelaySeconds! <= 5) {
      autoAcceptDelaySeconds = preferences.autoAcceptDelaySeconds!;
    }
    if (typeof preferences.autoSkin === "boolean") autoSkin = preferences.autoSkin;
    if (typeof preferences.autoPopupCompanion === "boolean") autoPopupCompanion = preferences.autoPopupCompanion;
    if (typeof preferences.companionAlwaysOnTop === "boolean") companionAlwaysOnTop = preferences.companionAlwaysOnTop;
    if (typeof preferences.notify === "boolean") notifyEnabled = preferences.notify;
    if (typeof preferences.launchAtStartup === "boolean") launchAtStartup = preferences.launchAtStartup;
  }
}

function skinImage(skin: Skin, large = false): string {
  if (!isTauri && demoSkinImages[skin.id]) {
    return `<img class="skin-image" src="/preview/${demoSkinImages[skin.id]}" alt="${escapeHtml(skin.name)}" />`;
  }
  const paths = large
    ? [skin.splashImagePath, skin.tileImagePath]
    : [skin.tileImagePath, skin.splashImagePath];
  const path = paths.find((candidate) => candidate && imageCache.has(candidate));
  if (path) {
    return `<img class="skin-image" src="${escapeHtml(imageCache.get(path) ?? "")}" alt="${escapeHtml(skin.name)}" />`;
  }
  const hue = (skin.id * 37) % 360;
  const label = large ? "原画暂未加载" : skin.isBase ? "经典" : skin.name.slice(0, 2);
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
  if (snapshot.connection === "ready" && snapshot.active) return "选人中";
  if (snapshot.connection === "ready") return "已连接";
  return "未连接";
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
    Matchmaking: "正在匹配",
    ReadyCheck: "等待接受对局",
    InProgress: "游戏中",
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
      <button class="skin-card ${skin.id === selectedSkinId ? "skin-card--selected" : ""} ${!skin.available ? "skin-card--locked" : ""}" data-skin-id="${skin.id}" aria-label="预览 ${escapeHtml(skin.name)}${!skin.available ? "（不可用）" : ""}" aria-pressed="${skin.id === selectedSkinId}" ${busy ? "disabled" : ""}>
        <div class="skin-thumb">${skinImage(skin)}${skin.id === selectedSkinId ? `<span class="selected-mark">${icon("check", 13)}</span>` : ""}${!skin.available ? `<span class="lock-mark">${icon("lock", 13)}</span>` : ""}</div>
        <div class="skin-info"><strong>${escapeHtml(skin.name)}</strong><span>${skin.isBase ? "默认外观" : skin.isChroma ? "炫彩预览" : skin.available ? "可用" : "不可用"}</span></div>
      </button>
      <button class="favorite-button ${favorite ? "favorite-button--active" : ""}" data-favorite-id="${skin.id}" aria-label="${escapeHtml(favoriteLabel(skin))}" aria-pressed="${favorite}" title="${escapeHtml(favoriteLabel(skin))}">${icon("heart", 15)}</button>
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
  const filtered = filteredSkins();
  const ready = snapshot.connection === "ready" && snapshot.active;
  const canApply = ready && snapshot.contextId !== null && snapshot.writeEnabled && !busy;
  const blockReason = writeBlockLabel();
  const currentFavorite = current ? favoriteSkinIds.has(current.id) : false;
  const availability = current?.isChroma ? "炫彩预览" : current?.selected ? "当前已使用" : current?.available ? "已拥有" : "仅可预览";
  const description = current
    ? blockReason ?? (current.isBase ? "英雄本来的样子。" : "选好出场的样子。")
    : snapshot.connection === "ready" ? "进入英雄选择后，在这里挑选可用皮肤。" : "启动并登录英雄联盟客户端，衣橱将自动连接。";
  const content = `
    <div class="wardrobe-popout-bar">
      <div class="wardrobe-popout-copy">
        <strong>选人阶段自动弹出独立伴随小窗</strong>
        <span>切换皮肤与海克斯速查会在游戏客户端旁独立弹出，不遮挡选人界面；也可以随时手动弹出。</span>
      </div>
      <button class="secondary-button" data-action="open-companion">${icon("external-link", 14)}弹出独立小窗</button>
    </div>
    <section class="wardrobe-stage ${current ? "" : "wardrobe-stage--empty"}" aria-label="当前皮肤预览">
      <div class="wardrobe-art" aria-hidden="true">${current ? skinImage(current, true) : `<div class="empty-art">${icon("gamepad-2", 44)}</div>`}</div>
      <div class="wardrobe-session"><span class="session-dot ${ready ? "" : "session-dot--idle"}"></span>${!isTauri ? "选人阶段 · 演示状态" : escapeHtml(phaseLabel())}<span class="wardrobe-preview-label">${current ? "原画预览" : "选好英雄，准备出场"}</span></div>
      <div class="wardrobe-stage-body">
        <div class="wardrobe-copy"><p class="wardrobe-champion">${escapeHtml(champion)}</p><h1>${current ? escapeHtml(current.name) : "你的下一次出场"}</h1><p class="wardrobe-description">${escapeHtml(description)}</p></div>
        <div class="wardrobe-actions">
          ${current ? `<span class="wardrobe-ownership">${icon(busy ? "loader-circle" : current.available ? "check" : "lock", 15)}${busy ? "正在切换" : availability}${!isTauri ? " · 演示" : ""}</span><div class="wardrobe-action-row"><button class="wardrobe-favorite ${currentFavorite ? "wardrobe-favorite--active" : ""}" data-favorite-id="${current.id}" aria-label="${escapeHtml(favoriteLabel(current))}" aria-pressed="${currentFavorite}">${icon("heart", 20)}</button></div>` : `<button class="secondary-button" data-action="refresh">${icon("refresh-cw", 16)}重新连接</button>`}
          <p class="wardrobe-action-hint">${!isTauri ? "点击下方皮肤即可直接切换（演示）" : ready ? "点击下方可用皮肤即可直接同步到客户端" : "等待客户端进入英雄选择"}</p>
        </div>
      </div>
    </section>
    <section class="wardrobe-catalog" aria-label="皮肤衣橱">
      <header class="catalog-head"><div class="catalog-title"><h2>${current ? `${escapeHtml(champion)}的衣橱` : "皮肤衣橱"}</h2><span>${snapshot.skins.length} 款外观</span></div><div class="catalog-tools"><label class="search-box">${icon("search", 16)}<input type="search" maxlength="80" value="${escapeHtml(searchQuery)}" placeholder="搜索皮肤" aria-label="搜索皮肤" data-search /></label><div class="segmented" role="group" aria-label="筛选皮肤">${(["可用", "全部", "收藏"] satisfies CatalogFilter[]).map((filter) => `<button class="segment ${activeFilter === filter ? "segment--active" : ""}" aria-pressed="${activeFilter === filter}" data-filter="${filter}">${filter}</button>`).join("")}</div><button class="secondary-button random-button" data-action="random" aria-label="随机一款可用皮肤" title="随机一款可用皮肤（R）" ${canApply ? "" : "disabled"}>${icon("shuffle", 18)}</button></div></header>
      <div class="skin-grid" tabindex="0" aria-label="皮肤列表，可左右滚动">${filtered.length ? filtered.map(renderSkinCard).join("") : `<div class="empty-state">${icon(snapshot.skins.length ? "search-x" : "image-off", 22)}<span>${!snapshot.skins.length ? "进入选人阶段后，皮肤会显示在这里" : activeFilter === "收藏" && favoriteSkinIds.size === 0 ? "还没有收藏皮肤" : "没有符合条件的皮肤"}</span>${searchQuery ? `<button class="text-button" data-action="clear-search">清除搜索</button>` : ""}</div>`}</div>
    </section>
    <section class="wardrobe-automation" aria-label="游戏辅助设置"><div class="automation-options"><label class="automation-option"><span>${icon("zap", 16)}自动接受对局</span><input class="switch-input" type="checkbox" data-pref="autoAccept" aria-label="自动接受对局" ${autoAccept ? "checked" : ""} ${!autoAcceptReady || autoAcceptSaving ? "disabled" : ""} /><span class="switch-track" aria-hidden="true"></span></label><label class="automation-delay"><span>等待</span>${autoAcceptDelaySelect()}<span>未确认时接受</span></label><label class="automation-option"><span>${icon("sparkles", 16)}自动应用皮肤</span><input class="switch-input" type="checkbox" data-pref="autoSkin" aria-label="自动应用皮肤" ${autoSkin ? "checked" : ""} ${!ready ? "disabled" : ""} /><span class="switch-track" aria-hidden="true"></span></label></div><button class="text-button" data-action="show-logs">${icon("list-checks", 16)}${logsOpen ? "收起日志" : "操作日志"}</button></section>
    ${logsOpen ? `<section class="wardrobe-logs" aria-label="操作日志"><div class="operation-log"><div class="operation-log-head"><span>时间</span><span>操作</span><span>详情</span><span>状态</span></div>${assistantLogs.length ? assistantLogs.map((log) => `<div class="operation-log-row"><span>${escapeHtml(log.time)}</span><strong>${escapeHtml(log.action)}</strong><span>${escapeHtml(log.detail)}</span><em class="log-status log-status--${log.status}">${log.status === "success" ? "成功" : log.status === "pending" ? "等待确认" : "失败"}</em></div>`).join("") : `<div class="empty-state">暂无执行记录</div>`}</div></section>` : ""}
    <footer class="content-foot"><span>${icon("shield-check", 14)}${!isTauri ? "账号与拥有状态均为演示" : "只通过客户端接口切换皮肤"}</span><span>最后同步 ${formatTime(snapshot.updatedAtMs)}</span></footer>`;
  app.innerHTML = renderAppShell(content);
  wireEvents();
  refreshIcons();
  if (restoreSearchFocus) {
    const input = app.querySelector<HTMLInputElement>("[data-search]");
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(input.value.length, input.value.length);
  }
  void loadSkinImages();
}

function renderProfilePage(): string {
  return renderProfileView({
    isTauri,
    connected: snapshot.connection === "ready",
    profileData,
    profileLoading,
    profileError,
    profileModeFilter,
    profileExpandedMatchId,
    profileTrendMetric,
    favoritesCount: favoriteSkinIds.size,
    activePlayerTab,
    openPlayerTabs,
    playerSearchQuery,
    playerSearching,
    tagDraft,
    noteDraft,
    savingTag,
    savedPlayers,
    savedPlayersOpen,
    matchDetailOpen,
    matchDetailLoading,
    matchDetailError,
    matchDetail,
    escape: escapeHtml,
    icon,
    formatTime,
    renderChampionIcon,
  });
}

function newsPercent(value: number | null): string {
  return value === null ? "未提供" : `${value.toFixed(1)}%`;
}

function renderGameIcon(name: string, color: string, path?: string, url?: string, kind = "champion", extraClass = ""): string {
  const key = path || url;
  const cached = key ? gameIconCache.get(key) : undefined;
  const fallback = kind === "augment" ? icon("sparkles", 14) : escapeHtml(Array.from(name).slice(0, 2).join(""));
  const attributes = key ? ` data-game-icon="${escapeHtml(key)}" data-icon-path="${escapeHtml(path ?? "")}" data-icon-url="${escapeHtml(url ?? "")}"` : "";
  return `<span class="${kind}-token game-icon ${extraClass}" style="--token-color:${escapeHtml(color)}" role="img" aria-label="${escapeHtml(name)}"${attributes}>${cached ? `<img src="${cached}" alt="" />` : fallback}</span>`;
}

function renderChampionIcon(id: number | undefined, name: string, color: string, extraClass = ""): string {
  const champion = championStats.find((item) => item.id === id);
  const path = id ? `/lol-game-data/assets/v1/champion-icons/${id}.png` : undefined;
  return renderGameIcon(name, color, path, champion?.iconUrl, "champion", extraClass);
}

function loadGameIcons(): void {
  if (!isTauri) return;
  const iconRoot = app.querySelector<HTMLElement>(".hex-detail, .detail-drawer") ?? app;
  const elements = [...iconRoot.querySelectorAll<HTMLElement>("[data-game-icon]")];
  for (const element of elements) {
    const cached = gameIconCache.get(element.dataset.gameIcon!);
    if (cached && !element.querySelector("img")) element.innerHTML = `<img src="${cached}" alt="" />`;
  }
  const candidates = elements.filter((element) => {
    const key = element.dataset.gameIcon!;
    if (element.querySelector("img") || gameIconRequests.has(key) || gameIconFailures.has(key)) return false;
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.bottom > 62 && bounds.top < window.innerHeight;
  });
  for (const element of candidates) {
    if (gameIconRequests.size >= 4) break;
    const key = element.dataset.gameIcon!;
    if (gameIconRequests.has(key)) continue;
    gameIconRequests.add(key);
    void invokeCommand<string>("get_game_icon", {
      path: element.dataset.iconPath || null,
      url: element.dataset.iconUrl || null,
    }).then((dataUrl) => {
      if (!/^data:image\/(png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=]+$/.test(dataUrl)) throw new Error("Invalid game icon response");
      if (gameIconCache.size >= 256) gameIconCache.delete(gameIconCache.keys().next().value!);
      gameIconCache.set(key, dataUrl);
      for (const target of app.querySelectorAll<HTMLElement>("[data-game-icon]")) {
        if (target.dataset.gameIcon === key) target.innerHTML = `<img src="${dataUrl}" alt="" />`;
      }
    }).catch(() => {
      gameIconFailures.add(key);
    }).finally(() => {
      gameIconRequests.delete(key);
      loadGameIcons();
    });
  }
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

function renderNewsTabs(): string {
  const modes = `<section class="news-mode-header"><h1>榜单</h1><div class="news-mode-tabs" role="tablist" aria-label="游戏模式">${Object.entries(NEWS_MODES).map(([mode, name]) => `<button class="news-mode-tab ${newsMode === mode ? "news-mode-tab--active" : ""}" role="tab" aria-selected="${newsMode === mode}" data-news-mode="${mode}">${name}</button>`).join("")}</div></section>`;
  if (newsMode !== "hextech") return modes;
  return `${modes}<div class="news-tabs" aria-label="海克斯大乱斗数据分类"><button class="news-tab ${newsTab === "ranking" ? "news-tab--active" : ""}" data-news-tab="ranking">${icon("swords", 16)}英雄榜</button><button class="news-tab ${newsTab === "champions" ? "news-tab--active" : ""}" data-news-tab="champions">英雄资料</button><button class="news-tab ${newsTab === "augments" ? "news-tab--active" : ""}" data-news-tab="augments">符文资料</button></div>`;
}

function selectNewsMode(mode: string): void {
  if (!Object.hasOwn(NEWS_MODES, mode)) return;
  newsMode = mode as NewsMode;
  newsTab = "ranking";
  newsDetailId = null;
  newsQuery = "";
  championRole = "全部";
  if (!hextech.closeDetail()) render();
  loadNewsRanking();
}

function loadNewsRanking(): void {
  if (newsMode === "hextech") {
    if (newsTab === "ranking") void hextech.loadRanking();
  } else {
    void rankings.load(newsMode);
  }
}

function renderNewsPage(): string {
  if (newsMode !== "hextech") return rankings.renderPage(newsMode, renderNewsTabs());
  if (newsTab === "ranking") return hextech.renderPage(renderNewsTabs());
  const roleOptions: ChampionRole[] = ["全部", "上路", "打野", "中路", "下路", "辅助"];
  const query = newsQuery.trim().toLocaleLowerCase("zh-CN");
  const champions = championStats.filter((champion) => (championRole === "全部" || champion.role === championRole) && (!query || champion.name.toLocaleLowerCase("zh-CN").includes(query)));
  const augments = augmentStats.filter((augment) => !query || augment.name.toLocaleLowerCase("zh-CN").includes(query));
  const availableAugmentRates = augmentStats.flatMap((augment) => augment.pickRate === null ? [] : [augment.pickRate]);
  const detail = newsDetailId === null ? "" : renderNewsDetail();
  const loadingNotice = dashboardLoading
    ? `<div class="profile-notice news-notice" role="status">${icon("loader-circle", 16)}<span>正在读取官方资料和海克斯数据，页面可以先浏览。</span></div>`
    : "";
  return `
    ${renderNewsTabs()}
    <section class="page-head"><div><span class="eyebrow">海克斯大乱斗</span><h2>${newsTab === "champions" ? "英雄资料" : "符文资料"}</h2><p>官方静态资料与可验证的海克斯大乱斗选取率。</p></div><div><div class="data-freshness"><span class="connection-dot ${newsMeta.source === "unavailable" ? "status-error" : "status-ready"}"></span><span>${escapeHtml(newsSourceLabel())}</span></div><button class="secondary-button news-refresh" data-action="news-refresh" ${dashboardLoading ? "disabled" : ""}>${icon("refresh-ccw", 15)}刷新数据</button></div></section>
    ${loadingNotice}
    ${renderNewsWarning()}
    <section class="news-toolbar"><label class="search-box news-search">${icon("search", 15)}<input type="search" maxlength="40" value="${escapeHtml(newsQuery)}" placeholder="搜索${newsTab === "champions" ? "英雄" : "符文"}" aria-label="搜索资讯" data-news-search /></label>${newsTab === "champions" ? `<div class="segmented role-segmented">${roleOptions.map((role) => `<button class="segment ${championRole === role ? "segment--active" : ""}" data-role="${role}">${role}</button>`).join("")}</div>` : `<span class="filter-caption">海克斯大乱斗 · 游戏资源与公开统计</span>`}</section>
    ${newsTab === "champions" ? `<section class="news-summary-row"><article><span>官方英雄资料</span><strong>${championStats.length || "—"}</strong><small>${newsMeta.officialSource || "暂无"}</small></article><article><span>英雄选取率</span><strong>${championStats.filter((item) => item.pickRate !== null).length || "—"}</strong><small>${newsMeta.statsSource ? "第三方有限样本" : "官方未提供"}</small></article><article><span>胜率</span><strong>未提供</strong><small>官方接口未开放</small></article></section><section class="news-table-panel"><div class="news-table news-table--champions"><div class="news-table-head"><span>#</span><span>英雄</span><span>位置</span><span>评级</span><span>胜率</span><span>登场率</span><span>趋势</span><span></span></div>${champions.length ? champions.map((champion, index) => `<div class="news-table-row"><span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="news-champion">${renderChampionIcon(champion.id, champion.name, champion.color)}<strong>${escapeHtml(champion.name)}<small>KDA ${champion.kda === null ? "官方未提供" : champion.kda.toFixed(1)}</small></strong></span><span>${escapeHtml(champion.role)}</span><span class="tier tier--${champion.tier.replace("+", "plus")}">${escapeHtml(champion.tier)}</span><span class="stat-strong">${newsPercent(champion.winRate)}</span><span>${newsPercent(champion.pickRate)}</span><span class="trend trend--${champion.trend}">${champion.trend === "up" ? "↑" : champion.trend === "down" ? "↓" : "—"}</span><button class="icon-button table-arrow" data-news-detail="${champion.id}" aria-label="查看${escapeHtml(champion.name)}详情">${icon("chevron-right", 15)}</button></div>`).join("") : `<div class="empty-state">${icon("search-x", 22)}<span>没有符合条件的英雄</span></div>`}</div></section>` : `<section class="news-summary-row"><article><span>可查海克斯</span><strong>${augmentStats.length || "—"}</strong><small>客户端与官网资源目录</small></article><article><span>最高选取率</span><strong>${newsPercent(availableAugmentRates.length ? Math.max(...availableAugmentRates) : null)}</strong><small>胜率官方未提供</small></article><article><span>组合推荐</span><strong>${augmentCombos.length || "—"}</strong><small>仅展示组合目录</small></article></section><section class="news-table-panel"><div class="news-table news-table--augments"><div class="news-table-head"><span>#</span><span>符文</span><span>评级</span><span>胜率</span><span>选择率</span><span>样本</span><span></span></div>${augments.length ? augments.map((augment, index) => `<div class="news-table-row"><span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="news-champion">${renderGameIcon(augment.name, augment.color, augment.iconPath, augment.iconUrl, "augment")}<strong>${escapeHtml(augment.name)}<small>${escapeHtml(augment.description || "暂无官方描述")}</small></strong></span><span class="tier tier--${augment.tier.replace("+", "plus")}">${escapeHtml(augment.tier)}</span><span class="stat-strong">${newsPercent(augment.winRate)}</span><span>${newsPercent(augment.pickRate)}</span><span>${augment.sampleSize === null ? "未提供" : augment.sampleSize.toLocaleString("zh-CN")}</span><button class="icon-button table-arrow" data-news-detail="${escapeHtml(augment.id)}" aria-label="查看${escapeHtml(augment.name)}详情">${icon("chevron-right", 15)}</button></div>`).join("") : `<div class="empty-state">${icon("search-x", 22)}<span>没有符合条件的符文</span></div>`}</div></section>`}${detail}`;
}

function renderNewsDetail(): string {
  if (newsDetailId === null) return "";
  if (newsTab === "champions") {
    const champion = championStats.find((item) => String(item.id) === newsDetailId);
    if (!champion) return "";
    return `<div class="detail-backdrop" data-action="close-news-detail"><aside class="detail-drawer"><header><div><span class="eyebrow">CHAMPION DETAIL</span><h2>${escapeHtml(champion.name)}</h2></div><button class="icon-button" data-action="close-news-detail" aria-label="关闭详情">${icon("x", 17)}</button></header><div class="detail-hero">${renderChampionIcon(champion.id, champion.name, champion.color, "detail-token")}<div><strong>${escapeHtml(champion.role)} · ${escapeHtml(champion.tier)} 级</strong><p>英雄名称与基础分类来自 Riot Data Dragon。</p></div></div><div class="detail-stat-grid"><div><span>胜率</span><strong>${newsPercent(champion.winRate)}</strong></div><div><span>登场率</span><strong>${newsPercent(champion.pickRate)}</strong></div><div><span>禁用率</span><strong>${newsPercent(champion.banRate)}</strong></div><div><span>KDA</span><strong>${champion.kda === null ? "未提供" : champion.kda.toFixed(1)}</strong></div></div><div class="detail-copy"><span class="eyebrow">海克斯组合</span><h3>只展示可验证的组合目录</h3><p>${renderChampionComboSummary(champion.id)}</p></div><footer>${escapeHtml(newsSourceLabel())}</footer></aside></div>`;
  }
  const augment = augmentStats.find((item) => item.id === newsDetailId);
  if (!augment) return "";
  return `<div class="detail-backdrop" data-action="close-news-detail"><aside class="detail-drawer"><header><div><span class="eyebrow">AUGMENT DETAIL</span><h2>${escapeHtml(augment.name)}</h2></div><button class="icon-button" data-action="close-news-detail" aria-label="关闭详情">${icon("x", 17)}</button></header><div class="detail-hero">${renderGameIcon(augment.name, augment.color, augment.iconPath, augment.iconUrl, "augment", "detail-token")}<div><strong>${escapeHtml(augment.tier)} 级符文</strong><p>${escapeHtml(augment.description || "暂无官方描述")}</p></div></div><div class="detail-stat-grid"><div><span>胜率</span><strong>${newsPercent(augment.winRate)}</strong></div><div><span>选择率</span><strong>${newsPercent(augment.pickRate)}</strong></div><div><span>样本数</span><strong>${augment.sampleSize === null ? "未提供" : augment.sampleSize.toLocaleString("zh-CN")}</strong></div><div><span>模式</span><strong>海克斯大乱斗</strong></div></div><div class="detail-copy"><span class="eyebrow">数据说明</span><h3>选取率来自第三方有限样本</h3><p>Riot 官方公开接口未提供海克斯胜率，应用不会从选取率推导胜率。</p></div><footer>${escapeHtml(newsSourceLabel())}</footer></aside></div>`;
}

function autoAcceptDelaySelect(): string {
  return `<select class="auto-accept-delay" data-auto-accept-delay aria-label="自动接受等待时间" ${!autoAcceptReady || autoAcceptSaving ? "disabled" : ""}>${[0, 1, 2, 3, 4, 5].map((seconds) => `<option value="${seconds}" ${autoAcceptDelaySeconds === seconds ? "selected" : ""}>${seconds} 秒</option>`).join("")}</select>`;
}

function preferenceRow(key: string, title: string, checked: boolean): string {
  return `<label class="preference-row"><span><strong>${title}</strong></span><input class="switch-input" type="checkbox" data-pref="${key}" ${checked ? "checked" : ""} ${key === "autoAccept" && (!autoAcceptReady || autoAcceptSaving) ? "disabled" : ""} /><span class="switch-track" aria-hidden="true"></span></label>`;
}

function mergedAutomationLogs(): AssistantLog[] {
  return [...assistantLogs, ...autoSelectLogs, ...autoGameflowLogs].slice(0, 60);
}

function activeChampionCatalog(): ChampionCatalogItem[] {
  if (championCatalog.length > 10) return championCatalog;
  if (championStats.length > 0) {
    return championStats.map((c) => ({ id: c.id, name: c.name }));
  }
  return championCatalog;
}

function renderAutomationPage(): string {
  return renderAutomationView({
    subTab: automationSubTab,
    autoAccept,
    autoSkin,
    autoPopupCompanion,
    companionAlwaysOnTop,
    autoSelect: autoSelectConfig,
    autoSelectPaused,
    autoGameflow: autoGameflowConfig,
    pickPosition: autoSelectPickPos,
    banPosition: autoSelectBanPos,
    champions: activeChampionCatalog(),
    logs: mergedAutomationLogs(),
    preferenceRow,
    autoAcceptDelaySelect,
    escape: escapeHtml,
  });
}

function renderToolkitPage(): string {
  return renderToolkitView({
    isTauri,
    connected: snapshot.connection === "ready",
    phaseLabel: phaseLabel(),
    runtimeStatus,
    toolkitBusy,
    escape: escapeHtml,
  });
}

function renderSettingsPage(): string {
  return renderSettingsView({
    themeMode,
    accentColor,
    compactMode,
    animationsEnabled,
    autoPopupCompanion,
    companionAlwaysOnTop,
    autoAccept,
    autoSkin,
    notifyEnabled,
    launchAtStartup,
    preferenceRow,
    autoAcceptDelaySelect,
    escape: escapeHtml,
    icon,
  });
}

function renderAppShell(content: string): string {
  const connection = `<span class="shell-connection ${snapshot.connection === "ready" ? "status-ready" : "status-offline"}" title="${escapeHtml(connectionTitle())}"><span class="connection-dot"></span>${!isTauri ? "演示" : escapeHtml(connectionLabel())}</span>`;
  return renderShell({ route: currentRoute, content, windowActions: renderWindowActions(), connection, connected: isTauri && snapshot.connection === "ready", themeMode, icon })
    + renderSettingsDialog()
    + `<div id="toast" class="toast ${toastMessage ? "toast--visible" : ""}" data-kind="${toastKind}" aria-live="polite">${toastMessage ? escapeHtml(toastMessage) : ""}</div>`;
}

function renderCompanionWindow(): void {
  const previousBody = app.querySelector<HTMLElement>(".companion-body");
  const bodyScrollTop = previousBody?.scrollTop ?? 0;
  const restoreSearchFocus = document.activeElement instanceof HTMLInputElement
    && document.activeElement.matches("[data-search]");
  const html = renderCompanionShell({
    isTauri,
    tab: companionTab,
    pinned: companionAlwaysOnTop,
    snapshot,
    selectedSkinId,
    busy,
    activeFilter,
    searchQuery,
    favoriteSkinIds,
    autoAccept,
    autoAcceptDelaySeconds,
    autoAcceptReady,
    autoAcceptSaving,
    buildHeroId: companionBuildHeroId ?? snapshot.championId,
    buildDetail: companionBuildDetail,
    buildLoading: companionBuildLoading,
    buildError: companionBuildError,
    ongoingGame,
    ongoingLoading,
    ongoingError,
    sendingChat,
    quickTagPuuid,
    autoSelectActive: autoSelectConfig.pickEnabled || autoSelectConfig.banEnabled || autoSelectConfig.benchEnabled,
    autoSelectPaused,
    benchBusy,
    benchPriorityIds: autoSelectConfig.benchChampions,
    championNameById: (id) => activeChampionCatalog().find((c) => c.id === id)?.name ?? `英雄 #${id}`,
    escape: escapeHtml,
    icon,
    skinImage,
    gameIcon: renderGameIcon,
    canApply: canApplySkinImmediately,
    phaseLabel,
    blockReason: writeBlockLabel,
    filteredSkins,
  }) + `<div id="toast" class="toast ${toastMessage ? "toast--visible" : ""}" data-kind="${toastKind}" aria-live="polite">${toastMessage ? escapeHtml(toastMessage) : ""}</div>`;
  app.innerHTML = html;
  const currentBody = app.querySelector<HTMLElement>(".companion-body");
  if (currentBody && bodyScrollTop > 0) currentBody.scrollTop = bodyScrollTop;
  wireEvents();
  refreshIcons();
  if (restoreSearchFocus) {
    const input = app.querySelector<HTMLInputElement>("[data-search]");
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(input.value.length, input.value.length);
  }
  if (companionTab === "skin") void loadSkinImages();
  loadGameIcons();
}

function renderDashboardShell(): void {
  const content = currentRoute === "profile"
    ? renderProfilePage()
    : currentRoute === "news"
      ? renderNewsPage()
      : currentRoute === "automation"
        ? renderAutomationPage()
        : currentRoute === "toolkit"
          ? renderToolkitPage()
          : renderSettingsPage();
  app.innerHTML = renderAppShell(content);
  wireEvents();
  applyAppearance();
  refreshIcons();
}

function render(): void {
  if (isCompanionWindow) {
    applyAppearance();
    renderCompanionWindow();
    return;
  }
  const previousHex = app.querySelector<HTMLElement>(".hex-detail");
  const hexScroll = previousHex?.scrollTop ?? 0;
  const hexInput = app.querySelector<HTMLInputElement>("[data-hex-search]:focus, [data-hex-rune-search]:focus, [data-ranking-search]:focus");
  const hexInputSelector = hexInput ? (hexInput.dataset.rankingSearch !== undefined ? "[data-ranking-search]" : hexInput.dataset.hexRuneSearch !== undefined ? "[data-hex-rune-search]" : "[data-hex-search]") : null;
  const hexCursor = hexInput?.selectionStart ?? null;
  const previousContent = app.querySelector<HTMLElement>(".main-content");
  const scrollTop = previousContent?.scrollTop ?? 0;
  const catalogScrollLeft = app.querySelector<HTMLElement>(".skin-grid")?.scrollLeft ?? 0;
  const previousPage = previousContent?.dataset.page;
  const restoreContentFocus = previousContent === document.activeElement;
  applyAppearance();
  if (currentRoute === "assistant") renderSkinWorkspace();
  else renderDashboardShell();
  if (previousPage === currentRoute) {
    const catalog = app.querySelector<HTMLElement>(".skin-grid");
    if (catalog) catalog.scrollLeft = catalogScrollLeft;
    const content = app.querySelector<HTMLElement>(".main-content");
    if (content) {
      content.scrollTop = scrollTop;
      if (restoreContentFocus) content.focus({ preventScroll: true });
    }
  }
  hextech.bind(app);
  rankings.bind(app);
  const currentHex = app.querySelector<HTMLElement>(".hex-detail");
  if (currentHex) {
    currentHex.scrollTop = hexScroll;
    if (!previousHex) currentHex.querySelector<HTMLElement>("[data-hex-close]")?.focus({ preventScroll: true });
  }
  if (hexInputSelector) {
    const input = app.querySelector<HTMLInputElement>(hexInputSelector);
    input?.focus({ preventScroll: true });
    if (hexCursor !== null) input?.setSelectionRange(hexCursor, hexCursor);
  }
  loadGameIcons();
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
  const cards = [...document.querySelectorAll<HTMLElement>("[data-skin-id]")];
  const visibleSkinIds = new Set(
    cards
      .filter((card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0
          && bounds.top < window.innerHeight + 360 && bounds.bottom > -360
          && bounds.left < window.innerWidth + 360 && bounds.right > -360;
      })
      .map((card) => Number(card.dataset.skinId)),
  );
  const list = filteredSkins();
  const targetSkins = visibleSkinIds.size > 0
    ? list.filter((item) => visibleSkinIds.has(item.id))
    : list.slice(0, 8);
  for (const skin of targetSkins) {
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
    showToast(!isTauri ? "演示：已应用所选皮肤" : elapsedMs === undefined ? "皮肤已应用，客户端已确认" : `皮肤已应用，客户端已确认（${elapsedMs}ms）`);
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

async function benchSwapChampion(championId: number): Promise<void> {
  if (benchBusy || !Number.isInteger(championId) || championId <= 0) return;
  const name = activeChampionCatalog().find((c) => c.id === championId)?.name ?? `英雄 #${championId}`;
  if (!isTauri) {
    showToast(`演示：已抢入 ${name}`);
    return;
  }
  benchBusy = true;
  render();
  try {
    await invokeCommand("bench_swap_champion", { championId });
    showToast(`已换入 ${name}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  } finally {
    benchBusy = false;
    render();
  }
}

async function benchReroll(grabBack: boolean): Promise<void> {
  if (benchBusy) return;
  if (!isTauri) {
    showToast(grabBack ? "演示：已重随并抢回原英雄" : "演示：已重随英雄");
    return;
  }
  benchBusy = true;
  render();
  try {
    await invokeCommand("bench_reroll", { grabBack });
    showToast(grabBack ? "已重随并抢回原英雄" : "已重随英雄");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  } finally {
    benchBusy = false;
    render();
  }
}

async function toggleBenchPriorityChampion(championId: number): Promise<void> {
  if (!Number.isInteger(championId) || championId <= 0) return;
  const next = structuredClone(autoSelectConfig);
  const exists = next.benchChampions.includes(championId);
  next.benchChampions = exists
    ? next.benchChampions.filter((id) => id !== championId)
    : [...next.benchChampions, championId];
  await saveAutoSelectConfig(next);
  const name = activeChampionCatalog().find((c) => c.id === championId)?.name ?? `#${championId}`;
  showToast(exists ? `已从自动秒抢移除 ${name}` : `已加入自动秒抢：${name}`);
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
  gameIconCache.clear();
  gameIconFailures.clear();
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
      if (!skin) return;
      selectedSkinId = id;
      if (canApplySkinImmediately(skin)) {
        previewOnlySelectionId = null;
        void applySkin(skin.id);
        return;
      }
      previewOnlySelectionId = skin.id === snapshot.selectedSkinId ? null : id;
      render();
    }
  }));
  app.querySelectorAll<HTMLElement>("[data-favorite-id]").forEach((element) => element.addEventListener("click", () => {
    const id = Number(element.dataset.favoriteId);
    if (!Number.isNaN(id)) toggleFavorite(id);
  }));
  app.querySelectorAll<HTMLElement>("[data-bench-swap]").forEach((element) => {
    element.addEventListener("click", () => {
      const cid = Number(element.dataset.benchSwap);
      if (Number.isInteger(cid) && cid > 0) void benchSwapChampion(cid);
    });
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const cid = Number(element.dataset.benchSwap);
      if (Number.isInteger(cid) && cid > 0) void toggleBenchPriorityChampion(cid);
    });
  });
  app.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((element) => element.addEventListener("change", () => {
    if (element.dataset.setting === "launch-at-startup") void updateLaunchAtStartup(element.checked);
  }));
  app.querySelectorAll<HTMLElement>("[data-route]").forEach((element) => element.addEventListener("click", () => {
    const route = element.dataset.route;
    if (!route || !isAppRoute(route)) return;
    currentRoute = route;
    if (route === "news") loadNewsRanking();
    if (route === "toolkit") void hydrateRuntimeStatus();
    window.history.replaceState(null, "", `#${route}`);
    settingsOpen = false;
    render();
    refreshProfileIfNeeded();
  }));
  app.querySelectorAll<HTMLElement>("[data-news-mode]").forEach((element) => element.addEventListener("click", () => {
    selectNewsMode(element.dataset.newsMode ?? "");
  }));
  app.querySelectorAll<HTMLElement>("[data-news-tab]").forEach((element) => element.addEventListener("click", () => {
    const tab = element.dataset.newsTab;
    if (newsMode !== "hextech" || (tab !== "ranking" && tab !== "champions" && tab !== "augments")) return;
    newsTab = tab;
    newsDetailId = null;
    newsQuery = "";
    if (tab === "ranking") void hextech.loadRanking();
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
  app.querySelector<HTMLSelectElement>("[data-auto-accept-delay]")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    void updateAutoAcceptDelay(Number(select.value));
  });
  app.querySelectorAll<HTMLInputElement>("[data-pref]").forEach((element) => element.addEventListener("change", (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const key = input.dataset.pref;
    if (key === "autoAccept") {
      void updateAutoAccept(input.checked);
      return;
    }
    if (key === "autoPopupCompanion") {
      void updateAutoPopupCompanion(input.checked);
      showToast(input.checked ? "选人时将自动弹出独立小窗" : "已关闭选人自动弹窗");
      return;
    }
    if (key === "companionPin") {
      void updateCompanionPin(input.checked);
      showToast(input.checked ? "伴随小窗将悬浮显示" : "已关闭伴随小窗悬浮显示");
      return;
    }
    if (key === "autoSkin") autoSkin = input.checked;
    if (key === "notify") notifyEnabled = input.checked;
    if (key === "launchAtStartup") void updateLaunchAtStartup(input.checked);
    if (key === "compact") compactMode = input.checked;
    if (key === "animations") animationsEnabled = input.checked;
    persistAppPreferences();
    broadcastAppearance();
    render();
    showToast(input.checked ? "偏好已开启" : "偏好已关闭");
  }));
  app.querySelectorAll<HTMLElement>("[data-theme]").forEach((element) => element.addEventListener("click", () => {
    const mode = element.dataset.theme;
    if (mode !== "system" && mode !== "dark" && mode !== "light") return;
    themeMode = mode;
    persistAppPreferences();
    broadcastAppearance();
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-accent]").forEach((element) => element.addEventListener("click", () => {
    const color = element.dataset.accent;
    if (!color) return;
    accentColor = color;
    persistAppPreferences();
    broadcastAppearance();
    render();
  }));
  app.querySelector<HTMLInputElement>("[data-custom-accent]")?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !isHexColor(input.value)) return;
    accentColor = input.value.toLowerCase();
    persistAppPreferences();
    applyAppearance();
    broadcastAppearance();
    const label = input.parentElement?.querySelector("span");
    if (label) label.textContent = accentColor.toUpperCase();
    input.parentElement?.classList.add("is-active");
    app.querySelectorAll(".accent-swatch--active").forEach((sw) => sw.classList.remove("accent-swatch--active"));
  });
  app.querySelectorAll<HTMLElement>("[data-profile-mode]").forEach((element) => element.addEventListener("click", () => {
    const mode = element.dataset.profileMode;
    if (mode !== "all" && mode !== "排位赛" && mode !== "极地大乱斗") return;
    profileModeFilter = mode;
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-profile-match]").forEach((element) => element.addEventListener("click", () => {
    const id = element.dataset.profileMatch;
    if (!id) return;
    profileExpandedMatchId = profileExpandedMatchId === id ? null : id;
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-profile-trend]").forEach((element) => element.addEventListener("click", () => {
    const metric = element.dataset.profileTrend;
    if (metric !== "winRate" && metric !== "kda") return;
    profileTrendMetric = metric;
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-companion-tab]").forEach((element) => element.addEventListener("click", () => {
    const tab = element.dataset.companionTab;
    if (tab !== "skin" && tab !== "build" && tab !== "ongoing") return;
    companionTab = tab;
    if (tab === "build") {
      void loadCompanionBuild(companionBuildHeroId ?? snapshot.championId);
    }
    if (tab === "ongoing") {
      void loadCompanionOngoing();
    }
    render();
  }));
  app.querySelector<HTMLFormElement>("[data-player-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void searchAndOpenPlayer(playerSearchQuery);
  });
  app.querySelector<HTMLInputElement>("[data-player-search]")?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) playerSearchQuery = input.value;
  });
  app.querySelectorAll<HTMLElement>("[data-player-tab]").forEach((element) => element.addEventListener("click", () => {
    const tabId = element.dataset.playerTab;
    if (!tabId) return;
    activePlayerTab = tabId;
    const found = openPlayerTabs.find((t) => t.puuid === tabId);
    tagDraft = found?.detail?.saved?.tag ?? "";
    noteDraft = found?.detail?.saved?.note ?? "";
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-close-player-tab]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.closePlayerTab;
    if (puuid) closePlayerTab(puuid);
  }));
  app.querySelectorAll<HTMLElement>("[data-player-refresh]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.playerRefresh;
    if (!puuid) return;
    const tab = openPlayerTabs.find((t) => t.puuid === puuid);
    void openPlayerTab(puuid, tab?.label ?? puuid.slice(0, 8), true);
  }));
  app.querySelectorAll<HTMLElement>("[data-match-detail]").forEach((element) => element.addEventListener("click", () => {
    const gid = Number(element.dataset.matchDetail);
    if (Number.isInteger(gid) && gid > 0) void openMatchDetail(gid);
  }));
  app.querySelectorAll<HTMLElement>("[data-open-player-puuid]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.openPlayerPuuid;
    const name = element.dataset.openPlayerName ?? "";
    if (!puuid) return;
    matchDetailOpen = false;
    savedPlayersOpen = false;
    void openPlayerTab(puuid, name || puuid.slice(0, 8));
  }));
  app.querySelectorAll<HTMLElement>("[data-select-tag-preset]").forEach((element) => element.addEventListener("click", () => {
    const preset = element.dataset.selectTagPreset;
    if (!preset) return;
    tagDraft = tagDraft === preset ? "" : preset;
    render();
  }));
  app.querySelector<HTMLInputElement>("[data-player-note-input]")?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) noteDraft = input.value;
  });
  app.querySelectorAll<HTMLElement>("[data-save-player-tag]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.savePlayerTag;
    if (!puuid) return;
    const tab = openPlayerTabs.find((t) => t.puuid === puuid);
    const chosenTag = tagDraft || tab?.detail?.saved?.tag || "已标记";
    void savePlayerTag(puuid, chosenTag, noteDraft);
  }));
  app.querySelectorAll<HTMLElement>("[data-delete-player-tag]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.deletePlayerTag;
    if (puuid) void deletePlayerTag(puuid);
  }));
  app.querySelectorAll<HTMLElement>("[data-quick-tag-toggle]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.quickTagToggle;
    if (!puuid) return;
    quickTagPuuid = quickTagPuuid === puuid ? null : puuid;
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-quick-tag-set]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.quickTagSet;
    const tagValue = element.dataset.tagValue ?? "";
    if (!puuid || !tagValue) return;
    quickTagPuuid = null;
    void savePlayerTag(puuid, tagValue, "");
  }));
  app.querySelectorAll<HTMLElement>("[data-quick-tag-clear]").forEach((element) => element.addEventListener("click", () => {
    const puuid = element.dataset.quickTagClear;
    if (!puuid) return;
    quickTagPuuid = null;
    void deletePlayerTag(puuid);
  }));
  app.querySelectorAll<HTMLElement>("[data-auto-tab]").forEach((element) => element.addEventListener("click", () => {
    const tab = element.dataset.autoTab;
    if (tab !== "flow" && tab !== "select" && tab !== "logs") return;
    automationSubTab = tab;
    if (tab === "select") void hydrateChampionCatalog();
    render();
  }));
  app.querySelectorAll<HTMLElement>("[data-as-pos-kind]").forEach((element) => element.addEventListener("click", () => {
    const kind = element.dataset.asPosKind;
    const pos = element.dataset.asPos as PositionKey | undefined;
    if (!pos || !["default", "top", "jungle", "middle", "bottom", "utility"].includes(pos)) return;
    if (kind === "pick") autoSelectPickPos = pos;
    if (kind === "ban") autoSelectBanPos = pos;
    render();
  }));
  app.querySelectorAll<HTMLInputElement>("[data-as-bool]").forEach((element) => element.addEventListener("change", () => {
    const key = element.dataset.asBool as keyof AutoSelectConfig | undefined;
    if (!key) return;
    void saveAutoSelectConfig({ ...autoSelectConfig, [key]: element.checked });
  }));
  app.querySelectorAll<HTMLSelectElement>("[data-as-select]").forEach((element) => element.addEventListener("change", () => {
    const key = element.dataset.asSelect as "pickStrategy" | "banStrategy" | undefined;
    if (!key) return;
    void saveAutoSelectConfig({ ...autoSelectConfig, [key]: element.value as AutoSelectStrategy });
  }));
  app.querySelectorAll<HTMLSelectElement>("[data-as-num]").forEach((element) => element.addEventListener("change", () => {
    const key = element.dataset.asNum as "pickDelaySeconds" | "banDelaySeconds" | "benchDelaySeconds" | undefined;
    if (!key) return;
    void saveAutoSelectConfig({ ...autoSelectConfig, [key]: Number(element.value) });
  }));
  app.querySelectorAll<HTMLSelectElement>("[data-as-add-select]").forEach((element) => element.addEventListener("change", () => {
    const kind = element.dataset.asAddSelect;
    const champId = Number(element.value);
    if (!Number.isInteger(champId) || champId <= 0) return;
    const next = structuredClone(autoSelectConfig);
    if (kind === "pick") {
      if (!next.pickChampions[autoSelectPickPos].includes(champId)) next.pickChampions[autoSelectPickPos].push(champId);
    } else if (kind === "ban") {
      if (!next.banChampions[autoSelectBanPos].includes(champId)) next.banChampions[autoSelectBanPos].push(champId);
    } else if (kind === "bench") {
      if (!next.benchChampions.includes(champId)) next.benchChampions.push(champId);
    }
    void saveAutoSelectConfig(next);
  }));
  app.querySelectorAll<HTMLElement>("[data-as-remove-kind]").forEach((element) => element.addEventListener("click", () => {
    const kind = element.dataset.asRemoveKind;
    const champId = Number(element.dataset.asRemoveId);
    if (!Number.isInteger(champId)) return;
    const next = structuredClone(autoSelectConfig);
    if (kind === "pick") {
      next.pickChampions[autoSelectPickPos] = next.pickChampions[autoSelectPickPos].filter((id) => id !== champId);
    } else if (kind === "ban") {
      next.banChampions[autoSelectBanPos] = next.banChampions[autoSelectBanPos].filter((id) => id !== champId);
    } else if (kind === "bench") {
      next.benchChampions = next.benchChampions.filter((id) => id !== champId);
    }
    void saveAutoSelectConfig(next);
  }));
  app.querySelectorAll<HTMLInputElement>("[data-gf-bool]").forEach((element) => element.addEventListener("change", () => {
    const key = element.dataset.gfBool as keyof AutoGameflowConfig | undefined;
    if (!key) return;
    void saveAutoGameflowConfig({ ...autoGameflowConfig, [key]: element.checked });
  }));
  app.querySelectorAll<HTMLSelectElement>("[data-gf-select]").forEach((element) => element.addEventListener("change", () => {
    const key = element.dataset.gfSelect as "autoHonorStrategy" | "autoInvitationMode" | undefined;
    if (!key) return;
    void saveAutoGameflowConfig({ ...autoGameflowConfig, [key]: element.value } as AutoGameflowConfig);
  }));
  app.querySelectorAll<HTMLSelectElement>("[data-gf-num]").forEach((element) => element.addEventListener("change", () => {
    const key = element.dataset.gfNum as "autoMatchmakingDelaySeconds" | "autoMatchmakingMinMembers" | undefined;
    if (!key) return;
    void saveAutoGameflowConfig({ ...autoGameflowConfig, [key]: Number(element.value) });
  }));
  app.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => element.addEventListener("click", (event) => {
    const action = element.dataset.action;
    if (action === "close-settings" && element.classList.contains("modal-backdrop") && event.target !== element) return;
    if (action === "apply" && selectedSkinId !== null) {
      const skin = snapshot.skins.find((candidate) => candidate.id === selectedSkinId);
      if (skin && canApplySkinImmediately(skin)) void applySkin(skin.id);
    }
    if (action === "random") void applyRandom();
    if (action === "minimize" || action === "maximize" || action === "close") void runWindowAction(action);
    if (action === "refresh") void reconnectClient();
    if (action === "toolkit-restart-ux") void runToolkitAction("toolkit_restart_ux", "已请求重启客户端界面");
    if (action === "toolkit-play-again") void runToolkitAction("toolkit_play_again", "已请求返回房间");
    if (action === "toolkit-leave-lobby") void runToolkitAction("toolkit_leave_lobby", "已退出当前房间");
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
    if (action === "open-companion") void openCompanionWindow("skin");
    if (action === "close-companion") void closeCompanionWindow();
    if (action === "show-main-window") void showMainWindow();
    if (action === "toggle-companion-pin") void updateCompanionPin(!companionAlwaysOnTop);
    if (action === "companion-build-refresh") void loadCompanionBuild(companionBuildHeroId ?? snapshot.championId, true);
    if (action === "companion-ongoing-refresh") void loadCompanionOngoing(true);
    if (action === "companion-send-chat") void sendOngoingToChampSelectChat();
    if (action === "toggle-auto-select-pause") void toggleAutoSelectPause();
    if (action === "bench-reroll") void benchReroll(false);
    if (action === "bench-reroll-grab") void benchReroll(true);
    if (action === "open-saved-players") {
      savedPlayersOpen = true;
      void hydrateSavedPlayers();
      render();
    }
    if (action === "close-saved-players") {
      if (element.classList.contains("detail-backdrop") && event.target !== element) return;
      savedPlayersOpen = false;
      render();
    }
    if (action === "close-match-detail") {
      if (element.classList.contains("detail-backdrop") && event.target !== element) return;
      matchDetailOpen = false;
      render();
    }
    if (action === "cycle-theme") {
      themeMode = themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system";
      persistAppPreferences();
      broadcastAppearance();
      render();
      showToast(themeMode === "system" ? "已切换为自动跟随系统主题" : themeMode === "light" ? "已切换为浅色模式" : "已切换为深色模式");
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
      autoPopupCompanion = DEFAULT_PREFERENCES.autoPopupCompanion;
      companionAlwaysOnTop = DEFAULT_PREFERENCES.companionAlwaysOnTop;
      void updateAutoAccept(DEFAULT_PREFERENCES.autoAccept, DEFAULT_PREFERENCES.autoAcceptDelaySeconds);
      void updateAutoPopupCompanion(autoPopupCompanion);
      void updateCompanionPin(companionAlwaysOnTop);
      autoSkin = DEFAULT_PREFERENCES.autoSkin;
      notifyEnabled = DEFAULT_PREFERENCES.notify;
      persistAppPreferences();
      broadcastAppearance();
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

async function hydrateRuntimeStatus(): Promise<void> {
  if (!isTauri) return;
  try {
    const next = await invokeCommand<RuntimeStatus>("get_runtime_status", {});
    if (next && typeof next === "object" && typeof next.wsConnected === "boolean") {
      runtimeStatus = next;
      if (currentRoute === "toolkit") render();
    }
  } catch {
    // Non-critical diagnostic status.
  }
}

async function runToolkitAction(
  command: "toolkit_restart_ux" | "toolkit_play_again" | "toolkit_leave_lobby",
  successMessage: string,
): Promise<void> {
  if (toolkitBusy) return;
  if (!isTauri) {
    showToast(`演示：${successMessage}`);
    return;
  }
  toolkitBusy = true;
  render();
  try {
    await invokeCommand(command, {});
    showToast(successMessage);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  } finally {
    toolkitBusy = false;
    render();
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

function receiveAutomation(next: AutomationSnapshot): void {
  if (!next || typeof next.autoAccept !== "boolean" || typeof next.configured !== "boolean"
    || !Number.isInteger(next.autoAcceptDelaySeconds) || next.autoAcceptDelaySeconds < 0 || next.autoAcceptDelaySeconds > 5
    || !Number.isSafeInteger(next.revision) || !Array.isArray(next.logs)) {
    throw new Error("自动接受设置格式不兼容，请重启应用");
  }
  if (next.revision < automationRevision) return;
  automationRevision = next.revision;
  autoAccept = next.autoAccept;
  autoAcceptDelaySeconds = next.autoAcceptDelaySeconds;
  autoAcceptReady = true;
  assistantLogs = next.logs.map((log) => ({ ...log, time: formatTime(log.timestampMs) }));
  persistAppPreferences();
  render();
}

async function hydrateAutomation(): Promise<void> {
  const legacyEnabled = autoAccept;
  try {
    let state = await invokeCommand<AutomationSnapshot>("get_automation_state", {});
    // Migrate the old frontend-only switch once; the persisted Rust setting
    // becomes authoritative on subsequent loads, including tray operation.
    if (state && state.configured === false) {
      state = await invokeCommand<AutomationSnapshot>("set_auto_accept", { enabled: legacyEnabled });
    }
    receiveAutomation(state);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "读取自动接受设置失败，请重启应用", "error");
  }
}

function receiveAutoSelect(next: AutoSelectSnapshot): void {
  if (!next || typeof next !== "object" || !next.config || typeof next.revision !== "number") return;
  if (next.revision < autoSelectRevision) return;
  autoSelectRevision = next.revision;
  autoSelectConfig = next.config;
  autoSelectPaused = Boolean(next.pausedThisGame);
  autoSelectLogs = Array.isArray(next.logs) ? next.logs.map((l) => ({ ...l, time: formatTime(l.timestampMs) })) : [];
  render();
}

function receiveAutoGameflow(next: AutoGameflowSnapshot): void {
  if (!next || typeof next !== "object" || !next.config || typeof next.revision !== "number") return;
  if (next.revision < autoGameflowRevision) return;
  autoGameflowRevision = next.revision;
  autoGameflowConfig = next.config;
  autoGameflowLogs = Array.isArray(next.logs) ? next.logs.map((l) => ({ ...l, time: formatTime(l.timestampMs) })) : [];
  render();
}

async function hydrateAutoSelect(): Promise<void> {
  if (!isTauri) return;
  try {
    receiveAutoSelect(await invokeCommand<AutoSelectSnapshot>("get_auto_select_state", {}));
  } catch {
    // Non-critical startup hydration.
  }
}

async function hydrateAutoGameflow(): Promise<void> {
  if (!isTauri) return;
  try {
    receiveAutoGameflow(await invokeCommand<AutoGameflowSnapshot>("get_auto_gameflow_state", {}));
  } catch {
    // Non-critical startup hydration.
  }
}

async function hydrateChampionCatalog(): Promise<void> {
  if (!isTauri || championCatalog.length > 20) return;
  try {
    const items = await invokeCommand<ChampionCatalogItem[]>("get_champion_catalog", {});
    if (Array.isArray(items) && items.length > 0) {
      championCatalog = items;
      render();
    }
  } catch {
    // Fallback list remains usable.
  }
}

async function saveAutoSelectConfig(next: AutoSelectConfig): Promise<void> {
  if (!isTauri) {
    autoSelectConfig = next;
    render();
    return;
  }
  try {
    receiveAutoSelect(await invokeCommand<AutoSelectSnapshot>("set_auto_select_config", { config: next }));
    showToast("自动选禁设置已保存");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
    render();
  }
}

async function toggleAutoSelectPause(): Promise<void> {
  const nextPaused = !autoSelectPaused;
  if (!isTauri) {
    autoSelectPaused = nextPaused;
    render();
    showToast(nextPaused ? "演示：已暂停本局自动选禁" : "演示：已恢复本局自动选禁");
    return;
  }
  try {
    receiveAutoSelect(await invokeCommand<AutoSelectSnapshot>("set_auto_select_paused", { paused: nextPaused }));
    showToast(nextPaused ? "已暂停本局自动选禁" : "已恢复本局自动选禁");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
  }
}

async function saveAutoGameflowConfig(next: AutoGameflowConfig): Promise<void> {
  if (!isTauri) {
    autoGameflowConfig = next;
    render();
    return;
  }
  try {
    receiveAutoGameflow(await invokeCommand<AutoGameflowSnapshot>("set_auto_gameflow_config", { config: next }));
    showToast("流程自动化设置已保存");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error");
    render();
  }
}

async function updateAutoAcceptDelay(seconds: number): Promise<void> {
  await updateAutoAccept(autoAccept, seconds);
}

async function updateAutoAccept(enabled: boolean, delaySeconds?: number): Promise<void> {
  if (delaySeconds !== undefined && (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 5)) {
    showToast("等待时间请选择 0–5 秒的整数", "error");
    render();
    return;
  }
  if (!autoAcceptReady || autoAcceptSaving) return;
  if (!isTauri) {
    autoAccept = enabled;
    if (delaySeconds !== undefined) autoAcceptDelaySeconds = delaySeconds;
    persistAppPreferences();
    render();
    showToast("演示模式：仅预览自动接受设置");
    return;
  }
  autoAcceptSaving = true;
  render();
  try {
    receiveAutomation(await invokeCommand<AutomationSnapshot>("set_auto_accept", { enabled, ...(delaySeconds === undefined ? {} : { delaySeconds }) }));
    showToast(delaySeconds !== undefined ? `等待时间已保存：${delaySeconds} 秒${enabled ? "，后台持续生效" : "，开启自动接受后生效"}` : enabled ? "自动接受对局已开启，后台持续生效" : "自动接受对局已关闭");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "保存自动接受设置失败", "error");
  } finally {
    autoAcceptSaving = false;
    render();
  }
}

function receiveSnapshot(next: Snapshot): void {
  if (next.revision < snapshot.revision) return;
  const previous = snapshot;
  if (next.connection !== snapshot.connection) {
    gameIconFailures.clear();
    if (!isCompanionWindow && currentRoute === "toolkit") void hydrateRuntimeStatus();
  }
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
  if (isCompanionWindow) {
    if (snapshot.championId && snapshot.championId !== companionBuildHeroId) {
      companionBuildHeroId = snapshot.championId;
      if (companionTab === "build") void loadCompanionBuild(snapshot.championId);
    }
    if (companionTab === "ongoing" && (snapshot.phase !== previous.phase || snapshot.contextId !== previous.contextId)) {
      void loadCompanionOngoing(true);
    }
  } else if (snapshot.connection !== "ready") {
    clearProfileData();
  } else if (previous.connection !== "ready" || (previous.phase !== snapshot.phase
    && ["PreEndOfGame", "EndOfGame"].includes(snapshot.phase))) {
    void hydrateProfileData();
  }
  render();
}

async function bootstrap(): Promise<void> {
  loadLocalPreferences();
  cleanupSystemTheme = watchSystemTheme(() => {
    if (themeMode === "system") applyAppearance();
  });
  const urlHeroId = Number(urlParams.get("heroId"));
  if (isCompanionWindow && Number.isInteger(urlHeroId) && urlHeroId > 0) {
    companionBuildHeroId = urlHeroId;
  }
  render();
  if (isCompanionWindow && companionTab === "build") {
    void loadCompanionBuild(companionBuildHeroId ?? snapshot.championId);
  }
  if (isCompanionWindow && companionTab === "ongoing") {
    void loadCompanionOngoing();
  }
  if (!isCompanionWindow) {
    void hydrateDashboardData();
    if (currentRoute === "news") loadNewsRanking();
  }
  if (!isTauri) {
    if (!isCompanionWindow) void hydrateProfileData();
    return;
  }
  if (!isCompanionWindow) {
    void hydrateNativePreferences();
    void invokeCommand("set_auto_popup_companion", { enabled: autoPopupCompanion }).catch(() => {});
    void invokeCommand("set_companion_pin", { enabled: companionAlwaysOnTop }).catch(() => {});
    try {
      cleanupWindowResize = await getCurrentWindow().onResized(() => { void syncWindowMaximized(); });
      await syncWindowMaximized();
    } catch (error) {
      console.error("Failed to listen for window resize", error);
    }
  }
  try {
    cleanupAppearanceListener = await listen<Partial<AppPreferences>>("appearance-changed", (event) => {
      const next = event.payload;
      if (!next) return;
      if (next.themeMode === "system" || next.themeMode === "dark" || next.themeMode === "light") themeMode = next.themeMode;
      if (typeof next.accentColor === "string") accentColor = next.accentColor;
      if (typeof next.compactMode === "boolean") compactMode = next.compactMode;
      if (typeof next.animations === "boolean") animationsEnabled = next.animations;
      render();
    });
    if (isCompanionWindow) {
      cleanupCompanionNavListener = await listen<{ tab?: string | null; heroId?: number | null }>("companion-navigate", (event) => {
        const payload = event.payload;
        if (payload?.tab === "skin" || payload?.tab === "build" || payload?.tab === "ongoing") companionTab = payload.tab;
        if (typeof payload?.heroId === "number" && payload.heroId > 0) {
          void loadCompanionBuild(payload.heroId);
        } else if (companionTab === "build") {
          void loadCompanionBuild(snapshot.championId);
        } else if (companionTab === "ongoing") {
          void loadCompanionOngoing(true);
        }
        render();
      });
    }
    // Listen first so a connection established during startup cannot be missed.
    cleanupAutomationListener = await listen<AutomationSnapshot>("automation-changed", (event: { payload: AutomationSnapshot }) => receiveAutomation(event.payload));
    cleanupAutoSelectListener = await listen<AutoSelectSnapshot>("auto-select-changed", (event: { payload: AutoSelectSnapshot }) => receiveAutoSelect(event.payload));
    cleanupAutoGameflowListener = await listen<AutoGameflowSnapshot>("auto-gameflow-changed", (event: { payload: AutoGameflowSnapshot }) => receiveAutoGameflow(event.payload));
    void hydrateAutomation();
    void hydrateAutoSelect();
    void hydrateAutoGameflow();
    if (isCompanionWindow) void hydrateChampionCatalog();
    cleanupListener = await listen<Snapshot>("snapshot-changed", (event: { payload: Snapshot }) => receiveSnapshot(event.payload));
    receiveSnapshot(await invokeCommand<Snapshot>("get_snapshot", {}));
    if (!isCompanionWindow && currentRoute === "toolkit") void hydrateRuntimeStatus();
    if (!isCompanionWindow) {
      profileRefreshTimer = window.setInterval(refreshProfileIfNeeded, 5_000);
    }
  } catch {
    showToast("暂时无法读取客户端状态", "error");
  }
}

window.addEventListener("storage", (event) => {
  if (event.key === APP_PREFERENCES_STORAGE_KEY || event.key === FAVORITES_STORAGE_KEY) {
    loadLocalPreferences();
    render();
  }
});

window.addEventListener("beforeunload", () => {
  cleanupListener?.();
  cleanupAutomationListener?.();
  cleanupAutoSelectListener?.();
  cleanupAutoGameflowListener?.();
  cleanupAppearanceListener?.();
  cleanupCompanionNavListener?.();
  cleanupWindowResize?.();
  cleanupSystemTheme?.();
  window.clearInterval(profileRefreshTimer);
});
window.addEventListener("focus", () => {
  refreshProfileIfNeeded();
  if (isCompanionWindow && companionTab === "skin") void loadSkinImages();
});
document.addEventListener("visibilitychange", () => {
  refreshProfileIfNeeded();
  if (!document.hidden && isCompanionWindow && companionTab === "skin") void loadSkinImages();
});
app.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const token = image.closest<HTMLElement>("[data-game-icon]");
  if (!token) return;
  const key = token.dataset.gameIcon!;
  gameIconCache.delete(key);
  gameIconFailures.add(key);
  token.textContent = Array.from(token.getAttribute("aria-label") ?? "").slice(0, 2).join("");
}, true);
app.addEventListener("scroll", () => {
  if (imageLoadFrame) return;
  imageLoadFrame = window.requestAnimationFrame(() => {
    imageLoadFrame = 0;
    if (currentRoute === "assistant" || (isCompanionWindow && companionTab === "skin")) void loadSkinImages();
    loadGameIcons();
  });
}, { capture: true, passive: true });
window.addEventListener("keydown", (event) => {
  if (hextech.isOpen() && event.key !== "Escape") return;
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if ((event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f")) && !settingsOpen) {
    event.preventDefault();
    app.querySelector<HTMLInputElement>("[data-search]")?.focus();
    return;
  }
  if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !typing && !settingsOpen) void applyRandom();
  if (event.key === "Escape") {
    if (isCompanionWindow) {
      if (searchQuery && typing) {
        searchQuery = "";
        persistCatalogState();
        render();
      } else {
        void closeCompanionWindow();
      }
      return;
    }
    if (hextech.isOpen()) {
      if (hextech.closeDetail()) return;
    }
    if (matchDetailOpen) {
      matchDetailOpen = false;
      render();
      return;
    }
    if (savedPlayersOpen) {
      savedPlayersOpen = false;
      render();
      return;
    }
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
