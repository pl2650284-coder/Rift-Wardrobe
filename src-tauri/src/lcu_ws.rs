use crate::discovery::Credentials;
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use rustls::{
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    pki_types::{CertificateDer, ServerName, UnixTime},
    ClientConfig, DigitallySignedStruct, Error as TlsError, SignatureScheme,
};
use serde::Serialize;
use serde_json::Value;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::{
    sync::{broadcast, Notify},
    task::JoinHandle,
};
use tokio_tungstenite::{
    connect_async_tls_with_config,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
    Connector,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuEvent {
    pub uri: String,
    pub event_type: String,
    pub data: Value,
}

#[derive(Debug)]
struct LoopbackCertVerifier;

impl ServerCertVerifier for LoopbackCertVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        match server_name {
            ServerName::IpAddress(ip) if std::net::IpAddr::from(*ip).is_loopback() => {
                Ok(ServerCertVerified::assertion())
            }
            _ => Err(TlsError::General(
                "refusing unverified TLS outside loopback".to_string(),
            )),
        }
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

pub fn parse_wamp_event(raw: &str) -> Option<LcuEvent> {
    let parsed: Value = serde_json::from_str(raw).ok()?;
    let array = parsed.as_array()?;
    if array.len() < 3 || array[0].as_i64() != Some(8) {
        return None;
    }
    let payload = array[2].as_object()?;
    let uri = payload.get("uri")?.as_str()?.to_string();
    let event_type = payload
        .get("eventType")
        .and_then(Value::as_str)
        .unwrap_or("Update")
        .to_string();
    let data = payload.get("data").cloned().unwrap_or(Value::Null);
    Some(LcuEvent {
        uri,
        event_type,
        data,
    })
}

pub fn is_high_priority_uri(uri: &str) -> bool {
    matches!(
        uri,
        "/lol-gameflow/v1/gameflow-phase"
            | "/lol-gameflow/v1/session"
            | "/lol-matchmaking/v1/ready-check"
            | "/lol-champ-select/v1/session"
            | "/lol-champ-select/v1/skin-carousel-skins"
            | "/lol-champ-select/v1/skin-selector-info"
            | "/lol-champ-select/v1/pickable-skin-ids"
            | "/lol-champ-select/v1/session/my-selection"
            | "/lol-lobby/v2/lobby"
    ) || uri.starts_with("/lol-champ-select/v1/session/")
}

fn build_loopback_tls() -> Result<ClientConfig, TlsError> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(LoopbackCertVerifier))
        .with_no_client_auth();
    Ok(config)
}

pub fn spawn_ws_listener(
    credentials: Credentials,
    event_tx: broadcast::Sender<LcuEvent>,
    wake: Arc<Notify>,
    connected_flag: Arc<AtomicBool>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let ws_scheme = if credentials.protocol == "http" {
            "ws"
        } else {
            "wss"
        };
        let url = format!("{ws_scheme}://127.0.0.1:{}/", credentials.port);
        let Ok(mut request) = url.into_client_request() else {
            return;
        };
        let auth = format!("Basic {}", STANDARD.encode(format!("riot:{}", credentials.token)));
        if let Ok(value) = HeaderValue::from_str(&auth) {
            request.headers_mut().insert("Authorization", value);
        }

        let connector = if ws_scheme == "wss" {
            match build_loopback_tls() {
                Ok(tls) => Some(Connector::Rustls(Arc::new(tls))),
                Err(_) => return,
            }
        } else {
            Some(Connector::Plain)
        };

        let Ok((mut stream, _)) =
            connect_async_tls_with_config(request, None, false, connector).await
        else {
            connected_flag.store(false, Ordering::Relaxed);
            return;
        };

        if stream
            .send(Message::Text(r#"[5, "OnJsonApiEvent"]"#.into()))
            .await
            .is_err()
        {
            connected_flag.store(false, Ordering::Relaxed);
            return;
        }

        connected_flag.store(true, Ordering::Relaxed);
        wake.notify_one();

        while let Some(frame) = stream.next().await {
            match frame {
                Ok(Message::Text(text)) => {
                    if let Some(event) = parse_wamp_event(&text) {
                        let urgent = is_high_priority_uri(&event.uri);
                        let _ = event_tx.send(event);
                        if urgent {
                            wake.notify_one();
                        }
                    }
                }
                Ok(Message::Ping(payload)) => {
                    let _ = stream.send(Message::Pong(payload)).await;
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }

        connected_flag.store(false, Ordering::Relaxed);
        wake.notify_one();
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_wamp_event_frame() {
        let raw = r#"[8,"OnJsonApiEvent",{"data":"ChampSelect","eventType":"Update","uri":"/lol-gameflow/v1/gameflow-phase"}]"#;
        let event = parse_wamp_event(raw).expect("valid frame");
        assert_eq!(event.uri, "/lol-gameflow/v1/gameflow-phase");
        assert_eq!(event.event_type, "Update");
        assert_eq!(event.data, Value::String("ChampSelect".into()));
        assert!(is_high_priority_uri(&event.uri));
    }

    #[test]
    fn ignores_non_event_and_malformed_frames() {
        assert!(parse_wamp_event("").is_none());
        assert!(parse_wamp_event("[5,\"OnJsonApiEvent\"]").is_none());
        assert!(parse_wamp_event("{\"uri\":\"/test\"}").is_none());
        assert!(!is_high_priority_uri("/lol-chat/v1/friends"));
    }
}
