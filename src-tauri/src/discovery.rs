use regex::Regex;
use std::{
    collections::HashSet,
    env,
    fmt,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    time::SystemTime,
};
use thiserror::Error;

const MAX_LOG_PREFIX_BYTES: u64 = 128 * 1024;

#[derive(Clone)]
pub struct Credentials {
    pub port: u16,
    pub token: String,
    pub protocol: String,
    pub process_id: Option<u32>,
    pub source_kind: String,
    pub install_dir: Option<PathBuf>,
}

impl fmt::Debug for Credentials {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Credentials")
            .field("port", &self.port)
            .field("token", &"<redacted>")
            .field("protocol", &self.protocol)
            .field("process_id", &self.process_id)
            .field("source_kind", &self.source_kind)
            .field("install_dir", &self.install_dir)
            .finish()
    }
}

#[derive(Debug, Error)]
pub enum DiscoveryError {
    #[error("LCU_PORT and LCU_AUTH_TOKEN must be provided together")]
    PartialEnvironment,
    #[error("LCU_PORT is not a valid TCP port")]
    InvalidEnvironmentPort,
    #[error("No active League client credentials were found")]
    NotFound,
}

fn parse_port(value: &str) -> Option<u16> {
    value.parse::<u16>().ok().filter(|port| *port > 0)
}

pub fn parse_lockfile(content: &str, install_dir: Option<PathBuf>) -> Option<Credentials> {
    let parts: Vec<&str> = content.trim().split(':').collect();
    if parts.len() < 5 || parts[0].is_empty() {
        return None;
    }

    let port = parse_port(parts[2])?;
    let token = parts[3].trim();
    let protocol = parts[4].trim();
    if token.is_empty() || !matches!(protocol, "http" | "https") {
        return None;
    }

    Some(Credentials {
        port,
        token: token.to_string(),
        protocol: protocol.to_string(),
        process_id: parts[1].parse::<u32>().ok(),
        source_kind: "lockfile".to_string(),
        install_dir,
    })
}

fn read_flag(content: &str, name: &str) -> Option<String> {
    let expression = Regex::new(&format!(
        r#"--{}(?:=|\s+)(?:\"([^\"]+)\"|([^\s\"]+))"#,
        regex::escape(name)
    ))
    .ok()?;
    let captures = expression.captures(content)?;
    captures
        .get(1)
        .or_else(|| captures.get(2))
        .map(|value| value.as_str().to_string())
}

pub fn parse_ux_log(content: &str, install_dir: Option<PathBuf>) -> Option<Credentials> {
    let port = parse_port(&read_flag(content, "app-port")?)?;
    let token = read_flag(content, "remoting-auth-token")?;
    let protocol = read_flag(content, "app-protocol").unwrap_or_else(|| "https".to_string());
    if token.is_empty() || !matches!(protocol.as_str(), "http" | "https") {
        return None;
    }

    Some(Credentials {
        port,
        token,
        protocol,
        process_id: read_flag(content, "app-pid").and_then(|value| value.parse().ok()),
        source_kind: "tencent-ux-log".to_string(),
        install_dir,
    })
}

fn parse_ux_log_bytes(content: &[u8], install_dir: Option<PathBuf>) -> Option<Credentials> {
    parse_ux_log(&String::from_utf8_lossy(content), install_dir)
}

fn credentials_from_environment() -> Result<Option<Credentials>, DiscoveryError> {
    let port = env::var("LCU_PORT").ok();
    let token = env::var("LCU_AUTH_TOKEN").ok();
    match (port, token) {
        (None, None) => Ok(None),
        (Some(_), None) | (None, Some(_)) => Err(DiscoveryError::PartialEnvironment),
        (Some(port), Some(token)) => {
            let port = parse_port(&port).ok_or(DiscoveryError::InvalidEnvironmentPort)?;
            Ok(Some(Credentials {
                port,
                token,
                protocol: env::var("LCU_PROTOCOL").unwrap_or_else(|_| "https".to_string()),
                process_id: None,
                source_kind: "environment".to_string(),
                install_dir: None,
            }))
        }
    }
}

fn expand_install_directory(candidate: PathBuf) -> Vec<PathBuf> {
    let mut directories = vec![candidate.clone()];
    let is_league_client = candidate
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("LeagueClient"));
    if !is_league_client {
        directories.push(candidate.join("LeagueClient"));
    }
    directories
}

#[cfg(windows)]
fn registry_install_directories() -> Vec<PathBuf> {
    use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let keys = [
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\英雄联盟",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\英雄联盟",
    ];
    let mut directories = Vec::new();
    for key_path in keys {
        let Ok(key) = hklm.open_subkey(key_path) else {
            continue;
        };
        for value_name in ["InstallSource", "InstallLocation"] {
            if let Ok(value) = key.get_value::<String, _>(value_name) {
                if !value.trim().is_empty() {
                    directories.push(PathBuf::from(value));
                }
            }
        }
    }
    directories
}

#[cfg(not(windows))]
fn registry_install_directories() -> Vec<PathBuf> {
    Vec::new()
}

fn candidate_install_directories() -> Vec<PathBuf> {
    let mut raw = Vec::new();
    if let Ok(value) = env::var("LEAGUE_INSTALL_DIR") {
        raw.push(PathBuf::from(value));
    }
    raw.extend(registry_install_directories());
    for drive in ['C', 'D', 'E', 'F', 'G'] {
        raw.push(PathBuf::from(format!(
            r"{}:\Riot Games\League of Legends",
            drive
        )));
        raw.push(PathBuf::from(format!(
            r"{}:\WeGameApps\英雄联盟\LeagueClient",
            drive
        )));
    }

    let mut seen = HashSet::new();
    raw.into_iter()
        .flat_map(expand_install_directory)
        .filter(|path| path.is_dir())
        .filter(|path| seen.insert(path.to_string_lossy().to_lowercase()))
        .collect()
}

fn credentials_from_lockfile(install_dir: &Path) -> Option<Credentials> {
    let content = fs::read_to_string(install_dir.join("lockfile")).ok()?;
    parse_lockfile(&content, Some(install_dir.to_path_buf()))
}

fn credentials_from_tencent_logs(install_dir: &Path) -> Option<Credentials> {
    let mut logs: Vec<(PathBuf, SystemTime)> = fs::read_dir(install_dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !name.to_ascii_lowercase().ends_with("_leagueclientux.log") {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((path, modified))
        })
        .collect();
    logs.sort_by(|left, right| right.1.cmp(&left.1));

    for (path, _) in logs.into_iter().take(10) {
        let Ok(file) = File::open(path) else {
            continue;
        };
        let mut content = Vec::new();
        if file
            .take(MAX_LOG_PREFIX_BYTES)
            .read_to_end(&mut content)
            .is_ok()
        {
            if let Some(credentials) =
                parse_ux_log_bytes(&content, Some(install_dir.to_path_buf()))
            {
                return Some(credentials);
            }
        }
    }
    None
}

pub fn discover() -> Result<Credentials, DiscoveryError> {
    if let Some(credentials) = credentials_from_environment()? {
        return Ok(credentials);
    }

    let directories = candidate_install_directories();
    for directory in &directories {
        if let Some(credentials) = credentials_from_lockfile(directory) {
            return Ok(credentials);
        }
    }
    for directory in &directories {
        if let Some(credentials) = credentials_from_tencent_logs(directory) {
            return Ok(credentials);
        }
    }
    Err(DiscoveryError::NotFound)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_lockfile() {
        let credentials = parse_lockfile(
            "LeagueClient:1234:4567:temporary-secret:https",
            Some(PathBuf::from(r"C:\League")),
        )
        .expect("credentials");
        assert_eq!(credentials.port, 4567);
        assert_eq!(credentials.token, "temporary-secret");
        assert_eq!(credentials.process_id, Some(1234));
    }

    #[test]
    fn ignores_empty_tencent_lockfile() {
        assert!(parse_lockfile("", None).is_none());
    }

    #[test]
    fn parses_tencent_log_flags() {
        let content = "--region=TENCENT --remoting-auth-token=short-lived-token \
                       --app-port=11017 --app-pid=32324";
        let credentials = parse_ux_log(content, None).expect("credentials");
        assert_eq!(credentials.port, 11017);
        assert_eq!(credentials.token, "short-lived-token");
        assert_eq!(credentials.process_id, Some(32324));
    }

    #[test]
    fn parses_tencent_log_when_prefix_ends_inside_utf8_character() {
        let mut content =
            b"--remoting-auth-token=short-lived-token --app-port=11017 --app-pid=32324 "
                .to_vec();
        content.extend_from_slice(&[0xE4]);

        let credentials = parse_ux_log_bytes(&content, None).expect("credentials");
        assert_eq!(credentials.port, 11017);
        assert_eq!(credentials.process_id, Some(32324));
        assert_eq!(credentials.token, "short-lived-token");
    }
}
