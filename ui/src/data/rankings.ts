export type RankingMode = "rift" | "aram" | "classic";
export type RankingOption = { value: string; label: string };
export type RankingHero = { heroId: number; name: string; title: string; roles: string[]; iconPath: string | null; iconUrl: string | null };
export type RankingRow = RankingHero & { key: string; rank: number; tier: string | null; lane: string | null; lanes: string[]; winRate: number; pickRate: number; banRate: number | null; rankChange: string | null; counters: RankingHero[] };
export type RankingQuery = { mode: RankingMode; lane: string; tier: number | null; version: string | null };
export type OfficialRanking = { mode: RankingMode; lane: string; tier: number | null; version: string | null; statsDate: string | null; versions: RankingOption[]; tiers: RankingOption[]; rows: RankingRow[]; warnings: string[] };
