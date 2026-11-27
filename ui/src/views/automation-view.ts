import type {
  AssistantLog,
  AutoGameflowConfig,
  AutoSelectConfig,
  ChampionCatalogItem,
  PositionKey,
} from "../data/types";

export type AutomationSubTab = "flow" | "select" | "logs";

export type AutomationViewProps = {
  subTab: AutomationSubTab;
  autoAccept: boolean;
  autoSkin: boolean;
  autoPopupCompanion: boolean;
  companionAlwaysOnTop: boolean;
  autoSelect: AutoSelectConfig;
  autoSelectPaused: boolean;
  autoGameflow: AutoGameflowConfig;
  pickPosition: PositionKey;
  banPosition: PositionKey;
  champions: ChampionCatalogItem[];
  logs: AssistantLog[];
  preferenceRow: (key: string, title: string, checked: boolean) => string;
  autoAcceptDelaySelect: () => string;
  escape: (value: string) => string;
};

const POSITIONS: Array<{ key: PositionKey; label: string }> = [
  { key: "default", label: "默认" },
  { key: "top", label: "上路" },
  { key: "jungle", label: "打野" },
  { key: "middle", label: "中路" },
  { key: "bottom", label: "下路" },
  { key: "utility", label: "辅助" },
];

function boolRow(attr: string, title: string, checked: boolean): string {
  return `<label class="preference-row"><span><strong>${title}</strong></span><input class="switch-input" type="checkbox" ${attr} ${checked ? "checked" : ""} /><span class="switch-track" aria-hidden="true"></span></label>`;
}

function champName(champions: ChampionCatalogItem[], id: number): string {
  return champions.find((c) => c.id === id)?.name ?? `#${id}`;
}

function renderPriorityEditor(
  kind: "pick" | "ban" | "bench",
  ids: number[],
  champions: ChampionCatalogItem[],
  escape: (value: string) => string,
): string {
  const available = champions.filter((c) => !ids.includes(c.id));
  return `<div class="as-priority-box">
    <div class="as-chips">
      ${ids.length
        ? ids.map((id, idx) => `<span class="as-chip">
            <b class="num">${idx + 1}</b>
            <span>${escape(champName(champions, id))}</span>
            <button class="as-chip-del" data-as-remove-kind="${kind}" data-as-remove-id="${id}" aria-label="移除">×</button>
          </span>`).join("")
        : `<span class="as-empty-chip">未配置英雄</span>`}
    </div>
    <div class="as-add-row">
      <select class="auto-accept-delay as-champ-select" data-as-add-select="${kind}" aria-label="选择英雄">
        <option value="">添加英雄…</option>
        ${available.map((c) => `<option value="${c.id}">${escape(c.name)}</option>`).join("")}
      </select>
    </div>
  </div>`;
}

export function renderAutomationView({
  subTab,
  autoAccept,
  autoSkin,
  autoPopupCompanion,
  companionAlwaysOnTop,
  autoSelect,
  autoSelectPaused,
  autoGameflow,
  pickPosition,
  banPosition,
  champions,
  logs,
  preferenceRow,
  autoAcceptDelaySelect,
  escape,
}: AutomationViewProps): string {
  const nav = `<div class="auto-top-bar">
    <div class="mp-seg" role="tablist" aria-label="自动化分类">
      <button class="${subTab === "flow" ? "is-active" : ""}" data-auto-tab="flow">流程自动化</button>
      <button class="${subTab === "select" ? "is-active" : ""}" data-auto-tab="select">自动选禁</button>
      <button class="${subTab === "logs" ? "is-active" : ""}" data-auto-tab="logs">执行日志${logs.length ? ` (${logs.length})` : ""}</button>
    </div>
    ${autoSelect.pickEnabled || autoSelect.banEnabled || autoSelect.benchEnabled
      ? `<button class="secondary-button auto-pause-pill ${autoSelectPaused ? "is-paused" : ""}" data-action="toggle-auto-select-pause">${autoSelectPaused ? "本局已暂停选禁" : "暂停本局选禁"}</button>`
      : ""}
  </div>`;

  if (subTab === "logs") {
    return `<div class="auto-page">
      ${nav}
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
    </div>`;
  }

  if (subTab === "select") {
    const pickList = autoSelect.pickChampions[pickPosition] ?? [];
    const banList = autoSelect.banChampions[banPosition] ?? [];
    return `<div class="auto-page">
      ${nav}
      <section class="settings-layout">
        <div class="settings-column">
          <article class="settings-panel">
            <header class="panel-heading"><div><h2>自动选人</h2></div></header>
            <div class="preference-content">
              ${boolRow('data-as-bool="pickEnabled"', "启用自动选人", autoSelect.pickEnabled)}
              <div class="preference-row">
                <span><strong>选人策略</strong></span>
                <select class="auto-accept-delay" data-as-select="pickStrategy" aria-label="选人策略">
                  <option value="show-and-lock-in" ${autoSelect.pickStrategy === "show-and-lock-in" ? "selected" : ""}>预选后锁定</option>
                  <option value="just-show" ${autoSelect.pickStrategy === "just-show" ? "selected" : ""}>仅亮出</option>
                  <option value="lock-in-immediately" ${autoSelect.pickStrategy === "lock-in-immediately" ? "selected" : ""}>立即锁定</option>
                </select>
              </div>
              <div class="preference-row">
                <span><strong>锁定延迟</strong></span>
                <select class="auto-accept-delay" data-as-num="pickDelaySeconds" aria-label="选人延迟">
                  ${[0, 1, 2, 3, 4, 5, 8, 10].map((s) => `<option value="${s}" ${autoSelect.pickDelaySeconds === s ? "selected" : ""}>${s} 秒</option>`).join("")}
                </select>
              </div>
              ${boolRow('data-as-bool="showIntent"', "提前预选展示", autoSelect.showIntent)}
              ${boolRow('data-as-bool="ignoreTeammateIntent"', "忽略队友预选", autoSelect.ignoreTeammateIntent)}
              <div class="as-section">
                <div class="as-pos-tabs">
                  ${POSITIONS.map((pos) => `<button class="as-pos-btn ${pickPosition === pos.key ? "is-active" : ""}" data-as-pos-kind="pick" data-as-pos="${pos.key}">${pos.label}</button>`).join("")}
                </div>
                ${renderPriorityEditor("pick", pickList, champions, escape)}
              </div>
            </div>
          </article>
        </div>

        <div class="settings-column">
          <article class="settings-panel">
            <header class="panel-heading"><div><h2>自动禁人</h2></div></header>
            <div class="preference-content">
              ${boolRow('data-as-bool="banEnabled"', "启用自动禁人", autoSelect.banEnabled)}
              <div class="preference-row">
                <span><strong>禁人策略</strong></span>
                <select class="auto-accept-delay" data-as-select="banStrategy" aria-label="禁人策略">
                  <option value="show-and-lock-in" ${autoSelect.banStrategy === "show-and-lock-in" ? "selected" : ""}>亮出后锁定</option>
                  <option value="just-show" ${autoSelect.banStrategy === "just-show" ? "selected" : ""}>仅亮出</option>
                  <option value="lock-in-immediately" ${autoSelect.banStrategy === "lock-in-immediately" ? "selected" : ""}>立即锁定</option>
                </select>
              </div>
              <div class="preference-row">
                <span><strong>禁用延迟</strong></span>
                <select class="auto-accept-delay" data-as-num="banDelaySeconds" aria-label="禁人延迟">
                  ${[0, 1, 2, 3, 4, 5, 8, 10].map((s) => `<option value="${s}" ${autoSelect.banDelaySeconds === s ? "selected" : ""}>${s} 秒</option>`).join("")}
                </select>
              </div>
              ${boolRow('data-as-bool="banAvoidTeammateIntent"', "避开队友预选", autoSelect.banAvoidTeammateIntent)}
              <div class="as-section">
                <div class="as-pos-tabs">
                  ${POSITIONS.map((pos) => `<button class="as-pos-btn ${banPosition === pos.key ? "is-active" : ""}" data-as-pos-kind="ban" data-as-pos="${pos.key}">${pos.label}</button>`).join("")}
                </div>
                ${renderPriorityEditor("ban", banList, champions, escape)}
              </div>
            </div>
          </article>

          <article class="settings-panel">
            <header class="panel-heading"><div><h2>大乱斗候补席</h2></div></header>
            <div class="preference-content">
              ${boolRow('data-as-bool="benchEnabled"', "候补席自动秒抢", autoSelect.benchEnabled)}
              <div class="preference-row">
                <span><strong>秒抢延迟</strong></span>
                <select class="auto-accept-delay" data-as-num="benchDelaySeconds" aria-label="候补席秒抢延迟">
                  ${[0, 1, 2, 3, 4, 5].map((s) => `<option value="${s}" ${autoSelect.benchDelaySeconds === s ? "selected" : ""}>${s} 秒</option>`).join("")}
                </select>
              </div>
              ${boolRow('data-as-bool="benchAutoAcceptTrade"', "自动接受高优交换", autoSelect.benchAutoAcceptTrade)}
              <div class="as-section">
                ${renderPriorityEditor("bench", autoSelect.benchChampions, champions, escape)}
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>`;
  }

  return `<div class="auto-page">
    ${nav}
    <section class="settings-layout">
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>对局流程</h2></div></header>
          <div class="preference-content">
            ${preferenceRow("autoAccept", "自动接受对局", autoAccept)}
            <div class="preference-row"><span><strong>自动接受延迟</strong></span>${autoAcceptDelaySelect()}</div>
            ${preferenceRow("autoSkin", "自动应用上次皮肤", autoSkin)}
            ${boolRow('data-gf-bool="autoHonorEnabled"', "结算自动点赞", autoGameflow.autoHonorEnabled)}
            <div class="preference-row">
              <span><strong>点赞策略</strong></span>
              <select class="auto-accept-delay" data-gf-select="autoHonorStrategy" aria-label="自动点赞策略">
                <option value="random-teammate" ${autoGameflow.autoHonorStrategy === "random-teammate" ? "selected" : ""}>随机队友</option>
                <option value="opt-out" ${autoGameflow.autoHonorStrategy === "opt-out" ? "selected" : ""}>跳过点赞</option>
              </select>
            </div>
            ${boolRow('data-gf-bool="autoPlayAgainEnabled"', "结算自动再来一局", autoGameflow.autoPlayAgainEnabled)}
            ${boolRow('data-gf-bool="autoReconnectEnabled"', "掉线自动重连", autoGameflow.autoReconnectEnabled)}
          </div>
        </article>
      </div>
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>房间与小窗</h2></div></header>
          <div class="preference-content">
            ${boolRow('data-gf-bool="autoMatchmakingEnabled"', "房主自动开始匹配", autoGameflow.autoMatchmakingEnabled)}
            <div class="preference-row">
              <span><strong>匹配延迟</strong></span>
              <select class="auto-accept-delay" data-gf-num="autoMatchmakingDelaySeconds" aria-label="自动匹配延迟">
                ${[1, 2, 3, 5, 8, 10, 15].map((s) => `<option value="${s}" ${autoGameflow.autoMatchmakingDelaySeconds === s ? "selected" : ""}>${s} 秒</option>`).join("")}
              </select>
            </div>
            <div class="preference-row">
              <span><strong>最少开排人数</strong></span>
              <select class="auto-accept-delay" data-gf-num="autoMatchmakingMinMembers" aria-label="最少开排人数">
                ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${autoGameflow.autoMatchmakingMinMembers === n ? "selected" : ""}>${n} 人</option>`).join("")}
              </select>
            </div>
            <div class="preference-row">
              <span><strong>自动处理组队邀请</strong></span>
              <select class="auto-accept-delay" data-gf-select="autoInvitationMode" aria-label="组队邀请处理">
                <option value="off" ${autoGameflow.autoInvitationMode === "off" ? "selected" : ""}>关闭</option>
                <option value="accept-all" ${autoGameflow.autoInvitationMode === "accept-all" ? "selected" : ""}>全部接受</option>
                <option value="decline-all" ${autoGameflow.autoInvitationMode === "decline-all" ? "selected" : ""}>全部拒绝</option>
              </select>
            </div>
            ${preferenceRow("autoPopupCompanion", "选人时自动弹出小窗", autoPopupCompanion)}
            ${preferenceRow("companionPin", "伴随小窗悬浮显示", companionAlwaysOnTop)}
          </div>
        </article>
      </div>
    </section>
  </div>`;
}
