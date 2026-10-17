export type RecentGame = {
  id: string;
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
  topChampions: Array<{ name: string; role: string; games: number; winRate: number; color: string }>;
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

export type ChampionStat = {
  id: number;
  name: string;
  shortName: string;
  role: string;
  tier: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  kda: number;
  trend: "up" | "down" | "flat";
  color: string;
};

export type AugmentStat = {
  id: string;
  name: string;
  description: string;
  winRate: number;
  pickRate: number;
  sampleSize: number;
  tier: string;
  color: string;
};

export type AppPreferences = {
  themeMode: "dark" | "light";
  accentColor: string;
  compactMode: boolean;
  animations: boolean;
  launchAtStartup: boolean;
  alwaysOnTop: boolean;
  autoAccept: boolean;
  autoSkin: boolean;
  notify: boolean;
};
