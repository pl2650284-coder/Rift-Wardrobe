# 英雄联盟皮肤助手

这是面向 Windows 国服英雄联盟客户端的本地皮肤助手。桌面端基于 Tauri 2，关闭主窗口后会继续驻留系统托盘；不会注入进程、读写游戏内存、修改游戏文件或解锁未拥有的皮肤。

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

应用启动后主窗口默认隐藏。请在 Windows 系统托盘中找到“英雄联盟皮肤助手”，左键单击图标，或右键后选择“显示助手”。

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
5. 选择一个已拥有皮肤，确认客户端切换成功且 App 状态同步更新。
6. 退出英雄选择，确认旧的皮肤操作不会继续生效。

图片预览会直接复用英雄联盟客户端返回的资源路径：皮肤卡片优先读取 `tilePath`，当前选中的皮肤优先读取 `uncenteredSplashPath`，没有该字段时回退到 `splashPath`。应用通过本地 LCU 接口认证读取 `/lol-game-data/assets/...`，图片只在内存中缓存，不会复制、修改或扫描整个游戏目录，也不需要用户额外下载素材。

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

生成 Windows NSIS 安装包：

```powershell
npm.cmd run desktop:build
```

`desktop:build` 会自动生成图标，不需要提前运行其他图标命令。
