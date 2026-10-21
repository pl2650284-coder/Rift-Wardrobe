# 峡谷衣橱 · Rift Wardrobe

> 选好英雄，也选好出场的样子。

面向 Windows 国服英雄联盟的本地桌面助手，支持选人阶段已拥有皮肤的预览与切换、皮肤收藏、召唤师资料及近期战绩查看。基于 Tauri 2、Rust 和 TypeScript 构建。

这是面向 Windows 国服英雄联盟客户端的本地皮肤助手。桌面端基于 Tauri 2，关闭主窗口后会继续驻留系统托盘；不会注入进程、读写游戏内存、修改游戏文件或解锁未拥有的皮肤。

“游戏资讯”提供峡谷、海克斯大乱斗、极地大乱斗、经典模式四个官方英雄榜，支持对应模式的位置／职业筛选与排序；峡谷还支持段位和版本筛选。接口与口径见 [官方英雄榜接入说明](./docs/OFFICIAL_RANKINGS.md)。

“海克斯大乱斗 → 英雄榜”直接接入国服官网统计，点击英雄可查看符文强度与登场率、技能加点、四类出装和最佳拍档；支持品质筛选、搜索、排序和分页。数据字段、缓存与验证方法见 [海克斯数据接入说明](./docs/HEXTECH_DATA.md)。

完整范围和架构取舍见 [ARCHITECTURE.md](./ARCHITECTURE.md)，当前真实客户端验证进度见 [docs/M0_VALIDATION.md](./docs/M0_VALIDATION.md)。

## App 调试

当前统一使用 Tauri 开发模式调试完整 App。该模式会同时启动前端 Vite 开发服务器和 Rust 桌面进程，可以连接真实的国服英雄联盟客户端。

### 1. 准备环境

- Windows 10/11
- Node.js 20 或更高版本
- Rust stable（MSVC 工具链）
- Visual Studio C++ Build Tools，并安装“使用 C++ 的桌面开发”工作负载
- Microsoft Edge WebView2 Runtime
- 国服英雄联盟客户端

可先在 PowerShell 中确认主要工具已经安装：

```powershell
node -v
npm.cmd -v
rustc -V
cargo -V
```

如果 Rust 当前不是 MSVC stable 工具链，执行：

```powershell
rustup default stable-msvc
```

### 2. 安装项目依赖

在项目根目录执行一次：

```powershell
npm.cmd install
```

只有 `package.json` 或锁文件变化时才需要重新安装。

### 3. 启动完整 App

先启动并登录国服英雄联盟客户端，再在项目根目录执行：

```powershell
npm.cmd run desktop:dev
```

该命令会自动完成以下工作：

1. 从 `ui/public/app-mark.svg` 生成 Tauri 图标。
2. 在 `http://127.0.0.1:1420` 启动 Vite 开发服务器。
3. 编译并启动 Tauri 桌面应用。
4. 监视前端和 Rust 源码变化。

应用启动后会直接显示主窗口；关闭窗口不会退出程序，而是隐藏到 Windows 系统托盘。需要再次打开时，左键单击托盘图标，或右键后选择“显示助手”。

### 4. 调试前端

保持 `desktop:dev` 终端运行，修改 `ui/src/` 下的 TypeScript 或 CSS，前端会自动热更新。

在 App 窗口中按 `Ctrl + Shift + I`，或在页面上右键选择 `Inspect`，可以打开 Microsoft Edge DevTools，查看 Console、Network、DOM 和样式。

只运行 Vite 的浏览器页面不具备 Tauri IPC 和真实客户端能力，因此不要用它验证客户端连接、托盘、窗口控制或换肤功能。

### 5. 调试 Rust 与客户端连接

Rust/Tauri 代码位于 `src-tauri/src/`。保存 Rust 文件后，开发进程会重新编译；编译错误和进程错误会显示在运行 `desktop:dev` 的 PowerShell 窗口中。

需要查看 Rust panic 的完整回溯时，在同一个 PowerShell 会话中设置回溯后再启动：

```powershell
$env:RUST_BACKTRACE = '1'
npm.cmd run desktop:dev
```

如果提示 `127.0.0.1:1420` 已被占用，先关闭另一个 Vite/Tauri 调试进程，再重新执行启动命令；项目对该端口启用了严格占用检查。

验证真实客户端链路时：

1. 保持英雄联盟客户端已登录。
2. 打开托盘中的助手，确认连接状态正常。
3. 进入英雄选择并选择一个英雄。
4. 核对皮肤列表、当前皮肤和客户端界面是否一致。
5. 点击一个已拥有皮肤预览原画，再点击“确认使用”，确认客户端切换成功且 App 状态同步更新。
6. 退出英雄选择，确认旧的皮肤操作不会继续生效。

图片预览会直接复用英雄联盟客户端返回的资源路径：皮肤卡片优先读取 `tilePath`，当前选中的皮肤优先读取 `uncenteredSplashPath`，没有该字段时回退到 `splashPath`。应用通过本地 LCU 接口认证读取 `/lol-game-data/assets/...`，图片只在内存中缓存，不会复制、修改或扫描整个游戏目录，也不需要用户额外下载素材。

英雄头像和海克斯大乱斗符文图标也优先读取客户端资源。符文目录取自客户端的 `cherry-augments.json`，只匹配海克斯大乱斗条目，并结合腾讯官网的中文说明和图标目录；统计源不可用时仍可显示资源目录，但不会补造胜率或选取率。客户端未启动或缺少某张图时，英雄与符文图标会尝试腾讯官网图片，仍不可用则保留文字占位。列表按可见区域加载并缓存图片。

“个人信息”页会在客户端登录后自动读取当前召唤师的头像、Riot ID、区服、等级、排位信息、近期对局和英雄／普通皮肤资产，无需进入英雄选择。排位优先显示单双排；单双排尚未定级时，显示已有段位的灵活排位。页面可手动刷新，停留在该页时每分钟自动刷新；断开连接会清除旧账号的显示，连接恢复后重新读取。某一项暂时读取失败时，其余可用信息仍正常显示。

近期胜率、常用英雄和常用位置从客户端返回的最近 20 场对局计算，最近对局列表展示其中最新 5 场；七天趋势仅统计这批对局中最近七个自然日的有效记录，不代表完整的七天或赛季战绩。重开不计入胜率，没有明确分路的模式不计入常用位置。资产统计永久拥有的英雄和普通皮肤，不包含临时使用权、默认外观或炫彩；收藏数量来自本机收藏。浏览器预览仍使用明确标注的演示数据。

界面默认采用“沉浸衣橱”布局：深墨蓝与金色、大幅原画、左侧图标导航和底部横向皮肤带。点击皮肤先预览，点击“确认使用”后才同步到客户端；未拥有皮肤和炫彩保持只读预览。皮肤库支持按名称搜索、查看全部/仅可用/仅收藏筛选；收藏、筛选和搜索条件保存在本机。按 `/` 或 `Ctrl + F` 可以快速聚焦搜索框，焦点不在输入框时按 `R` 可立即随机应用一款可用普通皮肤。

“偏好设置”中可以开启开机自动启动，以及同时清理前端和 Rust 核心中的图片内存缓存。窗口按普通桌面应用的层级显示，切换到其他应用时会自然退到后方，不再恢复旧的置顶偏好。右上角依次提供最小化、最大化／还原和关闭按钮，关闭主窗口会隐藏到托盘。

如果图片没有显示，请先确认应用已经连接客户端并且处于英雄选择阶段；再在 DevTools 的 Console 中查看 `get_skin_image` 调用错误。资源路径失效时界面会保留占位图，重新连接客户端会清理图片缓存并重新尝试读取。

如果 App 无法连接客户端，可另开一个 PowerShell，在项目根目录执行只读诊断：

```powershell
npm.cmd run doctor
```

如果自动发现失败，可以只为当前 PowerShell 会话指定客户端目录，然后重新启动 App：

```powershell
$env:LEAGUE_INSTALL_DIR = 'G:\WeGameApps\英雄联盟'
npm.cmd run desktop:dev
```

不要把临时 LCU Token 写入 `.env`、日志、截图或版本库。

### 6. 停止调试

在系统托盘中右键“英雄联盟皮肤助手”并选择“退出”，然后回到运行 `desktop:dev` 的 PowerShell，按 `Ctrl + C` 停止开发服务器。

## 提交前验证

运行自动化测试：

```powershell
npm.cmd test
```

检查前端类型并构建静态资源：

```powershell
npm.cmd run ui:build
```

检查桌面端的解析、账号切换与部分接口失败处理：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

已登录本机英雄联盟客户端时，可单独运行只读集成验证（输出不包含账号标识或连接凭证）：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib profile::tests::live_profile_read -- --ignored --nocapture
```

生成 Windows NSIS 安装包：

```powershell
npm.cmd run desktop:build
```

`desktop:build` 会自动生成图标，不需要提前运行其他图标命令。构建前请先退出正在运行的 release 版助手；否则 Windows 会锁定 `src-tauri/target/release/lol-skin-assistant.exe`，导致覆盖失败。
