import type { AssistantLog } from "../data/types";

export type AutomationViewProps = {
  autoAccept: boolean;
  autoSkin: boolean;
  autoPopupCompanion: boolean;
  companionAlwaysOnTop: boolean;
  logs: AssistantLog[];
  preferenceRow: (key: string, title: string, checked: boolean) => string;
  autoAcceptDelaySelect: () => string;
  escape: (value: string) => string;
};

export function renderAutomationView({
  autoAccept,
  autoSkin,
  autoPopupCompanion,
  companionAlwaysOnTop,
  logs,
  preferenceRow,
  autoAcceptDelaySelect,
  escape,
}: AutomationViewProps): string {
  return `
    <section class="settings-layout">
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>对局流程</h2></div></header>
          <div class="preference-content">
            ${preferenceRow("autoAccept", "自动接受对局", autoAccept)}
            <div class="preference-row"><span><strong>自动接受延迟</strong></span>${autoAcceptDelaySelect()}</div>
            ${preferenceRow("autoSkin", "自动应用上次皮肤", autoSkin)}
          </div>
        </article>
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>选人小窗</h2></div></header>
          <div class="preference-content">
            ${preferenceRow("autoPopupCompanion", "选人时自动弹出小窗", autoPopupCompanion)}
            ${preferenceRow("companionPin", "伴随小窗悬浮显示", companionAlwaysOnTop)}
            <div class="preference-row preference-row--button">
              <span><strong>独立选人小窗</strong></span>
              <button class="secondary-button" data-action="open-companion">立即打开</button>
            </div>
          </div>
        </article>
      </div>
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>执行日志</h2></div></header>
          <div class="auto-log-wrap">
            ${logs.length
              ? `<div class="auto-log-list">${logs.map((log) => `<div class="auto-log-row">
                  <span class="auto-log-time num">${escape(log.time)}</span>
                  <strong class="auto-log-action">${escape(log.action)}</strong>
                  <span class="auto-log-detail">${escape(log.detail)}</span>
                  <em class="log-status log-status--${log.status}">${log.status === "success" ? "成功" : log.status === "pending" ? "等待" : "失败"}</em>
                </div>`).join("")}</div>`
              : `<div class="auto-log-empty">暂无执行记录</div>`}
          </div>
        </article>
      </div>
    </section>`;
}
