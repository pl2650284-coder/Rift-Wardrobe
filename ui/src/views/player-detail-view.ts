import type { MatchDetail, PlayerDetail, SavedPlayer } from "../data/types";

export const PLAYER_TAG_PRESETS = ["大腿", "靠谱", "谨慎", "拉黑"] as const;

export type PlayerDetailViewProps = {
  detail: PlayerDetail | null;
  loading: boolean;
  error: string | null;
  puuid: string;
  tagDraft: string;
  noteDraft: string;
  savingTag: boolean;
  escape: (value: string) => string;
  icon: (name: string, size?: number) => string;
  renderChampionIcon: (id: number | undefined, name: string, color: string, extraClass?: string) => string;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatDate(timestampMs: number): string {
  if (!timestampMs) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestampMs);
}

function formatPoints(points: number): string {
  if (points >= 10_000) return `${(points / 10_000).toFixed(1)} 万`;
  return String(points);
}

export function renderPlayerDetailView({
  detail,
  loading,
  error,
  puuid,
  tagDraft,
  noteDraft,
  savingTag,
  escape,
  icon,
  renderChampionIcon,
}: PlayerDetailViewProps): string {
  if (loading && !detail) {
    return `<div class="loading-panel"><span class="loading-spinner">${icon("loader-circle", 22)}</span><strong>正在查询玩家战绩</strong></div>`;
  }
  if (!detail) {
    return `<div class="loading-panel" role="status">${icon("circle-user", 26)}<strong>无法读取该玩家战绩</strong><span>${escape(error ?? "请确认客户端已连接")}</span><button class="secondary-button" data-player-refresh="${escape(puuid)}">重试</button></div>`;
  }

  const s = detail.summoner;
  const primaryRank = detail.ranks.find((r) => r.ranked) ?? detail.ranks[0];
  const stats = detail.stats;
  const isSelf = detail.selfPuuid !== "" && detail.selfPuuid === s.puuid;
  const activeTag = tagDraft || detail.saved?.tag || "";
  const activeNote = noteDraft !== "" ? noteDraft : (detail.saved?.note ?? "");

  return `
    ${detail.warnings.length ? `<div class="profile-notice" role="status">${icon("info", 16)}<span>${detail.warnings.map(escape).join("；")}</span></div>` : ""}

    <section class="mp-hero" aria-label="玩家概览">
      <div class="mp-identity">
        <div class="mp-avatar">${escape(Array.from(s.gameName).slice(0, 2).join(""))}</div>
        <div>
          <div class="mp-name-row">
            <h1>${escape(s.gameName)}</h1>
            ${s.tagLine ? `<span class="mp-tag">#${escape(s.tagLine)}</span>` : ""}
            ${detail.saved?.tag ? `<span class="player-tag-pill player-tag-pill--${detail.saved.tag === "拉黑" ? "danger" : detail.saved.tag === "大腿" ? "good" : "neutral"}">${escape(detail.saved.tag)}</span>` : ""}
          </div>
          <div class="mp-meta num">
            <span>Lv. ${s.level}</span>
            ${s.privacy === "PRIVATE" ? `<span>隐藏战绩</span>` : ""}
            ${detail.encountered.length ? `<span>同局 ${detail.encountered.length} 次</span>` : ""}
          </div>
        </div>
      </div>
      <div class="mp-rank-wrap">
        <div class="mp-rank">
          <strong>${primaryRank ? `${escape(primaryRank.queueLabel)} ${escape(primaryRank.tier)} ${escape(primaryRank.division)}`.trim() : "未定级"}</strong>
          <span class="num">${primaryRank?.ranked ? `${primaryRank.points} LP · ${primaryRank.wins} 胜 ${primaryRank.losses} 负` : "—"}</span>
        </div>
        <button class="secondary-button" data-player-refresh="${escape(s.puuid)}" ${loading ? "disabled" : ""}>${loading ? "刷新中" : "刷新"}</button>
      </div>
    </section>

    <section class="mp-metrics" aria-label="近期表现">
      <div class="mp-metric">
        <span class="mp-metric-k">近期胜率</span>
        <div class="mp-metric-v num">${stats.winRate !== null ? `${stats.winRate}%` : "—"}${stats.sampleSize ? `<span>${stats.wins} 胜 ${stats.losses} 负</span>` : ""}</div>
      </div>
      <div class="mp-metric">
        <span class="mp-metric-k">平均 KDA</span>
        <div class="mp-metric-v num">${stats.avgKda !== null ? stats.avgKda.toFixed(1) : "—"}<span>${stats.sampleSize ? `${stats.avgKills}/${stats.avgDeaths}/${stats.avgAssists}` : ""}</span></div>
      </div>
      <div class="mp-metric">
        <span class="mp-metric-k">综合评分</span>
        <div class="mp-metric-v num">${stats.score !== null ? stats.score : "—"}${stats.streak >= 3 ? `<span>${stats.streak}连胜</span>` : stats.streak <= -3 ? `<span>${-stats.streak}连败</span>` : ""}</div>
      </div>
    </section>

    <section class="mp-body">
      <div>
        <div class="mp-sec-head">
          <h2>最近对局</h2>
          <span class="mp-sec-note num">${detail.matches.length} 场</span>
        </div>
        <div class="mp-match-list">
          ${detail.matches.length ? detail.matches.map((game) => {
            const resultLabel = game.result === "win" ? "胜利" : game.result === "remake" ? "重开" : "失败";
            return `<button class="mp-match-row ${game.result}" data-match-detail="${game.gameId}">
              <span class="mp-res-bar"></span>
              ${renderChampionIcon(game.championId, game.champion, "var(--surface)")}
              <div><div class="mp-m-name">${escape(game.champion)}</div><div class="mp-m-sub">${escape(game.mode)}</div></div>
              <div class="num"><div class="mp-m-kda">${game.kills} / ${game.deaths} / ${game.assists}</div><div class="mp-m-sub">补刀 ${game.cs}</div></div>
              <span class="mp-res-pill">${resultLabel}</span>
              <div class="mp-m-time num"><div class="mp-m-dur">${formatDuration(game.durationSeconds)}</div><div>${formatDate(game.playedAtMs)}</div></div>
            </button>`;
          }).join("") : `<div class="empty-state">${icon("swords", 20)}<span>暂无可读取对局</span></div>`}
        </div>
      </div>

      <aside class="mp-side">
        ${!isSelf ? `<div class="player-tag-box">
          <div class="mp-sec-head">
            <h2>玩家标记</h2>
            ${detail.saved ? `<button class="text-button" data-delete-player-tag="${escape(s.puuid)}" ${savingTag ? "disabled" : ""}>清除</button>` : ""}
          </div>
          <div class="player-tag-presets">
            ${PLAYER_TAG_PRESETS.map((preset) => `<button class="player-preset-btn ${activeTag === preset ? "is-active" : ""}" data-select-tag-preset="${preset}">${preset}</button>`).join("")}
          </div>
          <div class="player-note-row">
            <input type="text" maxlength="80" class="player-note-input" value="${escape(activeNote)}" placeholder="简短备注" data-player-note-input />
            <button class="secondary-button" data-save-player-tag="${escape(s.puuid)}" ${savingTag ? "disabled" : ""}>保存</button>
          </div>
        </div>` : ""}

        <div>
          <div class="mp-sec-head">
            <h2>英雄熟练度</h2>
          </div>
          <div class="mp-champ-list">
            ${detail.mastery.length ? detail.mastery.slice(0, 6).map((item) => `<div class="mp-champ-row">
              ${renderChampionIcon(item.championId, item.championName, "var(--surface)")}
              <div><div class="mp-c-name">${escape(item.championName)}</div><div class="mp-c-games num">Lv.${item.level}</div></div>
              <div></div>
              <div class="mp-c-wr num">${formatPoints(item.points)}</div>
            </div>`).join("") : `<div class="empty-state"><span>暂无熟练度记录</span></div>`}
          </div>
        </div>

        ${detail.encountered.length ? `<div class="mp-trend">
          <div class="mp-sec-head">
            <h2>同局记录</h2>
            <span class="mp-sec-note num">${detail.encountered.length} 场</span>
          </div>
          <div class="encountered-list">
            ${detail.encountered.slice(0, 6).map((item) => `<button class="encountered-row" data-match-detail="${item.gameId}">
              <span>${item.sameTeam ? "同队" : "对手"}</span>
              <span class="num">${formatDate(item.playedAtMs)}</span>
            </button>`).join("")}
          </div>
        </div>` : ""}
      </aside>
    </section>`;
}

export function renderMatchDetailDrawer(props: {
  open: boolean;
  loading: boolean;
  error: string | null;
  detail: MatchDetail | null;
  escape: (value: string) => string;
  icon: (name: string, size?: number) => string;
  renderChampionIcon: (id: number | undefined, name: string, color: string, extraClass?: string) => string;
}): string {
  if (!props.open) return "";
  const { loading, error, detail, escape, icon, renderChampionIcon } = props;
  const maxDamage = detail
    ? Math.max(1, ...detail.teams.flatMap((t) => t.players.map((p) => p.damage)))
    : 1;

  const body = loading && !detail
    ? `<div class="loading-panel"><span class="loading-spinner">${icon("loader-circle", 22)}</span><strong>正在读取 10 人对局详情</strong></div>`
    : !detail
      ? `<div class="loading-panel"><strong>无法读取对局详情</strong><span>${escape(error ?? "")}</span></div>`
      : `<div class="md-meta num">
          <span>${escape(detail.mode)}</span>
          <span>时长 ${formatDuration(detail.durationSeconds)}</span>
          <span>${formatDate(detail.playedAtMs)}</span>
        </div>
        ${detail.teams.map((team) => `<section class="md-team ${team.win ? "is-win" : "is-loss"}">
          <header class="md-team-head">
            <strong>${team.teamId === 100 ? "蓝色方" : "红色方"} · ${team.win ? "胜利" : "失败"}</strong>
            <span class="num">${team.kills} / ${team.deaths} / ${team.assists} · ${(team.totalGold / 1000).toFixed(1)}k 金</span>
          </header>
          <div class="md-players">
            ${team.players.map((p) => {
              const dmgPct = Math.max(4, Math.round((p.damage / maxDamage) * 100));
              const canOpen = Boolean(p.puuid && p.puuid !== "00000000-0000-0000-0000-000000000000");
              return `<div class="md-player ${p.isSelf ? "is-self" : ""}">
                ${renderChampionIcon(p.championId, p.championName, "var(--surface)")}
                <div class="md-p-name">
                  ${canOpen
                    ? `<button class="md-player-link" data-open-player-puuid="${escape(p.puuid)}" data-open-player-name="${escape(p.gameName)}">${escape(p.gameName)}</button>`
                    : `<span>${escape(p.gameName)}</span>`}
                  <small>${escape(p.championName)}${p.role ? ` · ${escape(p.role)}` : ""}</small>
                </div>
                <div class="md-p-kda num"><strong>${p.kills}/${p.deaths}/${p.assists}</strong><span>补刀 ${p.cs}</span></div>
                <div class="md-p-dmg">
                  <div class="md-dmg-val num">${(p.damage / 1000).toFixed(1)}k</div>
                  <div class="md-dmg-track"><div class="md-dmg-fill" style="width:${dmgPct}%"></div></div>
                </div>
                <div class="md-p-gold num">${(p.gold / 1000).toFixed(1)}k</div>
              </div>`;
            }).join("")}
          </div>
        </section>`).join("")}`;

  return `<div class="detail-backdrop" data-action="close-match-detail">
    <aside class="detail-drawer match-detail-drawer" role="dialog" aria-modal="true" aria-label="对局详情">
      <header>
        <div><h2>对局详情</h2></div>
        <button class="icon-button" data-action="close-match-detail" aria-label="关闭详情">${icon("x", 17)}</button>
      </header>
      <div class="md-body">${body}</div>
    </aside>
  </div>`;
}

export function renderSavedPlayersDrawer(props: {
  open: boolean;
  players: SavedPlayer[];
  escape: (value: string) => string;
  icon: (name: string, size?: number) => string;
}): string {
  if (!props.open) return "";
  const { players, escape, icon } = props;
  return `<div class="detail-backdrop" data-action="close-saved-players">
    <aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="已标记玩家">
      <header>
        <div><h2>已标记玩家</h2></div>
        <button class="icon-button" data-action="close-saved-players" aria-label="关闭">${icon("x", 17)}</button>
      </header>
      <div class="saved-players-list">
        ${players.length ? players.map((item) => `<div class="saved-player-row">
          <button class="saved-player-main" data-open-player-puuid="${escape(item.puuid)}" data-open-player-name="${escape(item.tag || item.puuid.slice(0, 8))}">
            <span class="player-tag-pill player-tag-pill--${item.tag === "拉黑" ? "danger" : item.tag === "大腿" ? "good" : "neutral"}">${escape(item.tag || "已标记")}</span>
            <strong>${escape(item.note || item.puuid.slice(0, 12))}</strong>
          </button>
          <button class="icon-button" data-delete-player-tag="${escape(item.puuid)}" aria-label="删除标记">${icon("x", 14)}</button>
        </div>`).join("") : `<div class="auto-log-empty">暂无标记玩家</div>`}
      </div>
    </aside>
  </div>`;
}
