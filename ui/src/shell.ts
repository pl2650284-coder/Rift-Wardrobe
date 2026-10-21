type ShellOptions = {
  route: "profile" | "assistant" | "news" | "settings";
  content: string;
  windowActions: string;
  connection: string;
  connected: boolean;
  icon: (name: string, size?: number) => string;
};

/** Shared desktop chrome keeps navigation and native window controls consistent. */
export function renderShell({ route, content, windowActions, connection, connected, icon }: ShellOptions): string {
  const routes = [
    { id: "profile", label: "个人信息", glyph: "circle-user" },
    { id: "assistant", label: "游戏辅助", glyph: "gamepad-2" },
    { id: "news", label: "游戏资讯", glyph: "book-open" },
    { id: "settings", label: "应用设置", glyph: "settings-2" },
  ];
  const title = routes.find((item) => item.id === route)!.label;
  return `<div class="shell shell--${route}">
    <aside class="sidebar" aria-label="主导航">
      <button class="rail-brand" data-route="assistant" aria-label="峡谷衣橱首页" title="峡谷衣橱"><img src="/app-mark.svg" alt="" /></button>
      <nav class="sidebar-section">${routes.map((item) => `<button class="nav-item ${route === item.id ? "nav-item--active" : ""}" data-route="${item.id}" aria-label="${item.label}" ${route === item.id ? 'aria-current="page"' : ""}>${icon(item.glyph, 20)}<span class="nav-tooltip">${item.label}</span></button>`).join("")}</nav>
      <div class="sidebar-section sidebar-section--bottom"><button class="nav-item" data-action="refresh" aria-label="重新连接客户端">${icon("refresh-cw", 19)}<span class="nav-tooltip">重新连接</span></button></div>
      <div class="sidebar-foot" title="${connected ? "客户端已连接" : "等待客户端"}"><span class="version-dot ${connected ? "" : "version-dot--offline"}"></span><span class="rail-caption">本地运行</span></div>
    </aside>
    <header class="titlebar">
      <div class="brand"><strong>峡谷衣橱</strong><span class="titlebar-divider"></span><span class="titlebar-page">${title}${route === "assistant" ? " / 皮肤选择" : ""}</span></div>
      <div class="titlebar-status">${connection}</div>${windowActions}
    </header>
    <main class="main-content ${route === "assistant" ? "main-content--wardrobe" : "main-content--dashboard"}" data-page="${route}" tabindex="0" aria-label="${title}内容">${content}</main>
  </div>`;
}
