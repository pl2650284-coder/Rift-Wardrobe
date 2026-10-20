import { invoke } from "@tauri-apps/api/core";
import { demoProfile } from "../data/mock.ts";
import type { ProfileSummary, RecentGame } from "../data/types.ts";

export type ProfileMatch = {
  id: string;
  championId: number;
  champion: string;
  result: RecentGame["result"];
  mode: string;
  role: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSeconds: number;
  playedAtMs: number;
};

export type NativeProfile = {
  summoner: Omit<ProfileSummary["summoner"], "avatarLabel" | "avatarUrl"> & { iconPath: string | null };
  rank: ProfileSummary["rank"];
  matches: ProfileMatch[] | null;
  assets: Omit<ProfileSummary["assets"], "favorites">;
  warnings: string[];
  updatedAtMs: number;
};

const COLORS = ["#7bcfb0", "#8f9ee9", "#d99bca", "#e0b476", "#8eb7d9"];

function winRate(matches: ProfileMatch[]): number | null {
  return matches.length ? Math.round(matches.filter((game) => game.result === "win").length / matches.length * 100) : null;
}

function averageKda(matches: ProfileMatch[]): number | null {
  return matches.length ? matches.reduce((sum, game) => sum + (game.kills + game.assists) / Math.max(game.deaths, 1), 0) / matches.length : null;
}

function mostPlayedRole(matches: ProfileMatch[]): ProfileSummary["preferredRole"] {
  const counts = new Map<string, number>();
  let sampleSize = 0;
  for (const game of matches) {
    if (!game.role) continue;
    counts.set(game.role, (counts.get(game.role) ?? 0) + 1);
    sampleSize += 1;
  }
  const role = [...counts].sort((first, second) => second[1] - first[1])[0];
  return role ? { name: role[0], share: Math.round(role[1] / sampleSize * 100), sampleSize } : null;
}

function playedAt(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(timestamp);
}

export function summarizeProfile(raw: NativeProfile, favorites: number, now = Date.now()): ProfileSummary {
  const seen = new Set<string>();
  const matches = [...(raw.matches ?? [])]
    .sort((first, second) => second.playedAtMs - first.playedAtMs)
    .filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    })
    .slice(0, 20);
  const completed = matches.filter((game) => game.result !== "remake");
  const recent = matches.slice(0, 5);
  const recentCompleted = recent.filter((game) => game.result !== "remake");
  const trends: ProfileSummary["trends"] = {
    labels: [], winRate: [], kda: [], sampleSize: 0, averageWinRate: null, averageKda: null,
  };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekMatches = completed.filter((game) => game.playedAtMs >= weekStart.getTime() && game.playedAtMs <= now);
  for (let offset = -6; offset <= 0; offset += 1) {
    const start = new Date(today);
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dayMatches = weekMatches.filter((game) => game.playedAtMs >= start.getTime() && game.playedAtMs < end.getTime());
    trends.labels.push(offset === 0 ? "今天" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(start));
    trends.winRate.push(winRate(dayMatches));
    trends.kda.push(averageKda(dayMatches));
  }
  trends.sampleSize = weekMatches.length;
  trends.averageWinRate = winRate(weekMatches);
  trends.averageKda = averageKda(weekMatches);

  const championMatches = new Map<number, ProfileMatch[]>();
  for (const game of completed) {
    const games = championMatches.get(game.championId) ?? [];
    games.push(game);
    championMatches.set(game.championId, games);
  }
  const topChampions = [...championMatches]
    .sort((first, second) => second[1].length - first[1].length)
    .slice(0, 3)
    .map(([id, games]) => ({
      championId: id,
      name: games[0].champion,
      role: mostPlayedRole(games)?.name ?? "",
      games: games.length,
      winRate: winRate(games) ?? 0,
      color: COLORS[id % COLORS.length],
    }));

  return {
    summoner: { ...raw.summoner, avatarLabel: Array.from(raw.summoner.name).slice(0, 2).join(""), avatarUrl: null },
    rank: raw.rank,
    recentGames: recent.map((game) => ({
      id: game.id,
      championId: game.championId,
      champion: game.champion,
      championShort: Array.from(game.champion).slice(0, 2).join(""),
      result: game.result,
      mode: game.mode,
      kda: `${game.kills} / ${game.deaths} / ${game.assists}`,
      cs: game.cs,
      duration: `${Math.floor(game.durationSeconds / 60)}:${String(game.durationSeconds % 60).padStart(2, "0")}`,
      playedAt: playedAt(game.playedAtMs, now),
    })),
    matchHistoryAvailable: raw.matches !== null,
    matchCount: matches.length,
    recentWinRate: winRate(recentCompleted),
    recentWinRateSampleSize: recentCompleted.length,
    preferredRole: mostPlayedRole(completed),
    assets: { ...raw.assets, favorites },
    trends,
    topChampions,
    source: "client",
    updatedAtMs: raw.updatedAtMs,
    warnings: [...raw.warnings],
  };
}

export async function getProfileSummary(native: boolean, favorites: number): Promise<ProfileSummary> {
  if (!native) {
    const profile = structuredClone(demoProfile);
    profile.assets.favorites = favorites;
    profile.updatedAtMs = Date.now();
    return profile;
  }
  const raw = await invoke<NativeProfile>("get_profile");
  const profile = summarizeProfile(raw, favorites);
  if (raw.summoner.iconPath) {
    try {
      profile.summoner.avatarUrl = await invoke<string>("get_skin_image", { path: raw.summoner.iconPath });
    } catch {
      // A missing avatar does not hide the account's readable statistics.
    }
  }
  return profile;
}
