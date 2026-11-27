import type { RuntimeStatus } from "../data/types";

export type ToolkitViewProps = {
  isTauri: boolean;
  connected: boolean;
  phaseLabel: string;
  runtimeStatus: RuntimeStatus;
  toolkitBusy: boolean;
  escape: (value: string) => string;
};

export function renderToolkitView({
  isTauri,
  connected,
  phaseLabel,
  runtimeStatus,
  toolkitBusy,
  escape,
}: ToolkitViewProps): string {
  const clientDisabled = !connected || toolkitBusy ? "disabled" : "";
  const channelText = !isTauri
    ? "演示模式"
    : !connected
      ? "未连接"
      : runtimeStatus.wsConnected
        ? "WebSocket 实时"
        : "轮询回退";

  return `
    <section class="settings-layout">
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>客户端操作</h2></div></header>
          <div class="preference-content">
            <div class="preference-row preference-row--button">
              <span><strong>重新连接客户端</strong></span>
              <button class="secondary-button" data-action="refresh" ${toolkitBusy ? "disabled" : ""}>重新连接</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>重启客户端界面</strong></span>
              <button class="secondary-button" data-action="toolkit-restart-ux" ${clientDisabled}>重启界面</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>再来一局</strong></span>
              <button class="secondary-button" data-action="toolkit-play-again" ${clientDisabled}>返回房间</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>退出当前房间</strong></span>
              <button class="secondary-button" data-action="toolkit-leave-lobby" ${clientDisabled}>退出房间</button>
            </div>
          </div>
        </article>
      </div>
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>连接与缓存</h2></div></header>
          <div class="preference-content">
            <div class="preference-row preference-row--static">
              <span><strong>客户端状态</strong></span>
              <span class="toolkit-status-val"><span class="toolkit-status-dot ${connected ? "is-live" : ""}"></span>${connected ? escape(phaseLabel) : "未连接"}</span>
            </div>
            <div class="preference-row preference-row--static">
              <span><strong>事件通道</strong></span>
              <span class="toolkit-status-val num">${escape(channelText)}</span>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>图片缓存</strong></span>
              <button class="secondary-button" data-action="clear-image-cache">清理缓存</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>独立选人小窗</strong></span>
              <button class="secondary-button" data-action="open-companion">打开小窗</button>
            </div>
          </div>
        </article>
      </div>
    </section>`;
}
