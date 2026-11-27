import type { FriendItem, RuntimeStatus, SettingsFileStatus } from "../data/types";

export type ToolkitSubTab = "lobby" | "persona" | "friends";

export type ToolkitViewProps = {
  isTauri: boolean;
  connected: boolean;
  phaseLabel: string;
  runtimeStatus: RuntimeStatus;
  toolkitBusy: boolean;
  subTab: ToolkitSubTab;
  queueId: number;
  botChampId: number;
  spectateQuery: string;
  bgSkinId: string;
  fakeRankQueue: string;
  fakeRankTier: string;
  fakeRankDivision: string;
  availability: string;
  statusMessage: string;
  settingsFileStatus: SettingsFileStatus | null;
  friends: FriendItem[];
  friendsLoading: boolean;
  friendQuery: string;
  selectedFriendIds: Set<string>;
  confirmDeleteFriends: boolean;
  escape: (value: string) => string;
};

const QUEUE_PRESETS = [
  { id: 420, label: "单双排位 (420)" },
  { id: 440, label: "灵活排位 (440)" },
  { id: 430, label: "匹配模式 (430)" },
  { id: 450, label: "极地大乱斗 (450)" },
  { id: 2400, label: "海克斯大乱斗 (2400)" },
  { id: 1700, label: "斗魂竞技场 (1700)" },
] as const;

const RANK_TIERS = [
  { id: "CHALLENGER", label: "最强王者" },
  { id: "GRANDMASTER", label: "傲世宗师" },
  { id: "MASTER", label: "超凡大师" },
  { id: "DIAMOND", label: "璀璨钻石" },
  { id: "EMERALD", label: "流光翡翠" },
  { id: "PLATINUM", label: "华贵铂金" },
  { id: "GOLD", label: "荣耀黄金" },
  { id: "SILVER", label: "不屈白银" },
  { id: "BRONZE", label: "英勇黄铜" },
  { id: "IRON", label: "坚韧黑铁" },
  { id: "UNRANKED", label: "未定级" },
] as const;

const AVAILABILITY_OPTIONS = [
  { id: "chat", label: "在线" },
  { id: "away", label: "离开" },
  { id: "dnd", label: "勿扰" },
  { id: "offline", label: "离线隐身" },
  { id: "mobile", label: "手机在线" },
] as const;

export function renderToolkitView(props: ToolkitViewProps): string {
  const {
    isTauri,
    connected,
    phaseLabel,
    runtimeStatus,
    toolkitBusy,
    subTab,
    queueId,
    spectateQuery,
    bgSkinId,
    fakeRankQueue,
    fakeRankTier,
    fakeRankDivision,
    availability,
    statusMessage,
    settingsFileStatus,
    friends,
    friendsLoading,
    friendQuery,
    selectedFriendIds,
    confirmDeleteFriends,
    escape,
  } = props;

  const clientDisabled = !connected || toolkitBusy ? "disabled" : "";
  const channelText = !isTauri
    ? "演示模式"
    : !connected
      ? "未连接"
      : runtimeStatus.wsConnected
        ? "WebSocket 实时"
        : "轮询回退";

  const nav = `<div class="auto-top-bar">
    <div class="mp-seg" role="tablist" aria-label="工具箱分类">
      <button class="${subTab === "lobby" ? "is-active" : ""}" data-tk-tab="lobby">快捷与房间</button>
      <button class="${subTab === "persona" ? "is-active" : ""}" data-tk-tab="persona">资料与状态</button>
      <button class="${subTab === "friends" ? "is-active" : ""}" data-tk-tab="friends">好友清理${friends.length ? ` (${friends.length})` : ""}</button>
    </div>
  </div>`;

  if (subTab === "persona") {
    return `<div class="auto-page">
      ${nav}
      <section class="settings-layout">
        <div class="settings-column">
          <article class="settings-panel">
            <header class="panel-heading"><div><h2>生涯背景与伪装段位</h2></div></header>
            <div class="preference-content">
              <div class="preference-row preference-row--static">
                <span><strong>主页背景皮肤 ID</strong></span>
                <div class="tk-inline">
                  <input class="player-note-input tk-short-input num" type="text" maxlength="10" value="${escape(bgSkinId)}" placeholder="如 67014" data-tk-bg-skin />
                  <button class="secondary-button" data-action="tk-set-bg-skin" ${clientDisabled}>应用</button>
                </div>
              </div>
              <div class="preference-row">
                <span><strong>伪装队列</strong></span>
                <select class="auto-accept-delay" data-tk-rank-queue aria-label="伪装队列">
                  <option value="RANKED_SOLO_5x5" ${fakeRankQueue === "RANKED_SOLO_5x5" ? "selected" : ""}>单双排位</option>
                  <option value="RANKED_FLEX_SR" ${fakeRankQueue === "RANKED_FLEX_SR" ? "selected" : ""}>灵活排位</option>
                  <option value="RANKED_TFT" ${fakeRankQueue === "RANKED_TFT" ? "selected" : ""}>云顶之弈</option>
                </select>
              </div>
              <div class="preference-row">
                <span><strong>伪装段位</strong></span>
                <div class="tk-inline">
                  <select class="auto-accept-delay" data-tk-rank-tier aria-label="伪装段位">
                    ${RANK_TIERS.map((t) => `<option value="${t.id}" ${fakeRankTier === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
                  </select>
                  <select class="auto-accept-delay" data-tk-rank-div aria-label="伪装小段">
                    ${(["I", "II", "III", "IV"] as const).map((d) => `<option value="${d}" ${fakeRankDivision === d ? "selected" : ""}>${d}</option>`).join("")}
                  </select>
                  <button class="secondary-button" data-action="tk-set-fake-rank" ${clientDisabled}>应用</button>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div class="settings-column">
          <article class="settings-panel">
            <header class="panel-heading"><div><h2>在线状态与签名</h2></div></header>
            <div class="preference-content">
              <div class="preference-row">
                <span><strong>在线状态</strong></span>
                <div class="tk-inline">
                  <select class="auto-accept-delay" data-tk-availability aria-label="在线状态">
                    ${AVAILABILITY_OPTIONS.map((a) => `<option value="${a.id}" ${availability === a.id ? "selected" : ""}>${a.label}</option>`).join("")}
                  </select>
                  <button class="secondary-button" data-action="tk-set-availability" ${clientDisabled}>切换</button>
                </div>
              </div>
              <div class="preference-row preference-row--static">
                <span><strong>状态签名</strong></span>
                <div class="tk-inline">
                  <input class="player-note-input tk-med-input" type="text" maxlength="60" value="${escape(statusMessage)}" placeholder="输入个性签名" data-tk-status-msg />
                  <button class="secondary-button" data-action="tk-set-status-msg" ${clientDisabled}>更新</button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>`;
  }

  if (subTab === "friends") {
    const q = friendQuery.trim().toLocaleLowerCase("zh-CN");
    const filtered = friends.filter((f) =>
      !q || f.gameName.toLocaleLowerCase("zh-CN").includes(q) || f.groupName.toLocaleLowerCase("zh-CN").includes(q) || f.note.toLocaleLowerCase("zh-CN").includes(q),
    );
    const selectedCount = selectedFriendIds.size;

    return `<div class="auto-page">
      ${nav}
      <article class="settings-panel">
        <header class="panel-heading tk-friends-head">
          <div><h2>好友清理</h2></div>
          <div class="tk-inline">
            <input class="player-note-input tk-med-input" type="search" maxlength="40" value="${escape(friendQuery)}" placeholder="筛选好友或分组" data-tk-friend-search />
            <button class="secondary-button" data-action="tk-load-friends" ${!connected || friendsLoading ? "disabled" : ""}>${friendsLoading ? "读取中" : "刷新列表"}</button>
            ${selectedCount > 0
              ? (confirmDeleteFriends
                ? `<button class="primary-button tk-danger-btn" data-action="tk-confirm-delete-friends" ${toolkitBusy ? "disabled" : ""}>确认删除 (${selectedCount})</button>
                   <button class="secondary-button" data-action="tk-cancel-delete-friends">取消</button>`
                : `<button class="secondary-button tk-danger-outline" data-action="tk-ask-delete-friends" ${toolkitBusy ? "disabled" : ""}>删除选中 (${selectedCount})</button>`)
              : ""}
          </div>
        </header>
        <div class="auto-log-wrap">
          ${filtered.length
            ? `<div class="tk-friend-list">${filtered.map((f) => {
                const checked = selectedFriendIds.has(f.id);
                return `<label class="tk-friend-row">
                  <input type="checkbox" data-tk-friend-check="${escape(f.id)}" ${checked ? "checked" : ""} />
                  <span class="tk-friend-name"><strong>${escape(f.gameName)}</strong>${f.tagLine ? `<small>#${escape(f.tagLine)}</small>` : ""}</span>
                  <span class="tk-friend-group">${escape(f.groupName)}</span>
                  <span class="tk-friend-state">${f.availability === "offline" ? "离线" : f.availability === "chat" ? "在线" : escape(f.availability)}</span>
                </label>`;
              }).join("")}</div>`
            : `<div class="auto-log-empty">${friends.length ? "没有匹配的好友" : "点击刷新列表读取当前账号好友"}</div>`}
        </div>
      </article>
    </div>`;
  }

  return `<div class="auto-page">
    ${nav}
    <section class="settings-layout">
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>客户端与房间</h2></div></header>
          <div class="preference-content">
            <div class="preference-row preference-row--button">
              <span><strong>创建模式房间</strong></span>
              <div class="tk-inline">
                <select class="auto-accept-delay" data-tk-queue aria-label="选择游戏模式">
                  ${QUEUE_PRESETS.map((q) => `<option value="${q.id}" ${queueId === q.id ? "selected" : ""}>${q.label}</option>`).join("")}
                </select>
                <button class="secondary-button" data-action="tk-create-lobby" ${clientDisabled}>创建</button>
              </div>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>5v5 训练模式</strong></span>
              <div class="tk-inline">
                <button class="secondary-button" data-action="tk-create-practice" ${clientDisabled}>建房</button>
                <button class="secondary-button" data-action="tk-add-bot-blue" ${clientDisabled}>+蓝方AI</button>
                <button class="secondary-button" data-action="tk-add-bot-red" ${clientDisabled}>+红方AI</button>
              </div>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>再来一局</strong></span>
              <button class="secondary-button" data-action="toolkit-play-again" ${clientDisabled}>返回房间</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>退出当前房间</strong></span>
              <button class="secondary-button" data-action="toolkit-leave-lobby" ${clientDisabled}>退出房间</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>重启客户端界面</strong></span>
              <button class="secondary-button" data-action="toolkit-restart-ux" ${clientDisabled}>重启界面</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>重新连接客户端</strong></span>
              <button class="secondary-button" data-action="refresh" ${toolkitBusy ? "disabled" : ""}>重新连接</button>
            </div>
          </div>
        </article>
      </div>
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>观战、领奖与保护</h2></div></header>
          <div class="preference-content">
            <div class="preference-row preference-row--static">
              <span><strong>同区观战</strong></span>
              <div class="tk-inline">
                <input class="player-note-input tk-med-input" type="text" maxlength="48" value="${escape(spectateQuery)}" placeholder="名字#编号" data-tk-spectate />
                <button class="secondary-button" data-action="tk-spectate" ${clientDisabled}>观战</button>
              </div>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>领取待领奖励与任务</strong></span>
              <button class="secondary-button" data-action="tk-claim-rewards" ${clientDisabled}>一键领取</button>
            </div>
            <label class="preference-row">
              <span><strong>锁定游戏设置只读</strong></span>
              <input class="switch-input" type="checkbox" data-tk-settings-readonly ${settingsFileStatus?.readonly ? "checked" : ""} ${!connected || toolkitBusy ? "disabled" : ""} />
              <span class="switch-track" aria-hidden="true"></span>
            </label>
            <div class="preference-row preference-row--static">
              <span><strong>客户端状态</strong></span>
              <span class="toolkit-status-val"><span class="toolkit-status-dot ${connected ? "is-live" : ""}"></span>${connected ? escape(phaseLabel) : "未连接"} · ${escape(channelText)}</span>
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
    </section>
  </div>`;
}
