# 官方英雄榜接入

入口：游戏资讯 → 峡谷／极地大乱斗／经典模式。海克斯大乱斗沿用独立的英雄榜与英雄详情。

## 官方接口

统计接口前缀：`https://mlol.qt.qq.com/go/battle_info/odp_proxy/`。

| 模式 | 接口 | 参数与口径 |
| --- | --- | --- |
| 峡谷 | lol_101strategy | itier、version_id、lane、sort_metric=1、sort_order=2；一条记录对应一个英雄及位置 |
| 极地大乱斗 | aram_hero_overview | dtstatdate 从中国时区前一日起查询最近可用统计日；职业在完整榜单上筛选 |
| 经典模式 | jade_hero_rank | lane、itier=255；读取 tierscore_top_hero_list |
| 经典位置资料 | jade_hero_lane | itype=255；保留经典英雄的位置目录 |

峡谷的版本列表取自 `https://mlol.qt.qq.com/go/database/versionlist?zone=lol&from=h5`，默认最新版本，界面提供当前及上一版本；段位与官网当前 17 项一致，默认翡翠+。位置使用全部、上路、打野、中路、下路、辅助。最新版本尚未发布统计时，仅默认版本请求可回退官网上一版本，并明确显示实际版本和说明；手动选择的版本不被替换。

极地大乱斗提供综合、坦克、战士、法师、刺客、射手、辅助筛选。跨日后统计尚未发布时，最多检查最近五个统计日，并明确标注实际日期。该接口未提供 T 级与禁用率，界面不生成这些列。

经典模式提供位置筛选，使用独立的 `jade/js/heroes_index.js` 英雄目录与 `jade/championsHeadICON/{id}.png` 图片。保留 60000 段原始英雄 ID，不通过减去偏移量映射到峡谷英雄，也不使用峡谷数据代替经典统计。最新查询为空时，最多检查前五日；日期回退只适用于空结果，网络错误会直接展示以便重试。

## 数据处理

Rust 的 rankings.rs 校验并解析官方 JSON，经 `get_official_ranking` 命令传给 TypeScript 的 rankings-view.ts。请求无需账号或客户端凭据。

- 峡谷 datadetails 与经典 tierscore_top_hero_list 的胜率、登场率、禁用率已是百分数，直接保留。极地大乱斗 listcollect 使用 0–1 比例，乘以 100。
- 峡谷按英雄 ID＋位置生成记录键，保留同一英雄的多个位置。
- T0–T4 读取官方原值，不重新计算；排名变化和反制英雄也保留原始字段。
- 峡谷和经典模式显示响应的 dtstatdate，包括历史版本的实际统计日；极地大乱斗显示成功返回数据的接口查询日。
- 请求参数限制在对应模式支持的段位、位置与合法官网版本内；不支持的筛选不发送请求。
- 各模式、位置、段位、版本的缓存相互独立。界面保留每个模式的筛选和搜索状态，并丢弃同一模式中落后于最新筛选的响应。
- 统计缓存十五分钟，最多三十二个组合；英雄目录缓存六小时。刷新可绕过缓存。网络错误、空数据和结构变化会明确提示，不回退到演示或第三方数据。
- 图片经过腾讯域名、PNG 目录、大小和文件头校验。峡谷与极地头像优先读取客户端；经典头像使用其专属官方目录。

## 验证

固定官方样本：test/fixtures/official-rankings.json。采集于 2026-10-20：峡谷全部 218 条英雄位置记录、上路 50 条；极地大乱斗 173 位英雄；经典模式 77 位英雄、上路 30 位。旧版本样本保留 16.19 的实际统计日 2026-10-11。

常规检查：`npm test`、`npm run ui:build`、`cargo test --manifest-path src-tauri/Cargo.toml --lib`。

联网检查：`cargo test --manifest-path src-tauri/Cargo.toml rankings::tests::live_three_mode_rankings -- --ignored --nocapture`，覆盖三个模式与位置、段位、版本组合。

本次范围是三个模式的英雄榜；海克斯英雄详情继续使用 [原有独立数据链路](./HEXTECH_DATA.md)。
