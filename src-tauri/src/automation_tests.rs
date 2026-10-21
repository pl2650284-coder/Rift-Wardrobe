use super::*;
use crate::discovery::Credentials;
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
    time::{Duration, Instant},
};

type Reply = (&'static str, u16, Value);
const GET_READY: &str = "GET /lol-matchmaking/v1/ready-check";
const GET_PHASE: &str = "GET /lol-gameflow/v1/gameflow-phase";
const ACCEPT: &str = "POST /lol-matchmaking/v1/ready-check/accept";

fn ready(response: &str) -> Value {
    json!({ "state": "InProgress", "playerResponse": response, "timer": 2.0 })
}

/// Real HTTP exercises the shared LCU transport, empty 204 responses, endpoint,
/// method, JSON body, and absence of additional POSTs; no League client writes.
fn server(script: Vec<Reply>) -> (LcuClient, thread::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = thread::spawn(move || {
        let mut requests = Vec::new();
        for (expected, status, value) in script {
            let deadline = Instant::now() + Duration::from_secs(5);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(Instant::now() < deadline, "missing request: {expected}");
                        thread::sleep(Duration::from_millis(2));
                    }
                    Err(error) => panic!("mock listener: {error}"),
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0; 4096];
            let header_end = loop {
                let length = stream.read(&mut buffer).unwrap();
                assert!(length > 0 && request.len() < 16384);
                request.extend_from_slice(&buffer[..length]);
                if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                    break end + 4;
                }
            };
            let headers = String::from_utf8_lossy(&request[..header_end]).to_string();
            let first = headers.lines().next().unwrap().to_string();
            assert!(
                first.starts_with(&format!("{expected} HTTP/")),
                "unexpected request: {first}"
            );
            requests.push(first);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    key.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            while request.len() - header_end < content_length {
                let length = stream.read(&mut buffer).unwrap();
                assert!(length > 0);
                request.extend_from_slice(&buffer[..length]);
            }
            if expected == ACCEPT {
                assert_eq!(
                    serde_json::from_slice::<Value>(&request[header_end..]).unwrap(),
                    json!({})
                );
            }
            if status == 0 {
                continue;
            } // Simulate a lost response after receiving the POST.
            let body = if status == 204 {
                String::new()
            } else {
                value.to_string()
            };
            write!(stream, "HTTP/1.1 {status} Mock\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
        }
        requests
    });
    let client = LcuClient::new(Credentials {
        port,
        token: "test-token".into(),
        protocol: "http".into(),
        process_id: None,
        source_kind: "test".into(),
        install_dir: None,
    })
    .unwrap();
    (client, handle)
}

fn enabled() -> AutoAccept {
    let mut automation = AutoAccept::default();
    automation.set_enabled(true).unwrap();
    automation
}

#[tokio::test]
async fn disabled_or_other_phases_never_contact_the_accept_endpoint() {
    let (client, handle) = server(vec![]);
    let mut automation = AutoAccept::default();
    automation.tick(&client, "ReadyCheck").await;
    assert!(automation.snapshot().logs.is_empty());
    automation.set_enabled(true).unwrap();
    for phase in [
        "Lobby",
        "Matchmaking",
        "ChampSelect",
        "InProgress",
        "Disconnected",
    ] {
        automation.tick(&client, phase).await;
    }
    assert_eq!(automation.attempts, 0);
    assert!(handle.join().unwrap().is_empty());
}

#[tokio::test]
async fn ready_check_sends_one_accept_and_resets_for_the_next_match() {
    let mut script = Vec::new();
    for _ in 0..2 {
        script.extend([
            (GET_READY, 200, ready("None")),
            (GET_PHASE, 200, json!("ReadyCheck")),
            (ACCEPT, 204, Value::Null),
        ]);
    }
    let (client, handle) = server(script);
    let mut automation = enabled();
    for _ in 0..5 {
        automation.tick(&client, "ReadyCheck").await;
    }
    automation.tick(&client, "Matchmaking").await;
    automation.tick(&client, "ReadyCheck").await;
    assert_eq!(
        handle
            .join()
            .unwrap()
            .iter()
            .filter(|r| r.starts_with("POST"))
            .count(),
        2
    );
    assert_eq!(
        automation
            .snapshot()
            .logs
            .iter()
            .filter(|l| l.action == "自动接受对局" && l.status == "success")
            .count(),
        2
    );
}

#[tokio::test]
async fn already_accepted_declined_finished_and_unknown_responses_never_post() {
    for value in [
        ready("Accepted"),
        ready("Declined"),
        ready("Unknown"),
        json!({ "state": "EveryoneReady", "playerResponse": "None" }),
        json!({ "state": "Invalid", "playerResponse": "None" }),
    ] {
        let (client, handle) = server(vec![(GET_READY, 200, value)]);
        let mut automation = enabled();
        automation.tick(&client, "ReadyCheck").await;
        assert_eq!(handle.join().unwrap().len(), 1);
        assert!(!automation
            .snapshot()
            .logs
            .iter()
            .any(|l| l.action == "自动接受对局" && l.status == "success"));
    }
}

#[tokio::test]
async fn missing_malformed_or_disappearing_ready_checks_never_post() {
    for (status, value) in [
        (404, json!({})),
        (200, json!({"state":"InProgress"})),
        (200, json!({"playerResponse":"None"})),
    ] {
        let (client, handle) = server(vec![(GET_READY, status, value)]);
        enabled().tick(&client, "ReadyCheck").await;
        assert_eq!(handle.join().unwrap().len(), 1);
    }
    let (client, handle) = server(vec![
        (GET_READY, 200, ready("None")),
        (GET_PHASE, 200, json!("Lobby")),
    ]);
    enabled().tick(&client, "ReadyCheck").await;
    assert_eq!(handle.join().unwrap().len(), 2);
}

#[tokio::test]
async fn lost_accept_response_is_read_back_without_a_duplicate_post() {
    let (client, handle) = server(vec![
        (GET_READY, 200, ready("None")),
        (GET_PHASE, 200, json!("ReadyCheck")),
        (ACCEPT, 0, Value::Null),
        (GET_READY, 200, ready("Accepted")),
    ]);
    let mut automation = enabled();
    automation.tick(&client, "ReadyCheck").await;
    automation.tick(&client, "ReadyCheck").await;
    assert_eq!(
        handle
            .join()
            .unwrap()
            .iter()
            .filter(|r| r.starts_with("POST"))
            .count(),
        1
    );
    assert!(automation.snapshot().logs[0].detail.contains("已核实"));
    assert_eq!(automation.snapshot().logs[0].status, "success");
}

#[tokio::test]
async fn transient_failures_wait_then_retry_only_after_reading_unanswered_state() {
    let (client, handle) = server(vec![
        (GET_READY, 200, ready("None")),
        (GET_PHASE, 200, json!("ReadyCheck")),
        (ACCEPT, 503, json!({})),
        (GET_READY, 200, ready("None")),
        (GET_READY, 200, ready("None")),
        (GET_PHASE, 200, json!("ReadyCheck")),
        (ACCEPT, 204, Value::Null),
    ]);
    let mut automation = enabled();
    automation.tick(&client, "ReadyCheck").await;
    automation.tick(&client, "ReadyCheck").await;
    assert_eq!(automation.attempts, 1); // Backoff prevents a second immediate POST.
    automation.retry_after_ms = 0;
    automation.tick(&client, "ReadyCheck").await;
    assert_eq!(
        handle
            .join()
            .unwrap()
            .iter()
            .filter(|r| r.starts_with("POST"))
            .count(),
        2
    );
    assert_eq!(automation.snapshot().logs[0].status, "success");
}

#[tokio::test]
async fn retries_are_bounded_and_disabling_stops_an_unfinished_offer() {
    let mut script = Vec::new();
    for _ in 0..3 {
        script.extend([
            (GET_READY, 200, ready("None")),
            (GET_PHASE, 200, json!("ReadyCheck")),
            (ACCEPT, 503, json!({})),
        ]);
    }
    script.push((GET_READY, 200, ready("None")));
    let (client, handle) = server(script);
    let mut automation = enabled();
    for _ in 0..4 {
        automation.retry_after_ms = 0;
        automation.tick(&client, "ReadyCheck").await;
    }
    automation.set_enabled(false).unwrap();
    automation.tick(&client, "ReadyCheck").await;
    assert_eq!(
        handle
            .join()
            .unwrap()
            .iter()
            .filter(|r| r.starts_with("POST"))
            .count(),
        3
    );
    assert!(!automation.snapshot().auto_accept);
    assert!(!automation
        .snapshot()
        .logs
        .iter()
        .any(|l| l.action == "自动接受对局" && l.status == "success"));
}

#[tokio::test]
async fn definitive_rejection_is_not_retried_and_reconnect_reads_current_response() {
    let (client, handle) = server(vec![
        (GET_READY, 200, ready("None")),
        (GET_PHASE, 200, json!("ReadyCheck")),
        (ACCEPT, 403, json!({})),
        (GET_READY, 200, ready("None")),
        (GET_READY, 200, ready("Accepted")),
    ]);
    let mut automation = enabled();
    automation.tick(&client, "ReadyCheck").await;
    automation.retry_after_ms = 0;
    automation.tick(&client, "ReadyCheck").await;
    automation.reset_offer();
    automation.tick(&client, "ReadyCheck").await;
    assert_eq!(
        handle
            .join()
            .unwrap()
            .iter()
            .filter(|r| r.starts_with("POST"))
            .count(),
        1
    );
}

#[test]
fn setting_persists_and_failed_writes_never_claim_the_toggle_changed() {
    let folder = std::env::temp_dir().join(format!(
        "rift-auto-accept-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let path = folder.join("automation.json");
    let mut automation = AutoAccept::load(path.clone());
    assert!(!automation.snapshot().configured);
    automation.set_enabled(true).unwrap();
    assert!(AutoAccept::load(path.clone()).snapshot().auto_accept);
    automation.set_enabled(false).unwrap();
    assert!(!AutoAccept::load(path.clone()).snapshot().auto_accept);
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap(),
        json!({ "autoAccept": false, "autoAcceptDelaySeconds": 0 })
    );
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(automation.set_enabled(true).is_err());
    assert!(!automation.snapshot().auto_accept);
    fs::remove_dir_all(folder).unwrap();
}

#[tokio::test]
async fn configured_delay_never_accepts_early_and_rechecks_response_at_deadline() {
    for seconds in 1..=5 {
        let (client, handle) = server(vec![
            (GET_READY, 200, ready("None")),
            (GET_READY, 200, ready("None")),
            (GET_READY, 200, ready("None")),
            (GET_PHASE, 200, json!("ReadyCheck")),
            (ACCEPT, 204, Value::Null),
        ]);
        let mut automation = enabled();
        automation.set_settings(true, seconds).unwrap();
        let start = Instant::now();
        automation.tick_at(&client, "ReadyCheck", start).await;
        automation
            .tick_at(
                &client,
                "ReadyCheck",
                start + Duration::from_millis(u64::from(seconds) * 1000 - 1),
            )
            .await;
        assert_eq!(automation.attempts, 0);
        automation
            .tick_at(
                &client,
                "ReadyCheck",
                start + Duration::from_secs(seconds.into()),
            )
            .await;
        assert_eq!(automation.attempts, 1);
        automation
            .tick_at(&client, "ReadyCheck", start + Duration::from_secs(20))
            .await;
        assert_eq!(handle.join().unwrap().len(), 5);
    }
}

#[tokio::test]
async fn manual_accept_or_decline_during_wait_cancels_automatic_accept() {
    for response in ["Accepted", "Declined"] {
        let (client, handle) = server(vec![
            (GET_READY, 200, ready("None")),
            (GET_READY, 200, ready(response)),
        ]);
        let mut automation = enabled();
        automation.set_settings(true, 3).unwrap();
        let start = Instant::now();
        automation.tick_at(&client, "ReadyCheck", start).await;
        automation
            .tick_at(&client, "ReadyCheck", start + Duration::from_secs(1))
            .await;
        automation
            .tick_at(&client, "ReadyCheck", start + Duration::from_secs(3))
            .await;
        automation.set_settings(true, 0).unwrap();
        automation
            .tick_at(&client, "ReadyCheck", start + Duration::from_secs(4))
            .await;
        assert_eq!(automation.attempts, 0);
        assert_eq!(handle.join().unwrap().len(), 2);
    }
}

#[tokio::test]
async fn disabling_or_leaving_ready_check_cancels_wait_and_next_offer_starts_fresh() {
    for disable in [true, false] {
        let (client, handle) = server(vec![
            (GET_READY, 200, ready("None")),
            (GET_READY, 200, ready("None")),
            (GET_READY, 200, ready("None")),
            (GET_PHASE, 200, json!("ReadyCheck")),
            (ACCEPT, 204, Value::Null),
        ]);
        let mut automation = enabled();
        automation.set_settings(true, 5).unwrap();
        let start = Instant::now();
        automation.tick_at(&client, "ReadyCheck", start).await;
        if disable {
            automation.set_enabled(false).unwrap();
            automation
                .tick_at(&client, "ReadyCheck", start + Duration::from_secs(5))
                .await;
            automation.set_enabled(true).unwrap();
        } else {
            automation
                .tick_at(&client, "Matchmaking", start + Duration::from_secs(5))
                .await;
        }
        automation
            .tick_at(&client, "ReadyCheck", start + Duration::from_secs(10))
            .await;
        assert_eq!(automation.attempts, 0);
        automation
            .tick_at(&client, "ReadyCheck", start + Duration::from_secs(15))
            .await;
        assert_eq!(handle.join().unwrap().len(), 5);
    }
}

#[tokio::test]
async fn editing_delay_adjusts_existing_deadline_without_restarting_wait_or_retries() {
    let (client, handle) = server(vec![
        (GET_READY, 200, ready("None")),
        (GET_READY, 200, ready("None")),
        (GET_READY, 200, ready("None")),
        (GET_PHASE, 200, json!("ReadyCheck")),
        (ACCEPT, 503, json!({})),
        (GET_READY, 200, ready("None")),
        (GET_PHASE, 200, json!("ReadyCheck")),
        (ACCEPT, 204, Value::Null),
    ]);
    let mut automation = enabled();
    automation.set_settings(true, 3).unwrap();
    let start = Instant::now();
    automation.tick_at(&client, "ReadyCheck", start).await;
    automation.set_settings(true, 5).unwrap();
    automation
        .tick_at(&client, "ReadyCheck", start + Duration::from_secs(3))
        .await;
    assert_eq!(automation.attempts, 0);
    automation.set_settings(true, 2).unwrap();
    automation
        .tick_at(&client, "ReadyCheck", start + Duration::from_secs(3))
        .await;
    assert_eq!(automation.attempts, 1);
    automation.retry_after_ms = 0;
    automation
        .tick_at(&client, "ReadyCheck", start + Duration::from_secs(4))
        .await;
    assert_eq!(automation.attempts, 2);
    automation.set_settings(true, 0).unwrap();
    automation
        .tick_at(&client, "ReadyCheck", start + Duration::from_secs(6))
        .await;
    assert_eq!(handle.join().unwrap().len(), 8);
}

#[test]
fn delay_persists_migrates_old_files_and_rejects_out_of_range_without_changes() {
    let folder = std::env::temp_dir().join(format!(
        "rift-auto-delay-{}-{}",
        std::process::id(),
        now_ms()
    ));
    fs::create_dir_all(&folder).unwrap();
    let path = folder.join("automation.json");
    fs::write(&path, br#"{"autoAccept":true}"#).unwrap();
    let mut automation = AutoAccept::load(path.clone());
    assert!(automation.snapshot().auto_accept);
    assert_eq!(automation.snapshot().auto_accept_delay_seconds, 0);
    automation.set_settings(true, 5).unwrap();
    let saved = fs::read(&path).unwrap();
    assert_eq!(
        AutoAccept::load(path.clone())
            .snapshot()
            .auto_accept_delay_seconds,
        5
    );
    let revision = automation.snapshot().revision;
    assert!(automation.set_settings(false, 6).is_err());
    assert!(automation.snapshot().auto_accept);
    assert_eq!(automation.snapshot().revision, revision);
    assert_eq!(fs::read(&path).unwrap(), saved);
    automation.set_enabled(false).unwrap();
    assert_eq!(
        AutoAccept::load(path.clone())
            .snapshot()
            .auto_accept_delay_seconds,
        5
    );
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(automation.set_settings(false, 1).is_err());
    assert_eq!(automation.snapshot().auto_accept_delay_seconds, 5);
    fs::remove_dir_all(folder).unwrap();
}
