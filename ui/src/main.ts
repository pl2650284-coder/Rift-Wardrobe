import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  createIcons,
  ImageOff,
  LayoutGrid,
  LoaderCircle,
  Lock,
  Minus,
  Pin,
  Radio,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide";
import "./styles.css";

type ConnectionState = "disconnected" | "connecting" | "ready";

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
  close: () => Promise<void>;
  top: (enabled: boolean) => Promise<void>;
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
  Check,
  ImageOff,
  LayoutGrid,
  LoaderCircle,
  Lock,
  Minus,
  Pin,
  Radio,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X,
};

let snapshot: Snapshot = demoSnapshot;
let activeFilter = "可用";
let selectedSkinId = snapshot.selectedSkinId;
let previewOnlySelectionId: number | null = null;
let busy = false;
let alwaysOnTop = false;
let toastTimer: number | undefined;
let cleanupListener: UnlistenFn | undefined;
const imageCache = new Map<string, string>();
const imageRequests = new Set<string>();
const imageFailures = new Set<string>();
let imageLoadFrame = 0;

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("app root is missing");
const app: HTMLDivElement = appRoot;

const isTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

const windowApi: WindowApi = {
  minimize: async () => {
    if (isTauri) await getCurrentWindow().minimize();
  },
  close: async () => {
    if (isTauri) await invoke("hide_main_window");
  },
  top: async (enabled: boolean) => {
    if (isTauri) await invoke("set_always_on_top", { enabled });
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
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

function connectionLabel(): string {
  if (snapshot.connection === "ready" && snapshot.active) return "已连接 · 选人阶段";
  if (snapshot.connection === "ready") return "已连接 · 等待选人";
  if (snapshot.connection === "connecting") return "正在连接客户端";
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
  return "未连接到客户端";
}

function connectionTitle(): string {
  const reason = snapshot.writeBlockReason;
  return snapshot.connection === "disconnected" && reason ? reason : connectionLabel();
}

function phaseLabel(): string {
  const labels: Record<string, string> = {
    ChampSelect: "英雄选择",
    Lobby: "房间中",
    None: "客户端空闲",
    Disconnected: "等待客户端",
    Connecting: "正在连接",
  };
  return labels[snapshot.phase] ?? snapshot.phase;
}

function writeBlockLabel(): string | null {
  if (snapshot.writeEnabled || !snapshot.writeBlockReason) return null;
  const labels: Record<string, string> = {
    connecting: "正在等待客户端连接",
    "champion-not-selected": "先在客户端选择英雄",
    "outside-champion-select": "进入选人阶段后才能切换皮肤",
    "client-disabled-skin-selection": "客户端暂时禁止皮肤切换",
    "skin-selector-hidden": "客户端暂时隐藏皮肤选择",
  };
  return labels[snapshot.writeBlockReason] ?? "当前状态暂不允许切换皮肤";
}

function filteredSkins(): Skin[] {
  return snapshot.skins.filter((skin) => {
    if (activeFilter === "可用") return skin.available;
    return true;
  });
}

function render(): void {
  const current = snapshot.skins.find((skin) => skin.id === selectedSkinId) ?? snapshot.skins[0];
  const champion = snapshot.championName ?? "等待选择英雄";
  const availableCount = snapshot.skins.filter((skin) => skin.available).length;
  const filtered = filteredSkins();
  const ready = snapshot.connection === "ready" && snapshot.active;
  const canApply = ready && snapshot.contextId !== null && snapshot.writeEnabled && !busy;
  const statusClass = snapshot.connection === "ready" ? "status-ready" : snapshot.connection === "connecting" ? "status-connecting" : "status-offline";

  app.innerHTML = `
    <div class="shell">
      <header class="titlebar">
        <div class="brand" data-action="home">
          <img class="brand-mark" src="/app-mark.svg" alt="" />
          <div><strong>峡谷换肤助手</strong><span>SKIN SELECTOR</span></div>
        </div>
        <div class="window-actions">
          <button class="icon-button" title="置顶窗口" aria-label="置顶窗口" data-action="top" data-active="${alwaysOnTop}">${icon("pin", 16)}</button>
          <button class="icon-button" title="最小化" aria-label="最小化" data-action="minimize">${icon("minus", 17)}</button>
          <button class="icon-button icon-button--close" title="隐藏窗口" aria-label="隐藏窗口" data-action="close">${icon("x", 17)}</button>
        </div>
      </header>

      <div class="workspace">
        <aside class="sidebar">
          <div class="sidebar-section">
            <span class="eyebrow">WORKSPACE</span>
            <button class="nav-item nav-item--active" data-action="home">${icon("layout-grid", 17)}<span>皮肤库</span><b>${snapshot.skins.length}</b></button>
          </div>
          <div class="sidebar-section sidebar-section--bottom">
            <span class="eyebrow">SYSTEM</span>
            <button class="nav-item" data-action="refresh">${icon("refresh-cw", 17)}<span>重新连接</span></button>
            <button class="nav-item" data-action="settings">${icon("sliders-horizontal", 17)}<span>偏好设置</span></button>
          </div>
          <div class="sidebar-foot"><span class="version-dot"></span><span>v0.2 · 本地运行</span></div>
        </aside>

        <main class="main-content">
          <section class="topline">
            <div><span class="eyebrow">CURRENT SESSION</span><h1>${escapeHtml(champion)}</h1><p class="phase-copy">${escapeHtml(phaseLabel() || "等待游戏客户端")} <span class="slash">/</span> 皮肤选择</p></div>
            <div class="connection ${statusClass}" title="${escapeHtml(connectionTitle())}"><span class="connection-dot"></span><span>${connectionLabel()}</span>${icon(snapshot.connection === "ready" ? "radio" : "loader-circle", 15)}</div>
          </section>

          <section class="hero-panel">
            <div class="hero-copy"><span class="eyebrow">SELECTED SKIN</span><h2>${current ? escapeHtml(current.name) : "尚未选择"}</h2><p>${writeBlockLabel() ?? (current?.isBase ? "使用英雄默认外观" : current?.isChroma ? "炫彩皮肤暂仅提供预览" : current && !current.available ? "当前皮肤不可用，仅提供预览" : "客户端将使用当前选择完成换肤")}</p><button class="primary-button" data-action="apply" ${canApply && current && current.available && !current.isChroma && !current.selected ? "" : "disabled"}>${icon("check", 16)}${busy ? "正在应用" : current?.selected ? "当前已使用" : current?.isChroma ? "炫彩暂不支持" : current && !current.available ? "不可应用" : "应用皮肤"}</button></div>
            <div class="hero-art">${current ? skinImage(current, true) : `<div class="empty-art">${icon("image-off", 30)}<span>等待皮肤数据</span></div>`}<div class="hero-art-glow"></div></div>
            <div class="hero-meta"><div><span>英雄</span><strong>${escapeHtml(champion)}</strong></div><div><span>可用皮肤</span><strong>${availableCount}<em> / ${snapshot.skins.length}</em></strong></div><div><span>同步状态</span><strong class="meta-ready">${ready ? "实时" : "暂停"}</strong></div></div>
          </section>

          <section class="catalog-head"><div><span class="eyebrow">SKIN CATALOG</span><h2>选择一个外观</h2></div><div class="catalog-tools"><div class="segmented">${["可用", "全部"].map((filter) => `<button class="segment ${activeFilter === filter ? "segment--active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}</div><button class="secondary-button" data-action="random" ${canApply ? "" : "disabled"}>${icon("shuffle", 16)}随机一款</button></div></section>

          <section class="skin-grid">${filtered.length ? filtered.map((skin) => `<button class="skin-card ${skin.id === selectedSkinId ? "skin-card--selected" : ""} ${!skin.available ? "skin-card--locked" : ""}" data-skin-id="${skin.id}" ${busy ? "disabled" : ""}><div class="skin-thumb">${skinImage(skin)}${skin.id === selectedSkinId ? `<span class="selected-mark">${icon("check", 13)}</span>` : ""}${!skin.available ? `<span class="lock-mark">${icon("lock", 13)}</span>` : ""}</div><div class="skin-info"><strong>${escapeHtml(skin.name)}</strong><span>${skin.isBase ? "默认外观" : skin.isChroma ? "炫彩预览" : skin.available ? "可用" : "不可用"}</span></div></button>`).join("") : `<div class="empty-state">${icon("search-x", 22)}<span>没有符合条件的皮肤</span></div>`}</section>
          <footer class="content-foot"><span>${icon("shield-check", 14)}只通过客户端接口操作，不修改游戏文件</span><span>最后同步 ${formatTime(snapshot.updatedAtMs)}</span></footer>
        </main>
      </div>
      <div id="toast" class="toast" aria-live="polite"></div>
    </div>`;
  wireEvents();
  refreshIcons();
  void loadSkinImages();
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
      imageCache.set(path, dataUrl);
      render();
    } catch {
      imageFailures.add(path);
      render();
    } finally {
      imageRequests.delete(path);
    }
  }));
}

function showToast(message: string, kind: "info" | "error" = "info"): void {
  const toast = document.querySelector<HTMLDivElement>("#toast");
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add("toast--visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("toast--visible"), 2800);
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

function wireEvents(): void {
  app.querySelector<HTMLElement>(".titlebar")?.addEventListener("mousedown", (event) => {
    void startWindowDrag(event);
  });
  app.querySelectorAll<HTMLElement>("[data-filter]").forEach((element) => element.addEventListener("click", () => {
    activeFilter = element.dataset.filter ?? "全部";
    render();
  }));
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
  app.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => element.addEventListener("click", () => {
    const action = element.dataset.action;
    if (action === "apply" && selectedSkinId !== null) void applySkin(selectedSkinId);
    if (action === "random") void applyRandom();
    if (action === "minimize") void windowApi.minimize();
    if (action === "close") void windowApi.close();
    if (action === "top") {
      alwaysOnTop = !alwaysOnTop;
      void windowApi.top(alwaysOnTop);
      render();
    }
    if (action === "refresh") void reconnectClient();
    if (action === "settings") showToast("偏好设置将在后续版本开放");
  }));
}

async function reconnectClient(): Promise<void> {
  if (!isTauri) {
    showToast("演示模式已连接");
    return;
  }
  try {
    await invokeCommand("reconnect_client", {});
    imageCache.clear();
    imageRequests.clear();
    imageFailures.clear();
    showToast("正在重新连接客户端…");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "重新连接失败", "error");
  }
}

async function bootstrap(): Promise<void> {
  render();
  if (!isTauri) return;
  try {
    snapshot = await invokeCommand<Snapshot>("get_snapshot", {});
    selectedSkinId = snapshot.selectedSkinId;
    previewOnlySelectionId = null;
    render();
    cleanupListener = await listen<Snapshot>("snapshot-changed", (event: { payload: Snapshot }) => {
      const previousContextId = snapshot.contextId;
      const previousSelectedSkinId = snapshot.selectedSkinId;
      snapshot = event.payload;
      if (snapshot.contextId !== previousContextId) {
        imageCache.clear();
        imageRequests.clear();
        imageFailures.clear();
        previewOnlySelectionId = null;
        selectedSkinId = snapshot.selectedSkinId;
      }
      if (previewOnlySelectionId !== null && snapshot.selectedSkinId !== previousSelectedSkinId && snapshot.selectedSkinId !== previewOnlySelectionId) {
        previewOnlySelectionId = null;
      }
      if (snapshot.selectedSkinId !== null && !busy && previewOnlySelectionId === null) selectedSkinId = snapshot.selectedSkinId;
      render();
    });
  } catch {
    showToast("暂时无法读取客户端状态", "error");
  }
}

window.addEventListener("beforeunload", () => cleanupListener?.());
window.addEventListener("scroll", () => {
  if (imageLoadFrame) return;
  imageLoadFrame = window.requestAnimationFrame(() => {
    imageLoadFrame = 0;
    void loadSkinImages();
  });
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) void applyRandom();
  if (event.key === "Escape") void windowApi.close();
});

void bootstrap();
