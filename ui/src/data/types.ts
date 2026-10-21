export type RecentGame = {
  id: string;
  championId?: number;
  champion: string;
  championShort: string;
  result: "win" | "loss" | "remake";
  mode: string;
  kda: string;
  cs: number;
  duration: string;
  playedAt: string;
};

export type ProfileSummary = {
  summoner: {
    name: string;
    tag: string;
    region: string;
    level: number;
    avatarLabel: string;
    avatarUrl: string | null;
  };
  rank: {
    queue: string;
    tier: string;
    division: string;
    ranked: boolean;
    points: number;
    winRate: number | null;
    wins: number;
    losses: number;
  } | null;
  recentGames: RecentGame[];
  matchHistoryAvailable: boolean;
  matchCount: number;
  recentWinRate: number | null;
  recentWinRateSampleSize: number;
  preferredRole: { name: string; share: number; sampleSize: number } | null;
  assets: {
    championsOwned: number | null;
    championsTotal: number | null;
    skinsOwned: number | null;
    skinsTotal: number | null;
    favorites: number;
  };
  trends: {
    labels: string[];
    winRate: Array<number | null>;
    kda: Array<number | null>;
    sampleSize: number;
    averageWinRate: number | null;
    averageKda: number | null;
  };
  topChampions: Array<{ championId?: number; name: string; role: string; games: number; winRate: number; color: string }>;
  source: "client" | "demo";
  updatedAtMs: number;
  warnings: string[];
};

export type AssistantLog = {
  id: string;
  time: string;
  action: string;
  detail: string;
  status: "success" | "pending" | "error";
};

export type AutomationSnapshot = {
  autoAccept: boolean;
  autoAcceptDelaySeconds: number;
  configured: boolean;
  revision: number;
  logs: Array<Omit<AssistantLog, "time"> & { timestampMs: number }>;
};

export type ChampionStat = {
  id: number;
  iconPath?: string;
  iconUrl?: string;
  name: string;
  shortName: string;
  role: string;
  tier: string;
  winRate: number | null;
  pickRate: number | null;
  banRate: number | null;
  kda: number | null;
  trend: "up" | "down" | "flat";
  color: string;
  source: "official" | "third-party" | "demo" | "unavailable";
};

export type AugmentStat = {
  id: string;
  iconPath?: string;
  iconUrl?: string;
  name: string;
  description: string;
  winRate: number | null;
  pickRate: number | null;
  sampleSize: number | null;
  tier: string;
  color: string;
  source: "official" | "third-party" | "demo" | "unavailable";
};

export type AugmentCombo = {
  championId: number;
  augmentIds: string[];
  types: string[];
  url: string | null;
};

export type NewsDataMeta = {
  patch: string | null;
  updatedAtMs: number;
  officialSource: string;
  statsSource: string | null;
  warnings: string[];
  source: "official" | "third-party" | "demo" | "unavailable";
};

export type NewsData = {
  champions: ChampionStat[];
  augments: AugmentStat[];
  combos: AugmentCombo[];
  meta: NewsDataMeta;
};

export type AppPreferences = {
  themeMode: "dark" | "light";
  accentColor: string;
  compactMode: boolean;
  animations: boolean;
  launchAtStartup: boolean;
  autoAccept: boolean;
  autoAcceptDelaySeconds: number;
  autoSkin: boolean;
  notify: boolean;
};
