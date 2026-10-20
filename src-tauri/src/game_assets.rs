use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{redirect::Policy, Client, Url};
use std::{sync::OnceLock, time::Duration};

const MAX_ICON_BYTES: usize = 2 * 1024 * 1024;

fn allowed_icon_url(url: &str) -> bool {
    let Ok(url) = Url::parse(url) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("game.gtimg.cn")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && [
            "/images/lol/act/img/champion/",
            "/images/lol/act/img/rune/",
            "/images/lol/act/img/item/",
            "/images/lol/act/img/spell/",
            "/images/lol/act/img/passive/",
        ]
        .iter()
        .any(|prefix| {
            url.path().strip_prefix(prefix).is_some_and(|file| {
                file.ends_with(".png")
                    && file
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
            })
        })
}

pub async fn fetch_official_icon(url: &str) -> Result<String, String> {
    if !allowed_icon_url(url) {
        return Err("不支持的官方图标地址".to_string());
    }
    static HTTP: OnceLock<Client> = OnceLock::new();
    let http = HTTP.get_or_init(|| {
        Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(8))
            .build()
            .expect("create icon HTTP client")
    });
    let response = http
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_ICON_BYTES as u64)
    {
        return Err("图标超过大小限制".to_string());
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.len() > MAX_ICON_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("图标不是有效的 PNG 图片".to_string());
    }
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_only_accepts_official_champion_and_augment_images() {
        assert!(allowed_icon_url(
            "https://game.gtimg.cn/images/lol/act/img/champion/Ashe.png"
        ));
        assert!(allowed_icon_url(
            "https://game.gtimg.cn/images/lol/act/img/rune/recursion_small.png"
        ));
        for url in [
            "https://game.gtimg.cn/images/lol/act/img/item/3161.png",
            "https://game.gtimg.cn/images/lol/act/img/spell/HecarimRapidSlash.png",
            "https://game.gtimg.cn/images/lol/act/img/passive/Hecarim_Passive.png",
        ] {
            assert!(allowed_icon_url(url), "{url}");
        }
        for url in [
            "http://game.gtimg.cn/images/lol/act/img/rune/a.png",
            "https://example.com/images/lol/act/img/rune/a.png",
            "https://game.gtimg.cn/images/lol/act/img/rune/a.png?url=elsewhere",
            "https://game.gtimg.cn/images/lol/act/img/rune/../other.png",
            "https://game.gtimg.cn/images/lol/act/img/rune/a.svg",
        ] {
            assert!(!allowed_icon_url(url), "{url}");
        }
    }
}
