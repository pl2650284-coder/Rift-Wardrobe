use crate::models::now_ms;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};

const SCHEMA_VERSION: &str = "1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedPlayer {
    pub puuid: String,
    pub self_puuid: String,
    pub tag: String,
    pub note: String,
    pub updated_at_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EncounteredGame {
    pub game_id: i64,
    pub puuid: String,
    pub self_puuid: String,
    pub queue_id: i32,
    pub champion_id: i32,
    pub same_team: bool,
    pub result: String,
    pub played_at_ms: u64,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建数据库目录: {error}"))?;
        }
        let conn = Connection::open(path).map_err(|error| format!("无法打开本地数据库: {error}"))?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, String> {
        let conn =
            Connection::open_in_memory().map_err(|error| format!("无法创建内存数据库: {error}"))?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init()?;
        Ok(db)
    }

    fn init(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "数据库锁已损坏".to_string())?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS saved_players (
                puuid TEXT NOT NULL,
                self_puuid TEXT NOT NULL,
                tag TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                updated_at_ms INTEGER NOT NULL,
                PRIMARY KEY (puuid, self_puuid)
            );

            CREATE TABLE IF NOT EXISTS encountered_games (
                game_id INTEGER NOT NULL,
                puuid TEXT NOT NULL,
                self_puuid TEXT NOT NULL,
                queue_id INTEGER NOT NULL DEFAULT 0,
                champion_id INTEGER NOT NULL DEFAULT 0,
                same_team INTEGER NOT NULL DEFAULT 1,
                result TEXT NOT NULL DEFAULT '',
                played_at_ms INTEGER NOT NULL,
                PRIMARY KEY (game_id, puuid, self_puuid)
            );

            CREATE INDEX IF NOT EXISTS idx_encountered_player
                ON encountered_games (self_puuid, puuid, played_at_ms DESC);
            ",
        )
        .map_err(|error| format!("初始化数据库表失败: {error}"))?;

        conn.execute(
            "INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', ?1)",
            params![SCHEMA_VERSION],
        )
        .map_err(|error| format!("写入数据库版本失败: {error}"))?;
        Ok(())
    }

    pub fn upsert_saved_player(
        &self,
        puuid: &str,
        self_puuid: &str,
        tag: &str,
        note: &str,
    ) -> Result<SavedPlayer, String> {
        let puuid = puuid.trim();
        let self_puuid = self_puuid.trim();
        if puuid.is_empty() || self_puuid.is_empty() {
            return Err("玩家标识不能为空".to_string());
        }
        let updated_at_ms = now_ms();
        let conn = self.conn.lock().map_err(|_| "数据库锁已损坏".to_string())?;
        conn.execute(
            "INSERT INTO saved_players (puuid, self_puuid, tag, note, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(puuid, self_puuid) DO UPDATE SET
               tag = excluded.tag,
               note = excluded.note,
               updated_at_ms = excluded.updated_at_ms",
            params![puuid, self_puuid, tag.trim(), note.trim(), updated_at_ms as i64],
        )
        .map_err(|error| format!("保存玩家标记失败: {error}"))?;

        Ok(SavedPlayer {
            puuid: puuid.to_string(),
            self_puuid: self_puuid.to_string(),
            tag: tag.trim().to_string(),
            note: note.trim().to_string(),
            updated_at_ms,
        })
    }

    pub fn delete_saved_player(&self, puuid: &str, self_puuid: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "数据库锁已损坏".to_string())?;
        conn.execute(
            "DELETE FROM saved_players WHERE puuid = ?1 AND self_puuid = ?2",
            params![puuid.trim(), self_puuid.trim()],
        )
        .map_err(|error| format!("删除玩家标记失败: {error}"))?;
        Ok(())
    }

    pub fn get_saved_player(
        &self,
        puuid: &str,
        self_puuid: &str,
    ) -> Result<Option<SavedPlayer>, String> {
        let conn = self.conn.lock().map_err(|_| "数据库锁已损坏".to_string())?;
        conn.query_row(
            "SELECT puuid, self_puuid, tag, note, updated_at_ms
             FROM saved_players WHERE puuid = ?1 AND self_puuid = ?2",
            params![puuid.trim(), self_puuid.trim()],
            |row| {
                Ok(SavedPlayer {
                    puuid: row.get(0)?,
                    self_puuid: row.get(1)?,
                    tag: row.get(2)?,
                    note: row.get(3)?,
                    updated_at_ms: row.get::<_, i64>(4)?.max(0) as u64,
                })
            },
        )
        .optional()
        .map_err(|error| format!("读取玩家标记失败: {error}"))
    }

    pub fn list_saved_players(&self, self_puuid: &str) -> Result<Vec<SavedPlayer>, String> {
        let conn = self.conn.lock().map_err(|_| "数据库锁已损坏".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT puuid, self_puuid, tag, note, updated_at_ms
                 FROM saved_players WHERE self_puuid = ?1
                 ORDER BY updated_at_ms DESC",
            )
            .map_err(|error| format!("查询标记列表失败: {error}"))?;
        let rows = stmt
            .query_map(params![self_puuid.trim()], |row| {
                Ok(SavedPlayer {
                    puuid: row.get(0)?,
                    self_puuid: row.get(1)?,
                    tag: row.get(2)?,
                    note: row.get(3)?,
                    updated_at_ms: row.get::<_, i64>(4)?.max(0) as u64,
                })
            })
            .map_err(|error| format!("读取标记列表失败: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("解析标记列表失败: {error}"))
    }

    pub fn record_encountered_game(&self, item: &EncounteredGame) -> Result<(), String> {
        if item.puuid.trim().is_empty() || item.self_puuid.trim().is_empty() || item.game_id <= 0 {
            return Err("对局记录参数无效".to_string());
        }
        let conn = self.conn.lock().map_err(|_| "数据库锁已损坏".to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO encountered_games
             (game_id, puuid, self_puuid, queue_id, champion_id, same_team, result, played_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.game_id,
                item.puuid.trim(),
                item.self_puuid.trim(),
                item.queue_id,
                item.champion_id,
                if item.same_team { 1 } else { 0 },
                item.result.trim(),
                item.played_at_ms as i64
            ],
        )
        .map_err(|error| format!("保存历史遇到记录失败: {error}"))?;
        Ok(())
    }

    pub fn list_encountered_games(
        &self,
        self_puuid: &str,
        puuid: &str,
        limit: usize,
    ) -> Result<Vec<EncounteredGame>, String> {
        let conn = self.conn.lock().map_err(|_| "数据库锁已损坏".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT game_id, puuid, self_puuid, queue_id, champion_id, same_team, result, played_at_ms
                 FROM encountered_games
                 WHERE self_puuid = ?1 AND puuid = ?2
                 ORDER BY played_at_ms DESC
                 LIMIT ?3",
            )
            .map_err(|error| format!("查询历史遇到记录失败: {error}"))?;
        let rows = stmt
            .query_map(
                params![self_puuid.trim(), puuid.trim(), limit.clamp(1, 100) as i64],
                |row| {
                    Ok(EncounteredGame {
                        game_id: row.get(0)?,
                        puuid: row.get(1)?,
                        self_puuid: row.get(2)?,
                        queue_id: row.get(3)?,
                        champion_id: row.get(4)?,
                        same_team: row.get::<_, i64>(5)? != 0,
                        result: row.get(6)?,
                        played_at_ms: row.get::<_, i64>(7)?.max(0) as u64,
                    })
                },
            )
            .map_err(|error| format!("读取历史遇到记录失败: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("解析历史遇到记录失败: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_players_isolate_accounts_and_update_cleanly() {
        let db = Database::open_in_memory().unwrap();
        let first = db
            .upsert_saved_player("p-1", "me-a", "大腿", "对线很稳")
            .unwrap();
        assert_eq!(first.tag, "大腿");
        db.upsert_saved_player("p-1", "me-b", "路人", "另一个账号的备注")
            .unwrap();

        let from_a = db.get_saved_player("p-1", "me-a").unwrap().unwrap();
        let from_b = db.get_saved_player("p-1", "me-b").unwrap().unwrap();
        assert_eq!(from_a.note, "对线很稳");
        assert_eq!(from_b.note, "另一个账号的备注");

        db.upsert_saved_player("p-1", "me-a", "黑名单", "挂机")
            .unwrap();
        let updated = db.get_saved_player("p-1", "me-a").unwrap().unwrap();
        assert_eq!(updated.tag, "黑名单");
        assert_eq!(updated.note, "挂机");

        db.delete_saved_player("p-1", "me-a").unwrap();
        assert!(db.get_saved_player("p-1", "me-a").unwrap().is_none());
        assert!(db.get_saved_player("p-1", "me-b").unwrap().is_some());
    }

    #[test]
    fn encountered_games_deduplicate_and_sort_newest_first() {
        let db = Database::open_in_memory().unwrap();
        db.record_encountered_game(&EncounteredGame {
            game_id: 1001,
            puuid: "p-2".into(),
            self_puuid: "me-a".into(),
            queue_id: 420,
            champion_id: 67,
            same_team: true,
            result: "win".into(),
            played_at_ms: 1000,
        })
        .unwrap();
        db.record_encountered_game(&EncounteredGame {
            game_id: 1002,
            puuid: "p-2".into(),
            self_puuid: "me-a".into(),
            queue_id: 450,
            champion_id: 81,
            same_team: false,
            result: "loss".into(),
            played_at_ms: 2000,
        })
        .unwrap();
        // Duplicate game_id replaces cleanly without double counting
        db.record_encountered_game(&EncounteredGame {
            game_id: 1002,
            puuid: "p-2".into(),
            self_puuid: "me-a".into(),
            queue_id: 450,
            champion_id: 81,
            same_team: false,
            result: "win".into(),
            played_at_ms: 2500,
        })
        .unwrap();

        let items = db.list_encountered_games("me-a", "p-2", 10).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].game_id, 1002);
        assert_eq!(items[0].result, "win");
        assert_eq!(items[1].game_id, 1001);
    }
}
