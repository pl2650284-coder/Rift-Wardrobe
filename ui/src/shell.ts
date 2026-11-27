import type { ThemeMode } from "./theme";

type ShellOptions = {
  route: "profile" | "assistant" | "news" | "automation" | "toolkit" | "settings";
  content: string;
  windowActions: string;
  connection: string;
  connected: boolean;
  themeMode: ThemeMode;
  icon: (name: string, size?: number) => string;
};

/** Minimal desktop shell: 60px icon rail (Home / Rankings / Automation / Toolkit / Settings) + calm 48px titlebar. */
export function renderShell({
  route,
  content,
  windowActions,
  connection,
  connected,
  themeMode,
  icon,
}: ShellOptions): string {
  const routes = [
    { id: "profile", label: "主页", glyph: "circle-user" },
    { id: "news", label: "榜单", glyph: "bar-chart-3" },
    { id: "automation", label: "自动化", glyph: "zap" },
    { id: "toolkit", label: "工具箱", glyph: "wrench" },
    { id: "settings", label: "设置", glyph: "settings-2" },
  ] as const;
  const pageTitles: Record<ShellOptions["route"], string> = {
    profile: "主页",
    assistant: "衣橱",
    news: "榜单",
    automation: "自动化",
    toolkit: "工具箱",
    settings: "设置",
  };
  const pageTitle = pageTitles[route];
  const themeLabel = themeMode === "system" ? "自动" : themeMode === "dark" ? "深色" : "浅色";
  const themeGlyph = themeMode === "system" ? "monitor" : themeMode === "dark" ? "moon" : "sun";

  return `<div class="shell shell--${route}">
    <aside class="sidebar" aria-label="主导航">
      <button class="rail-brand" data-route="profile" aria-label="峡印" title="峡印">
        <img class="rail-logo" src="/app-mark.svg" alt="峡印" />
      </button>
      <nav class="sidebar-section">
        ${routes.map((item) => `<button class="nav-item ${route === item.id ? "nav-item--active" : ""}" data-route="${item.id}" aria-label="${item.label}" ${route === item.id ? 'aria-current="page"' : ""}>${icon(item.glyph, 18)}<span class="nav-tooltip">${item.label}</span></button>`).join("")}
      </nav>
      <div class="sidebar-section sidebar-section--bottom">
        <button class="nav-item" data-action="open-companion" aria-label="选人小窗" title="选人小窗">
          ${icon("panel-right-open", 18)}
          <span class="nav-tooltip">选人小窗</span>
        </button>
        <button class="nav-item" data-action="refresh" aria-label="重新连接" title="重新连接">
          ${icon("refresh-cw", 17)}
          <span class="nav-tooltip">重新连接</span>
        </button>
      </div>
      <div class="sidebar-foot" title="${connected ? "已连接" : "未连接"}">
        <span class="version-dot ${connected ? "" : "version-dot--offline"}"></span>
      </div>
    </aside>
    <header class="titlebar">
      <div class="brand">
        <strong>${pageTitle}</strong>
      </div>
      <div class="titlebar-right">
        <div class="titlebar-status">${connection}</div>
        <button class="titlebar-pill" data-action="open-companion" title="打开独立选人小窗">
          ${icon("external-link", 13)}<span>选人小窗</span>
        </button>
        <button class="titlebar-pill" data-action="cycle-theme" title="切换主题（自动 / 深色 / 浅色）">
          ${icon(themeGlyph, 13)}<span>${themeLabel}</span>
        </button>
        ${windowActions}
      </div>
    </header>
    <main class="main-content ${route === "assistant" ? "main-content--wardrobe" : "main-content--dashboard"}" data-page="${route}" tabindex="0" aria-label="${pageTitle}">${content}</main>
  </div>`;
}
