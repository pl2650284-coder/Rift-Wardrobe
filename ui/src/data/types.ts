export type RecentGame = {
  id: string;
  gameId?: number;
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
    puuid?: string;
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
  themeMode: "system" | "dark" | "light";
  accentColor: string;
  compactMode: boolean;
  animations: boolean;
  launchAtStartup: boolean;
  autoAccept: boolean;
  autoAcceptDelaySeconds: number;
  autoSkin: boolean;
  autoPopupCompanion: boolean;
  companionAlwaysOnTop: boolean;
  notify: boolean;
};

export type RuntimeStatus = {
  wsConnected: boolean;
  connectionEpoch: number;
  sessionEpoch: number;
};

export type SavedPlayer = {
  puuid: string;
  selfPuuid: string;
  tag: string;
  note: string;
  updatedAtMs: number;
};

export type EncounteredGame = {
  gameId: number;
  puuid: string;
  selfPuuid: string;
  queueId: number;
  championId: number;
  sameTeam: boolean;
  result: string;
  playedAtMs: number;
};

export type SummonerOverview = {
  puuid: string;
  summonerId: number;
  gameName: string;
  tagLine: string;
  level: number;
  iconPath: string | null;
  privacy: string;
};

export type RankedEntry = {
  queueType: string;
  queueLabel: string;
  tier: string;
  division: string;
  ranked: boolean;
  points: number;
  wins: number;
  losses: number;
  winRate: number | null;
};

export type ChampionMasteryItem = {
  championId: number;
  championName: string;
  level: number;
  points: number;
};

export type PlayerMatchSummary = {
  id: string;
  gameId: number;
  championId: number;
  champion: string;
  result: "win" | "loss" | "remake";
  mode: string;
  queueId: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  durationSeconds: number;
  playedAtMs: number;
  items: number[];
};

export type PlayerRecentStats = {
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgKda: number | null;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  streak: number;
  score: number | null;
};

export type PlayerDetail = {
  selfPuuid: string;
  summoner: SummonerOverview;
  ranks: RankedEntry[];
  matches: PlayerMatchSummary[];
  mastery: ChampionMasteryItem[];
  stats: PlayerRecentStats;
  saved: SavedPlayer | null;
  encountered: EncounteredGame[];
  warnings: string[];
};

export type MatchParticipant = {
  puuid: string;
  gameName: string;
  tagLine: string;
  teamId: number;
  championId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  damageTaken: number;
  visionScore: number;
  win: boolean;
  items: number[];
  spell1Id: number;
  spell2Id: number;
  role: string | null;
  isSelf: boolean;
};

export type MatchDetailTeam = {
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamage: number;
  totalGold: number;
  players: MatchParticipant[];
};

export type MatchDetail = {
  gameId: number;
  mode: string;
  queueId: number;
  durationSeconds: number;
  playedAtMs: number;
  teams: MatchDetailTeam[];
};

export type OngoingMatchChip = {
  gameId: number;
  championId: number;
  result: "win" | "loss" | "remake";
  kills: number;
  deaths: number;
  assists: number;
};

export type OngoingPlayer = {
  puuid: string;
  gameName: string;
  tagLine: string;
  iconPath: string | null;
  championId: number | null;
  championName: string | null;
  position: string | null;
  isSelf: boolean;
  rankLabel: string;
  winRate: number | null;
  wins: number;
  losses: number;
  avgKda: number | null;
  streak: number;
  score: number | null;
  premadeGroup: string | null;
  tags: string[];
  saved: SavedPlayer | null;
  encounteredCount: number;
  recentGames: OngoingMatchChip[];
  privacy: string;
};

export type OngoingGameSnapshot = {
  active: boolean;
  phase: string;
  stageLabel: string;
  gameId: number | null;
  queueId: number | null;
  selfPuuid: string;
  canSendChat: boolean;
  myTeam: OngoingPlayer[];
  enemyTeam: OngoingPlayer[];
  updatedAtMs: number;
};

export type PositionKey = "default" | "top" | "jungle" | "middle" | "bottom" | "utility";

export type PositionChampions = Record<PositionKey, number[]>;

export type AutoSelectStrategy = "show-and-lock-in" | "just-show" | "lock-in-immediately";

export type AutoSelectConfig = {
  pickEnabled: boolean;
  pickStrategy: AutoSelectStrategy;
  pickDelaySeconds: number;
  showIntent: boolean;
  ignoreTeammateIntent: boolean;
  pickChampions: PositionChampions;
  banEnabled: boolean;
  banStrategy: AutoSelectStrategy;
  banDelaySeconds: number;
  banAvoidTeammateIntent: boolean;
  banChampions: PositionChampions;
  benchEnabled: boolean;
  benchDelaySeconds: number;
  benchChampions: number[];
  benchAutoAcceptTrade: boolean;
};

export type AutoSelectSnapshot = {
  config: AutoSelectConfig;
  pausedThisGame: boolean;
  revision: number;
  logs: Array<Omit<AssistantLog, "time"> & { timestampMs: number }>;
};

export type AutoGameflowConfig = {
  autoHonorEnabled: boolean;
  autoHonorStrategy: "random-teammate" | "opt-out";
  autoPlayAgainEnabled: boolean;
  autoMatchmakingEnabled: boolean;
  autoMatchmakingDelaySeconds: number;
  autoMatchmakingMinMembers: number;
  autoReconnectEnabled: boolean;
  autoInvitationMode: "off" | "accept-all" | "decline-all";
};

export type AutoGameflowSnapshot = {
  config: AutoGameflowConfig;
  revision: number;
  logs: Array<Omit<AssistantLog, "time"> & { timestampMs: number }>;
};

export type ChampionCatalogItem = {
  id: number;
  name: string;
};
