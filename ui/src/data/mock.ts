import type { AppPreferences, AugmentStat, AssistantLog, ChampionStat, ProfileSummary } from "./types";

export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: "dark",
  accentColor: "gold",
  compactMode: false,
  animations: true,
  launchAtStartup: false,
  autoAccept: false,
  autoAcceptDelaySeconds: 0,
  autoSkin: false,
  notify: true,
};

export const demoProfile: ProfileSummary = {
  summoner: { name: "薇恩玩家", tag: "CN1", region: "峡谷之巅", level: 186, avatarLabel: "VN", avatarUrl: null },
  rank: { queue: "单双排", tier: "钻石", division: "III", ranked: true, points: 74, winRate: 58, wins: 42, losses: 30 },
  recentGames: [
    { id: "g-1", champion: "薇恩", championShort: "VN", result: "win", mode: "排位赛", kda: "9 / 2 / 7", cs: 213, duration: "28:14", playedAt: "12 分钟前" },
    { id: "g-2", champion: "卡莎", championShort: "KA", result: "win", mode: "排位赛", kda: "11 / 4 / 5", cs: 187, duration: "31:42", playedAt: "2 小时前" },
    { id: "g-3", champion: "霞", championShort: "XR", result: "loss", mode: "排位赛", kda: "3 / 7 / 9", cs: 164, duration: "26:08", playedAt: "昨天" },
    { id: "g-4", champion: "厄运小姐", championShort: "MF", result: "win", mode: "极地大乱斗", kda: "18 / 6 / 22", cs: 92, duration: "19:36", playedAt: "昨天" },
    { id: "g-5", champion: "卢锡安", championShort: "LU", result: "win", mode: "排位赛", kda: "7 / 3 / 11", cs: 198, duration: "29:51", playedAt: "2 天前" },
  ],
  matchHistoryAvailable: true,
  matchCount: 5,
  recentWinRate: 80,
  recentWinRateSampleSize: 5,
  preferredRole: { name: "下路", share: 100, sampleSize: 4 },
  assets: { championsOwned: 92, championsTotal: 171, skinsOwned: 146, skinsTotal: 812, favorites: 18 },
  trends: { labels: ["周一", "周二", "周三", "周四", "周五", "周六", "今天"], winRate: [48, 55, 52, 61, 58, 67, 72], kda: [2.4, 2.9, 2.6, 3.4, 3.1, 3.8, 4.2], sampleSize: 5, averageWinRate: 80, averageKda: 4.2 },
  topChampions: [
    { name: "薇恩", role: "下路", games: 18, winRate: 67, color: "#7bcfb0" },
    { name: "卡莎", role: "下路", games: 14, winRate: 64, color: "#8f9ee9" },
    { name: "霞", role: "下路", games: 9, winRate: 56, color: "#d99bca" },
  ],
  source: "demo",
  updatedAtMs: 0,
  warnings: [],
};

export const demoChampions: ChampionStat[] = [
  { id: 1, name: "厄塔汗", shortName: "ET", role: "上路", tier: "S+", winRate: 54.8, pickRate: 7.2, banRate: 18.1, kda: 3.4, trend: "up", color: "#d6a36f", source: "demo" },
  { id: 2, name: "卡莎", shortName: "KA", role: "下路", tier: "S", winRate: 53.9, pickRate: 12.4, banRate: 9.8, kda: 3.7, trend: "up", color: "#8f9ee9", source: "demo" },
  { id: 3, name: "翠神", shortName: "IV", role: "打野", tier: "S", winRate: 53.5, pickRate: 4.1, banRate: 6.3, kda: 3.9, trend: "flat", color: "#79c9a0", source: "demo" },
  { id: 4, name: "丽桑卓", shortName: "LI", role: "中路", tier: "A+", winRate: 52.8, pickRate: 6.8, banRate: 7.4, kda: 3.1, trend: "up", color: "#9cabe9", source: "demo" },
  { id: 5, name: "蕾欧娜", shortName: "LE", role: "辅助", tier: "A+", winRate: 52.4, pickRate: 9.5, banRate: 8.9, kda: 2.8, trend: "down", color: "#e0b476", source: "demo" },
  { id: 6, name: "薇恩", shortName: "VN", role: "下路", tier: "A", winRate: 51.9, pickRate: 5.8, banRate: 4.2, kda: 3.2, trend: "flat", color: "#7bcfb0", source: "demo" },
  { id: 7, name: "奥恩", shortName: "OR", role: "上路", tier: "A", winRate: 51.4, pickRate: 5.4, banRate: 5.1, kda: 2.9, trend: "down", color: "#b78d72", source: "demo" },
];

export const demoAugments: AugmentStat[] = [
  { id: "a-1", name: "终极刷新", description: "终极技能急速与额外伤害提升。", winRate: 61.8, pickRate: 12.6, sampleSize: 18420, tier: "S", color: "#d8af70", source: "demo" },
  { id: "a-2", name: "珠光护手", description: "技能暴击并强化法术伤害。", winRate: 60.4, pickRate: 8.9, sampleSize: 12940, tier: "S", color: "#d58aba", source: "demo" },
  { id: "a-3", name: "魔法飞弹", description: "技能命中后发射追踪魔法飞弹。", winRate: 59.7, pickRate: 14.1, sampleSize: 20580, tier: "A+", color: "#8aa4e5", source: "demo" },
  { id: "a-4", name: "不倒翁", description: "生命值较低时获得护盾和韧性。", winRate: 57.9, pickRate: 10.4, sampleSize: 15110, tier: "A", color: "#7fc6a5", source: "demo" },
  { id: "a-5", name: "雪球大作战", description: "雪球命中后获得额外突进与伤害。", winRate: 56.8, pickRate: 18.7, sampleSize: 27100, tier: "A", color: "#8eb7d9", source: "demo" },
];

export const demoAssistantLogs: AssistantLog[] = [
  { id: "l-1", time: "14:32:08", action: "换肤完成", detail: "薇恩 · 觅心猎手", status: "success" },
  { id: "l-2", time: "14:31:54", action: "检测到选人", detail: "召唤师峡谷 · 薇恩", status: "success" },
  { id: "l-3", time: "14:28:41", action: "自动接受对局", detail: "已确认进入房间", status: "success" },
];
