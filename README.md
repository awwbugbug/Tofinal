# ToFinal

<p align="center">
  <img src="docs/demo.gif" alt="ToFinal in action" width="720" />
</p>

<p align="center">
  <img src="docs/screenshot-light.png" alt="ToFinal in light mode" width="49%" />
  <img src="docs/screenshot-dark.png" alt="ToFinal in dark mode" width="49%" />
</p>

<p align="center"><em>Light and dark themes · 亮色与暗色主题</em></p>

<p align="center">
  <b>Language / 语言：</b> click to expand · 点击展开 — <b>English</b> (default) · <b>简体中文</b>
</p>

<!-- ─────────────────────────────  ENGLISH  ───────────────────────────── -->
<details open>
<summary><b>🌐 English</b></summary>

<br>

A local-first, minimal desktop task manager built with [Tauri](https://tauri.app/) and React. Your tasks live entirely on your machine — no accounts, no sync, no network.

> **Note:** ToFinal is developed and tested on Windows 11. It is built with Tauri, so macOS/Linux builds may work but are currently untested. Some features (launching bound `.lnk` shortcuts, screen capture) are Windows-focused.

### Features

- **Two modes** — a full Normal window, and a compact always-on-top **Desktop Pin** widget for a quick glance at what's next.
- **Task stacks** — group related tasks into iOS-notification-style stacks; drag to reorder, merge, or split; single/double-click to expand.
- **Time views** — Today (with an overdue section, a progress ring, and completed-today), browse any date through a self-drawn calendar, plus All / Important / Pinned filters.
- **Planned dates & priorities** — a segmented date control (None / Today / Tomorrow / pick-a-date) and normal / important / urgent priorities.
- **Markdown notes** — write task notes in Markdown with an expandable read-only preview.
- **Attachments** — add images by OS drag-and-drop, clipboard paste, or file picker; capture full-screen or region screenshots with a built-in editor; preview in a lightbox.
- **App binding** — attach an app (`.exe` or `.lnk`) to a task and launch it in one click.
- **Trash & undo** — soft-delete with an undo toast; trashed tasks auto-purge after 30 days.
- **Local persistence** — tasks are stored in a local SQLite database, auto-backed-up on each launch (last 7 kept), and exportable to JSON or Markdown.
- **Polish** — light / dark / system themes, per-theme animated backdrops (a silver starfield in dark, an aurora in light), a glass UI with adjustable panel translucency, keyboard shortcuts, completion celebrations, and Simplified Chinese / English localization.

### Install

Download the latest installer from the [Releases](https://github.com/awwbugbug/Tofinal/releases) page.

> The installer is currently **unsigned**, so Windows SmartScreen may show an "unknown publisher" warning on first run. Choose **More info → Run anyway**.

### Build from source

Prerequisites:

- [Node.js](https://nodejs.org/) 18+ and npm
- The [Rust toolchain](https://www.rust-lang.org/tools/install)
- Tauri's platform prerequisites — on Windows this is just WebView2, which ships with Windows 11. See the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/).

```bash
npm install          # install frontend dependencies
npm run tauri dev    # run the app in development
npm run tauri build  # produce a release installer (in src-tauri/target/release/bundle)
```

### Development

```bash
npm test             # run the frontend test suite (Vitest)
npx tsc --noEmit     # type-check
```

### Data & storage

All data is stored locally under your user profile:

- **Database & backups:** `%APPDATA%\com.tofinal.tasks\` (SQLite file + rolling backups)
- **Attachments:** `%APPDATA%\com.tofinal.tasks\attachments\`

Nothing is sent anywhere. To move to a new machine, copy that folder.

### Security & privacy

ToFinal is offline and account-free. A few native capabilities are worth understanding:

- **App binding** launches executables you explicitly attach to a task. The app only runs paths you configure yourself; it validates that the path exists and is an `.exe` or `.lnk` before launching, and never runs anything through a shell.
- **Screenshot capture** grabs your screen(s) only when you invoke it, and the image stays local (saved as a task attachment).
- **Filesystem access** is scoped to the app's own data folder (attachments and backups) — the app cannot read arbitrary files.

### Known limitations

- Not a true desktop-embedded widget — Desktop Pin mode is a compact, always-on-top window.
- No database-corruption recovery UI yet (a damaged database currently falls back to an empty state).
- Task changes are written as full snapshots rather than row-level updates (simple and safe at typical task counts).
- Normal-mode column widths are not persisted between sessions.

### Tech stack

Tauri v2 · React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand · SQLite (`tauri-plugin-sql`)

### License

[MIT](LICENSE) © awwbugbug

</details>

<!-- ─────────────────────────────  简体中文  ───────────────────────────── -->
<details>
<summary><b>🌐 简体中文</b></summary>

<br>

一款本地优先、极简的桌面任务管理器，使用 [Tauri](https://tauri.app/) 与 React 构建。你的任务完全保存在本机 —— 无账号、无同步、无网络。

> **说明：** ToFinal 在 Windows 11 上开发与测试。它基于 Tauri 构建，因此 macOS/Linux 版本或许可以运行，但目前未经测试。部分功能（启动绑定的 `.lnk` 快捷方式、屏幕截图）以 Windows 为主。

### 功能特性

- **双模式** —— 完整的普通窗口模式，以及紧凑、始终置顶的 **桌面贴片** 小组件，随时一瞥接下来要做什么。
- **任务栈** —— 把相关任务分组成 iOS 通知样式的堆叠；拖拽可重排、合并或拆分；单击/双击展开。
- **时间视图** —— 今天（含逾期区、进度环、今日已完成），通过自绘日历浏览任意日期，另有 全部 / 重要 / 固定 筛选。
- **计划日期与优先级** —— 分段式日期控件（无 / 今天 / 明天 / 选择日期）与 普通 / 重要 / 紧急 优先级。
- **Markdown 备注** —— 用 Markdown 编写任务备注，并可展开只读预览。
- **附件** —— 通过系统拖放、剪贴板粘贴或文件选择器添加图片；用内置编辑器截取全屏或区域截图；在灯箱中预览。
- **应用绑定** —— 为任务绑定一个应用（`.exe` 或 `.lnk`），一键启动。
- **回收站与撤销** —— 软删除并附带撤销提示；回收站中的任务 30 天后自动清除。
- **本地持久化** —— 任务存储于本地 SQLite 数据库，每次启动自动备份（保留最近 7 份），并可导出为 JSON 或 Markdown。
- **细节打磨** —— 亮色 / 暗色 / 跟随系统 主题、双主题动态背景（暗色银河星空、亮色极光）、带可调「面板透光度」的玻璃质感界面、键盘快捷键、完成庆祝动画，以及简体中文 / English 本地化。

### 安装

从 [Releases](https://github.com/awwbugbug/Tofinal/releases) 页面下载最新的安装包。

> 当前安装包**未签名**，因此 Windows SmartScreen 首次运行时可能提示“未知发布者”。选择 **更多信息 → 仍要运行**。

### 从源码构建

前置要求：

- [Node.js](https://nodejs.org/) 18+ 与 npm
- [Rust 工具链](https://www.rust-lang.org/tools/install)
- Tauri 的平台前置依赖 —— 在 Windows 上仅需 WebView2，Windows 11 已自带。参见 [Tauri 前置依赖指南](https://tauri.app/start/prerequisites/)。

```bash
npm install          # 安装前端依赖
npm run tauri dev    # 以开发模式运行应用
npm run tauri build  # 生成发布安装包（位于 src-tauri/target/release/bundle）
```

### 开发

```bash
npm test             # 运行前端测试套件（Vitest）
npx tsc --noEmit     # 类型检查
```

### 数据与存储

所有数据都保存在你的用户目录下：

- **数据库与备份：** `%APPDATA%\com.tofinal.tasks\`（SQLite 文件 + 滚动备份）
- **附件：** `%APPDATA%\com.tofinal.tasks\attachments\`

不会向任何地方发送数据。要迁移到新机器，复制该文件夹即可。

### 安全与隐私

ToFinal 离线运行、无需账号。有几项原生能力值得了解：

- **应用绑定** 只会启动你显式绑定到任务的可执行文件。应用仅运行你自己配置的路径；启动前会校验路径存在且为 `.exe` 或 `.lnk`，且从不经由 shell 运行任何内容。
- **截图捕获** 仅在你主动触发时抓取屏幕，图片保留在本地（作为任务附件保存）。
- **文件系统访问** 被限制在应用自身的数据文件夹内（附件与备份）—— 应用无法读取任意文件。

### 已知限制

- 并非真正嵌入桌面的小组件 —— 桌面贴片模式是一个紧凑、始终置顶的窗口。
- 尚无数据库损坏恢复界面（损坏的数据库目前会回退到空状态）。
- 任务变更以整体快照写入，而非行级更新（在常见任务量下简单且安全）。
- 普通模式下的栏宽不会在会话之间保存。

### 技术栈

Tauri v2 · React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand · SQLite（`tauri-plugin-sql`）

### 许可证

[MIT](LICENSE) © awwbugbug

</details>
