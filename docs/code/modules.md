# AgentOS 模块描述

> 包名：`@saadnvd1/agent-os` v0.2.1
> 技术栈：Next.js 16 + React 19 + TypeScript + SQLite (better-sqlite3)
> 生成日期：2026-05-18

---

## 入口模块

| 模块       | 路径                    | 职责                                                                            | 关键文件                |
| ---------- | ----------------------- | ------------------------------------------------------------------------------- | ----------------------- |
| 服务器入口 | `server.ts`             | 自定义 Node.js HTTP + WebSocket 服务器，集成 Next.js 请求处理与 node-pty 进程池 | `server.ts`             |
| 根布局     | `app/layout.tsx`        | 字体、主题初始化、Providers、Toaster、viewport 配置                             | `app/layout.tsx`        |
| 主页面     | `app/page.tsx`          | 客户端主页面，管理全局状态，分发桌面/移动视图                                   | `app/page.tsx`          |
| CLI 入口   | `scripts/agent-os`      | npm bin 命令，启动整个应用                                                      | `scripts/agent-os`      |
| Tauri 入口 | `src-tauri/src/main.rs` | Rust 启动 Node.js 服务器并嵌入 WebView 窗口                                     | `src-tauri/src/main.rs` |

---

## API 路由模块（app/api/）

共 10 个 API 路由模块，约 55 个端点。

| 模块           | 路径                   | 职责                                              | 关键文件                                                            |
| -------------- | ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| 会话 API       | `app/api/sessions/`    | 会话 CRUD、fork、消息、状态、初始化脚本、PR、摘要 | `[id]/route.ts`、`route.ts`、`[id]/messages`、`[id]/fork`、`status` |
| 项目 API       | `app/api/projects/`    | 项目管理、仓库、dev server 配置                   | `route.ts`、`[id]/route.ts`、`detect`、`[id]/dev-servers`           |
| Git API        | `app/api/git/`         | Git 状态、暂存、提交、推送、PR、克隆、历史、diff  | `status`、`stage`、`commit`、`push`、`pr`、`clone`、`history`       |
| 编排 API       | `app/api/orchestrate/` | 多 Agent 编排，派生/管理工作节点                  | `spawn`、`workers`、`workers/[id]`                                  |
| dev server API | `app/api/dev-servers/` | 开发服务器启停、日志、重启、检测                  | `route.ts`、`[id]/route.ts`、`[id]/logs`、`detect`                  |
| 文件 API       | `app/api/files/`       | 文件读写、上传、内容获取                          | `route.ts`、`content/route.ts`、`upload-temp`                       |
| 代码搜索 API   | `app/api/code-search/` | 代码搜索                                          | `route.ts`、`available`                                             |
| 命令执行 API   | `app/api/exec/`        | 通用命令执行                                      | `route.ts`                                                          |
| tmux API       | `app/api/tmux/`        | tmux 会话管理                                     | `kill-all`、`rename`                                                |
| 分组 API       | `app/api/groups/`      | 分组管理（旧版，已被 projects 替代）              | `route.ts`、`[...path]/route.ts`                                    |

---

## 核心业务逻辑模块（lib/）

### 数据库层（lib/db/）

| 模块         | 路径      | 职责                                             | 关键文件                                                           |
| ------------ | --------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| 数据库初始化 | `lib/db/` | 数据库单例管理、Schema、迁移、SQL 查询、类型定义 | `index.ts`、`schema.ts`、`migrations.ts`、`queries.ts`、`types.ts` |

共 8 张表：`sessions`、`projects`、`messages`、`tool_calls`、`groups`、`dev_servers`、`project_dev_servers`、`project_repositories`、`_migrations`。

### Agent Provider 系统

| 模块            | 路径                        | 职责                                                     | 关键文件                    |
| --------------- | --------------------------- | -------------------------------------------------------- | --------------------------- |
| Provider 定义   | `lib/providers.ts`          | Agent 提供者实例定义、API Key 配置、模型列表、提供者检测 | `lib/providers.ts`          |
| Provider 注册表 | `lib/providers/registry.ts` | 10 种 Agent 类型的声明式注册（Claude、Codex、Gemini 等） | `lib/providers/registry.ts` |

### Claude 流式通信

| 模块            | 路径          | 职责                                                              | 关键文件                                             |
| --------------- | ------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Claude 进程管理 | `lib/claude/` | Claude CLI 流式 NDJSON 输出解析、进程生命周期管理、WebSocket 广播 | `process-manager.ts`、`stream-parser.ts`、`types.ts` |

### 其他 lib 模块

| 模块            | 路径                             | 职责                                                            | 关键文件                         |
| --------------- | -------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| 项目管理        | `lib/projects.ts`                | 项目 CRUD、仓库关联、dev server 配置、自动检测                  | `lib/projects.ts`                |
| 多 Agent 编排   | `lib/orchestration.ts`           | Conductor-Worker 模式编排、工作节点生命周期管理                 | `lib/orchestration.ts`           |
| Git 基础操作    | `lib/git.ts`                     | 分支检查、仓库名、slugify                                       | `lib/git.ts`                     |
| Git 状态解析    | `lib/git-status.ts`              | `git status` 输出解析                                           | `lib/git-status.ts`              |
| Git 历史查询    | `lib/git-history.ts`             | `git log` 输出解析                                              | `lib/git-history.ts`             |
| 多仓库 Git      | `lib/multi-repo-git.ts`          | 多仓库 Git 状态聚合                                             | `lib/multi-repo-git.ts`          |
| Worktree 管理   | `lib/worktrees.ts`               | Git Worktree 创建/删除/判断                                     | `lib/worktrees.ts`               |
| 状态检测        | `lib/status-detector.ts`         | 通过 tmux 终端内容分析会话实时状态（running/waiting/idle/dead） | `lib/status-detector.ts`         |
| dev server 管理 | `lib/dev-servers.ts`             | 开发服务器启停、端口检测、进程监控                              | `lib/dev-servers.ts`             |
| PR 生成         | `lib/pr-generation.ts`           | PR 标题/描述自动生成                                            | `lib/pr-generation.ts`           |
| PR 管理         | `lib/pr.ts`                      | PR 创建与管理                                                   | `lib/pr.ts`                      |
| 面板布局        | `lib/panes.ts`                   | 面板分割/关闭/恢复数据结构和算法                                | `lib/panes.ts`                   |
| 通知            | `lib/notifications.ts`           | 浏览器通知管理                                                  | `lib/notifications.ts`           |
| 环境配置        | `lib/env-setup.ts`               | Worktree 环境搭建（.env 复制、npm install）                     | `lib/env-setup.ts`               |
| 端口分配        | `lib/ports.ts`                   | 可用端口查找与分配                                              | `lib/ports.ts`                   |
| MCP 配置        | `lib/mcp-config.ts`              | MCP 配置文件生成                                                | `lib/mcp-config.ts`              |
| 文件操作        | `lib/files.ts`                   | 文件系统读写操作                                                | `lib/files.ts`                   |
| 文件上传        | `lib/file-upload.ts`             | 临时文件上传处理                                                | `lib/file-upload.ts`             |
| Diff 解析       | `lib/diff-parser.ts`             | Diff 格式解析                                                   | `lib/diff-parser.ts`             |
| 代码搜索        | `lib/code-search.ts`             | 代码搜索逻辑                                                    | `lib/code-search.ts`             |
| 模型目录        | `lib/model-catalog.ts`           | 可用模型列表和解析                                              | `lib/model-catalog.ts`           |
| 终端主题        | `lib/terminal-themes.ts`         | xterm.js 终端主题配置                                           | `lib/terminal-themes.ts`         |
| UI 主题         | `lib/theme-config.ts`            | UI 主题配置                                                     | `lib/theme-config.ts`            |
| 异步操作        | `lib/async-operations.ts`        | 后台异步任务执行器（fire-and-forget）                           | `lib/async-operations.ts`        |
| Banner          | `lib/banner.ts`                  | Agent 启动 banner 显示                                          | `lib/banner.ts`                  |
| 客户端会话注册  | `lib/client/session-registry.ts` | 客户端会话注册                                                  | `lib/client/session-registry.ts` |
| Query 客户端    | `lib/query-client.ts`            | TanStack Query 客户端配置                                       | `lib/query-client.ts`            |
| 会话路径        | `lib/session-path.ts`            | 会话工作目录解析                                                | `lib/session-path.ts`            |

---

## 数据访问模块（data/）

TanStack React Query 封装层，每个领域包含 `keys.ts`（查询键）、`queries.ts`（查询/变更 Hook）、`index.ts`（导出）。

| 模块            | 路径                 | 职责                                               | 关键文件                |
| --------------- | -------------------- | -------------------------------------------------- | ----------------------- |
| 会话数据        | `data/sessions/`     | 会话 CRUD + 搬移 + 摘要                            | `queries.ts`、`keys.ts` |
| 项目数据        | `data/projects/`     | 项目 CRUD + 检测                                   | `queries.ts`、`keys.ts` |
| Git 数据        | `data/git/`          | Git 全流程操作（状态、历史、diff、暂存、提交、PR） | `queries.ts`、`keys.ts` |
| dev server 数据 | `data/dev-servers/`  | 开发服务器查询和变更                               | `queries.ts`、`keys.ts` |
| 文件数据        | `data/files/`        | 文件浏览和内容查询                                 | `queries.ts`、`keys.ts` |
| 代码搜索数据    | `data/code-search/`  | 代码搜索查询                                       | `queries.ts`、`keys.ts` |
| 状态数据        | `data/statuses/`     | 会话状态批量轮询                                   | `queries.ts`、`keys.ts` |
| 分组数据        | `data/groups/`       | 分组变更（旧版）                                   | `mutations.ts`          |
| 仓库数据        | `data/repositories/` | 多仓库管理                                         | `queries.ts`、`keys.ts` |

---

## UI 组件模块（components/）

### 终端组件

| 模块 | 路径                   | 职责                                              | 关键文件                                                                       |
| ---- | ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| 终端 | `components/Terminal/` | xterm.js 终端组件、WebSocket 连接、搜索、触摸滚动 | `index.tsx`、`hooks/useTerminalConnection.ts`、`hooks/websocket-connection.ts` |

### 会话相关组件

| 模块           | 路径                                   | 职责                                          | 关键文件                    |
| -------------- | -------------------------------------- | --------------------------------------------- | --------------------------- |
| 会话卡片       | `components/SessionCard.tsx`           | 显示会话状态、模型、工作目录、操作菜单        | `SessionCard.tsx`           |
| 会话列表       | `components/SessionList/`              | 分组显示、选择工具栏、批量操作                | `index.tsx`                 |
| 新建会话对话框 | `components/NewSessionDialog/`         | 项目选择、Agent 选择、worktree 配置、高级设置 | `index.tsx`                 |
| 会话头部       | `components/SessionHeader.tsx`         | 会话头部信息展示                              | `SessionHeader.tsx`         |
| 会话预览       | `components/SessionPreviewPopover.tsx` | 会话预览弹窗                                  | `SessionPreviewPopover.tsx` |
| 聊天视图       | `components/ChatView.tsx`              | 消息列表渲染                                  | `ChatView.tsx`              |
| 聊天消息       | `components/ChatMessage.tsx`           | 单条聊天消息                                  | `ChatMessage.tsx`           |
| 消息输入       | `components/MessageInput.tsx`          | 消息输入框                                    | `MessageInput.tsx`          |
| 工具调用展示   | `components/ToolCallDisplay.tsx`       | 工具调用结果展示                              | `ToolCallDisplay.tsx`       |

### 编排组件

| 模块         | 路径                            | 职责                | 关键文件             |
| ------------ | ------------------------------- | ------------------- | -------------------- |
| 指挥者面板   | `components/ConductorPanel.tsx` | 多 Agent 编排 UI    | `ConductorPanel.tsx` |
| 工作节点卡片 | `components/WorkerCard.tsx`     | Worker 节点信息卡片 | `WorkerCard.tsx`     |

### Git 组件

| 模块        | 路径                     | 职责                         | 关键文件    |
| ----------- | ------------------------ | ---------------------------- | ----------- |
| Git 面板    | `components/GitPanel/`   | 变更列表、提交表单、提交历史 | `index.tsx` |
| Git 抽屉    | `components/GitDrawer/`  | 文件编辑对话框               | `index.tsx` |
| Diff 查看器 | `components/DiffViewer/` | 统一 diff 展示               | `index.tsx` |

### 文件与项目组件

| 模块            | 路径                             | 职责                               | 关键文件              |
| --------------- | -------------------------------- | ---------------------------------- | --------------------- |
| 文件浏览器      | `components/FileExplorer/`       | 文件树、编辑器、Markdown/HTML 渲染 | `index.tsx`           |
| 文件选择器      | `components/FilePicker.tsx`      | 文件选择                           | `FilePicker.tsx`      |
| 目录选择器      | `components/DirectoryPicker.tsx` | 目录选择                           | `DirectoryPicker.tsx` |
| 项目管理        | `components/Projects/`           | 项目卡片、新建/设置对话框          | `index.tsx`           |
| dev server 组件 | `components/DevServers/`         | 卡片、日志模态框、启动对话框       | `index.tsx`           |
| 代码搜索        | `components/CodeSearch/`         | 代码搜索结果展示                   | `index.tsx`           |

### 布局与导航组件

| 模块       | 路径                           | 职责                       | 关键文件                            |
| ---------- | ------------------------------ | -------------------------- | ----------------------------------- |
| 面板系统   | `components/Pane/`             | 面板容器、标签栏、骨架屏   | `index.tsx`                         |
| 面板布局   | `components/PaneLayout.tsx`    | 多面板布局容器             | `PaneLayout.tsx`                    |
| 视图层     | `components/views/`            | 桌面/移动视图分发          | `DesktopView.tsx`、`MobileView.tsx` |
| 移动端组件 | `components/mobile/`           | 滑动侧边栏等移动端专用组件 | `SwipeSidebar.tsx`                  |
| Shell 抽屉 | `components/ShellDrawer.tsx`   | Shell 操作抽屉             | `ShellDrawer.tsx`                   |
| 快速切换器 | `components/QuickSwitcher.tsx` | 类 Cmd+K 快速切换          | `QuickSwitcher.tsx`                 |
| 侧边栏底部 | `components/SidebarFooter.tsx` | 侧边栏底部区域             | `SidebarFooter.tsx`                 |

### 通用组件

| 模块           | 路径                                  | 职责                                      | 关键文件                       |
| -------------- | ------------------------------------- | ----------------------------------------- | ------------------------------ |
| 主题切换       | `components/ThemeToggle.tsx`          | 暗/亮/变体主题切换                        | `ThemeToggle.tsx`              |
| PR 创建模态框  | `components/PRCreationModal.tsx`      | PR 创建交互                               | `PRCreationModal.tsx`          |
| 通知设置       | `components/NotificationSettings.tsx` | 通知配置                                  | `NotificationSettings.tsx`     |
| tmux 会话      | `components/TmuxSessions.tsx`         | tmux 会话列表                             | `TmuxSessions.tsx`             |
| Providers      | `components/Providers.tsx`            | 全局 Provider 包装（React Query + 主题）  | `Providers.tsx`                |
| 抽象 UI 组件   | `components/a/`                       | 项目封装的基础组件（AButton、ADialog 等） | `ABadge.tsx`、`AButton.tsx` 等 |
| shadcn/ui 组件 | `components/ui/`                      | shadcn/ui 基础组件库                      | `button.tsx`、`dialog.tsx` 等  |

---

## Hooks 模块（hooks/）

| 模块            | 路径                            | 职责                               | 关键文件                  |
| --------------- | ------------------------------- | ---------------------------------- | ------------------------- |
| 会话 Hook       | `hooks/useSessions.ts`          | 会话列表加载、创建、删除、状态轮询 | `useSessions.ts`          |
| 项目 Hook       | `hooks/useProjects.ts`          | 项目列表加载                       | `useProjects.ts`          |
| dev server Hook | `hooks/useDevServersManager.ts` | 开发服务器启停、监控               | `useDevServersManager.ts` |
| 通知 Hook       | `hooks/useNotifications.ts`     | 浏览器通知、声音提醒               | `useNotifications.ts`     |
| 文件编辑器 Hook | `hooks/useFileEditor.ts`        | 文件编辑器状态管理                 | `useFileEditor.ts`        |
| 文件拖放 Hook   | `hooks/useFileDrop.ts`          | 文件拖放上传处理                   | `useFileDrop.ts`          |
| 目录浏览 Hook   | `hooks/useDirectoryBrowser.ts`  | 目录浏览                           | `useDirectoryBrowser.ts`  |
| 会话状态 Hook   | `hooks/useSessionStatuses.ts`   | 会话状态批量查询                   | `useSessionStatuses.ts`   |
| 分组 Hook       | `hooks/useGroups.ts`            | 分组管理                           | `useGroups.ts`            |
| 语音识别 Hook   | `hooks/useSpeechRecognition.ts` | Web Speech API 语音识别            | `useSpeechRecognition.ts` |
| 视口 Hook       | `hooks/useViewport.ts`          | 桌面/移动视口检测                  | `useViewport.ts`          |
| 视口高度 Hook   | `hooks/useViewportHeight.ts`    | CSS 视口高度计算（处理移动端键盘） | `useViewportHeight.ts`    |

---

## 状态管理模块（stores/）

| 模块     | 路径                      | 职责                               | 关键文件                          |
| -------- | ------------------------- | ---------------------------------- | --------------------------------- |
| 会话选择 | `stores/`                 | 会话多选状态管理（shift 范围选择） | `sessionSelection.ts`、`index.ts` |
| 文件状态 | `stores/fileOpen.ts`      | 文件打开状态                       | `fileOpen.ts`                     |
| 初始提示 | `stores/initialPrompt.ts` | 待发送的初始提示词（用于新会话）   | `initialPrompt.ts`                |

---

## 上下文模块（contexts/）

| 模块       | 路径        | 职责                                                          | 关键文件          |
| ---------- | ----------- | ------------------------------------------------------------- | ----------------- |
| 面板上下文 | `contexts/` | 多面板布局状态，含分屏、标签、会话附加，持久化到 localStorage | `PaneContext.tsx` |

---

## MCP 编排模块（mcp/）

| 模块           | 路径   | 职责                                                 | 关键文件                  |
| -------------- | ------ | ---------------------------------------------------- | ------------------------- |
| MCP 编排服务器 | `mcp/` | 独立 MCP Server 进程，允许会话成为指挥者派发工作节点 | `orchestration-server.ts` |

---

## 脚本模块（scripts/）

| 模块        | 路径                                     | 职责                  | 关键文件                 |
| ----------- | ---------------------------------------- | --------------------- | ------------------------ |
| CLI 命令    | `scripts/lib/commands.sh`                | CLI 命令定义          | `commands.sh`            |
| 环境检查    | `scripts/lib/prerequisites.sh`           | 环境依赖检查          | `prerequisites.sh`       |
| AI CLI 检测 | `scripts/lib/ai-clis.sh`                 | AI CLI 工具检测与安装 | `ai-clis.sh`             |
| 安装脚本    | `scripts/setup.sh`、`scripts/install.sh` | 初始化与安装          | `setup.sh`、`install.sh` |

---

## Tauri 桌面端模块（src-tauri/）

| 模块     | 路径         | 职责                                | 关键文件                                       |
| -------- | ------------ | ----------------------------------- | ---------------------------------------------- |
| Tauri 壳 | `src-tauri/` | Rust 启动器 + 多平台图标 + 构建配置 | `src/main.rs`、`tauri.conf.json`、`Cargo.toml` |
