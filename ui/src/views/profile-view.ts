import type { MatchDetail, PlayerDetail, ProfileSummary, SavedPlayer } from "../data/types";
import { renderMatchDetailDrawer, renderPlayerDetailView, renderSavedPlayersDrawer } from "./player-detail-view";

export type OpenPlayerTab = {
  puuid: string;
  label: string;
  detail: PlayerDetail | null;
  loading: boolean;
  error: string | null;
};

export type ProfileViewProps = {
  isTauri: boolean;
  connected: boolean;
  profileData: ProfileSummary | null;
  profileLoading: boolean;
  profileError: string | null;
  profileModeFilter: "all" | "排位赛" | "极地大乱斗";
  profileExpandedMatchId: string | null;
  profileTrendMetric: "winRate" | "kda";
  favoritesCount: number;
  activePlayerTab: string;
  openPlayerTabs: OpenPlayerTab[];
  playerSearchQuery: string;
  playerSearching: boolean;
  tagDraft: string;
  noteDraft: string;
  savingTag: boolean;
  savedPlayers: SavedPlayer[];
  savedPlayersOpen: boolean;
  matchDetailOpen: boolean;
  matchDetailLoading: boolean;
  matchDetailError: string | null;
  matchDetail: MatchDetail | null;
  escape: (value: string) => string;
  icon: (name: string, size?: number) => string;
  formatTime: (timestamp: number) => string;
  renderChampionIcon: (id: number | undefined, name: string, color: string, extraClass?: string) => string;
};

export function renderProfileView({
  isTauri,
  connected,
  profileData,
  profileLoading,
  profileError,
  profileModeFilter,
  profileExpandedMatchId,
  profileTrendMetric,
  favoritesCount,
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
  escape,
  icon,
  formatTime,
  renderChampionIcon,
}: ProfileViewProps): string {
  const drawers = renderMatchDetailDrawer({
    open: matchDetailOpen,
    loading: matchDetailLoading,
    error: matchDetailError,
    detail: matchDetail,
    escape,
    icon,
    renderChampionIcon,
  }) + renderSavedPlayersDrawer({
    open: savedPlayersOpen,
    players: savedPlayers,
    escape,
    icon,
  });

  const playerBar = connected || !isTauri
    ? `<div class="mp-player-bar">
        <div class="mp-tabs" role="tablist" aria-label="战绩标签页">
          <button class="mp-tab ${activePlayerTab === "self" ? "is-active" : ""}" data-player-tab="self">我的战绩</button>
          ${openPlayerTabs.map((tab) => `<span class="mp-tab-wrap ${activePlayerTab === tab.puuid ? "is-active" : ""}">
            <button class="mp-tab" data-player-tab="${escape(tab.puuid)}">${escape(tab.label)}</button>
            <button class="mp-tab-close" data-close-player-tab="${escape(tab.puuid)}" aria-label="关闭 ${escape(tab.label)}">${icon("x", 12)}</button>
          </span>`).join("")}
        </div>
        <div class="mp-player-tools">
          <form class="mp-search-form" data-player-search-form>
            <label class="search-box mp-search-box">
              ${icon("search", 14)}
              <input type="search" maxlength="48" value="${escape(playerSearchQuery)}" placeholder="查玩家 名字#编号" aria-label="查询玩家战绩" data-player-search />
            </label>
            <button class="secondary-button mp-search-btn" type="submit" ${playerSearching ? "disabled" : ""}>${playerSearching ? "查询中" : "查询"}</button>
          </form>
          <button class="secondary-button mp-saved-btn" data-action="open-saved-players">已标记${savedPlayers.length ? ` (${savedPlayers.length})` : ""}</button>
        </div>
      </div>`
    : "";

  if (activePlayerTab !== "self") {
    const activeTab = openPlayerTabs.find((t) => t.puuid === activePlayerTab);
    if (activeTab) {
      return `<div class="minimal-profile">${playerBar}${renderPlayerDetailView({
        detail: activeTab.detail,
        loading: activeTab.loading,
        error: activeTab.error,
        puuid: activeTab.puuid,
        tagDraft,
        noteDraft,
        savingTag,
        escape,
        icon,
        renderChampionIcon,
      })}</div>${drawers}`;
    }
  }

  if (profileLoading && !profileData) {
    return `<div class="loading-panel"><span class="loading-spinner">${icon("loader-circle", 22)}</span><strong>正在加载召唤师数据</strong><span>正在整理最近对局与资产信息</span></div>`;
  }
  if (!profileData) {
    return `<div class="minimal-profile"><div class="loading-panel" role="status">${icon(connected ? "circle-user" : "wifi", 28)}<strong>${connected ? "暂时无法读取个人信息" : "等待英雄联盟客户端"}</strong><span>${escape(profileError ?? "请启动并登录客户端，连接成功后会自动加载。")}</span><button class="secondary-button" data-action="${connected ? "profile-refresh" : "refresh"}">${icon("refresh-ccw", 15)}${connected ? "重试读取" : "重新连接"}</button></div></div>`;
  }
  const data = profileData;
  const percent = (value: number | null): string => value === null ? "—" : `${value}%`;
  const count = (value: number | null): string => value === null ? "—" : String(value);
  const rank = data.rank;
  const gamesEmpty = data.matchHistoryAvailable ? "暂无近期对局，完成游戏后刷新查看" : "对局记录暂不可用，请稍后刷新";
  const refreshDisabled = profileLoading ? "disabled" : "";
  const filteredGames = data.recentGames.filter((g) => profileModeFilter === "all" || g.mode === profileModeFilter);
  const winsRecent = data.recentGames.filter((g) => g.result === "win").length;
  const lossesRecent = data.recentGames.filter((g) => g.result === "loss").length;
  const trendValues = profileTrendMetric === "winRate" ? data.trends.winRate : data.trends.kda;
  const trendMax = profileTrendMetric === "winRate" ? 100 : Math.max(5, ...data.trends.kda.filter((v): v is number => v !== null));

  const avatarContent = data.summoner.avatarUrl
    ? `<img src="${escape(data.summoner.avatarUrl)}" alt="召唤师头像" />`
    : !isTauri
      ? `<img src="/preview/vayne-classic.jpg" alt="召唤师头像" />`
      : escape(data.summoner.avatarLabel);

  return `
    <div class="minimal-profile">
      ${playerBar}
      ${data.warnings.length ? `<div class="profile-notice" role="status">${icon("info", 16)}<span>${data.warnings.map(escape).join("；")}。可稍后刷新重试。</span></div>` : ""}

      <section class="mp-hero" aria-label="召唤师概览">
        <div class="mp-identity">
          <div class="mp-avatar">${avatarContent}</div>
          <div>
            <div class="mp-name-row">
              <h1>${escape(data.summoner.name)}</h1>
              ${data.summoner.tag ? `<span class="mp-tag">#${escape(data.summoner.tag)}</span>` : ""}
            </div>
            <div class="mp-meta num">
              <span>${escape(data.summoner.region)}</span>
              <span>Lv. ${data.summoner.level}</span>
              ${data.preferredRole ? `<span>常用${escape(data.preferredRole.name)}</span>` : ""}
              <span>${data.source === "demo" ? "演示数据" : `更新于 ${formatTime(data.updatedAtMs)}`}</span>
            </div>
          </div>
        </div>
        <div class="mp-rank-wrap">
          <div class="mp-rank">
            <strong>${rank ? `${escape(rank.queue)} ${escape(rank.tier)} ${escape(rank.division)}`.trim() : "排位暂不可用"}</strong>
            <span class="num">${rank ? (rank.ranked ? `${rank.points} LP · ${rank.wins} 胜 ${rank.losses} 负 · 胜率 ${percent(rank.winRate)}` : `尚未定级 · ${rank.wins} 胜 ${rank.losses} 负`) : "请稍后刷新"}</span>
          </div>
          <button class="secondary-button" data-action="profile-refresh" ${refreshDisabled} aria-busy="${profileLoading}">${profileLoading ? "刷新中" : "刷新"}</button>
        </div>
      </section>

      <section class="mp-metrics" aria-label="关键统计">
        <div class="mp-metric">
          <span class="mp-metric-k">近期胜率</span>
          <div class="mp-metric-v num">${percent(data.recentWinRate)}${data.recentWinRateSampleSize ? `<span>${winsRecent} 胜 ${lossesRecent} 负</span>` : ""}</div>
        </div>
        <div class="mp-metric">
          <span class="mp-metric-k">平均 KDA</span>
          <div class="mp-metric-v num">${data.trends.averageKda !== null ? data.trends.averageKda.toFixed(1) : "—"}</div>
        </div>
        <div class="mp-metric">
          <span class="mp-metric-k">已拥有皮肤</span>
          <div class="mp-metric-v num">${count(data.assets.skinsOwned)}<span>/ ${count(data.assets.skinsTotal)}</span></div>
        </div>
      </section>

      <section class="mp-body">
        <div>
          <div class="mp-sec-head">
            <h2>最近对局</h2>
            <div class="mp-seg" role="tablist" aria-label="按模式筛选">
              ${(["all", "排位赛", "极地大乱斗"] as const).map((mode) => `<button class="${profileModeFilter === mode ? "is-active" : ""}" data-profile-mode="${mode}">${mode === "all" ? "全部" : mode === "排位赛" ? "排位" : "大乱斗"}</button>`).join("")}
            </div>
          </div>
          <div class="mp-match-list">
            ${filteredGames.length ? filteredGames.map((game) => {
              const isOpen = profileExpandedMatchId === game.id;
              const resultLabel = game.result === "win" ? "胜利" : game.result === "remake" ? "重开" : "失败";
              const matchAttr = game.gameId ? `data-match-detail="${game.gameId}"` : `data-profile-match="${escape(game.id)}" aria-expanded="${isOpen}"`;
              return `<button class="mp-match-row ${game.result}" ${matchAttr}>
                <span class="mp-res-bar"></span>
                ${renderChampionIcon(game.championId, game.champion, "var(--surface)")}
                <div><div class="mp-m-name">${escape(game.champion)}</div><div class="mp-m-sub">${escape(game.mode)}</div></div>
                <div class="num"><div class="mp-m-kda">${escape(game.kda)}</div><div class="mp-m-sub">补刀 ${game.cs}</div></div>
                <span class="mp-res-pill">${resultLabel}</span>
                <div class="mp-m-time num"><div class="mp-m-dur">${escape(game.duration)}</div><div>${escape(game.playedAt)}</div></div>
              </button>${!game.gameId && isOpen ? `<div class="mp-match-detail"><span>${escape(game.champion)} · ${escape(game.mode)} · KDA ${escape(game.kda)} · 补刀 ${game.cs}</span><span class="num">时长 ${escape(game.duration)} · ${escape(game.playedAt)}</span></div>` : ""}`;
            }).join("") : `<div class="empty-state">${icon("swords", 20)}<span>${data.recentGames.length ? "当前筛选下暂无对局" : gamesEmpty}</span></div>`}
          </div>
        </div>

        <aside class="mp-side">
          <div>
            <div class="mp-sec-head">
              <h2>常用英雄</h2>
              <span class="mp-sec-note">近 ${data.matchCount || 20} 场</span>
            </div>
            <div class="mp-champ-list">
              ${data.topChampions.length ? data.topChampions.map((champ) => `<div class="mp-champ-row">
                ${renderChampionIcon(champ.championId, champ.name, "var(--surface)")}
                <div><div class="mp-c-name">${escape(champ.name)}</div><div class="mp-c-games num">${champ.games} 场</div></div>
                <div class="mp-track"><div class="mp-fill" style="width:${Math.min(100, Math.max(0, champ.winRate))}%"></div></div>
                <div class="mp-c-wr num">${champ.winRate}%</div>
              </div>`).join("") : `<div class="empty-state">${icon("users", 18)}<span>${gamesEmpty}</span></div>`}
            </div>
          </div>

          <div class="mp-trend">
            <div class="mp-sec-head">
              <h2>近 7 天表现</h2>
              <div class="mp-seg" role="tablist" aria-label="切换趋势指标">
                <button class="${profileTrendMetric === "winRate" ? "is-active" : ""}" data-profile-trend="winRate">胜率</button>
                <button class="${profileTrendMetric === "kda" ? "is-active" : ""}" data-profile-trend="kda">KDA</button>
              </div>
            </div>
            <div class="mp-chart">
              ${data.trends.labels.map((label, idx) => {
                const raw = trendValues[idx];
                const pct = raw === null ? 0 : Math.max(10, Math.round((raw / trendMax) * 100));
                const text = raw === null ? "" : profileTrendMetric === "winRate" ? `${raw}%` : raw.toFixed(1);
                return `<div class="mp-day">
                  <span class="mp-day-val num">${text}</span>
                  <div class="mp-day-bar-wrap"><div class="mp-day-bar" style="height:${pct}%"></div></div>
                  <span class="mp-day-lbl">${escape(label)}</span>
                </div>`;
              }).join("")}
            </div>
          </div>

          <div class="mp-assets-foot">
            <div class="mp-assets-summary num">
              <span>英雄 <strong>${count(data.assets.championsOwned)}</strong> / ${count(data.assets.championsTotal)} · 收藏 <strong>${favoritesCount}</strong></span>
            </div>
            <button class="secondary-button" data-action="open-companion">选人小窗</button>
          </div>
        </aside>
      </section>
    </div>${drawers}`;
}
