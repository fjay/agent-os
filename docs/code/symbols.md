# AgentOS 关键符号索引

> 生成日期：2026-05-18

---

## server.ts 入口层

| 名称           | 类型                     | 所在文件    | 职责                                    |
| -------------- | ------------------------ | ----------- | --------------------------------------- |
| `app`          | 变量 (`NextApp`)         | `server.ts` | Next.js 应用实例                        |
| `server`       | 变量 (`http.Server`)     | `server.ts` | HTTP 服务器，承载 Next.js 页面和 API    |
| `terminalWss`  | 变量 (`WebSocketServer`) | `server.ts` | WebSocket 服务器，路径 `/ws/terminal`   |
| `activePtys`   | 变量 (`Set<pty.IPty>`)   | `server.ts` | 所有活跃的伪终端进程集合                |
| `shuttingDown` | 变量 (`boolean`)         | `server.ts` | 防止重复关闭的标志                      |
| `shutdown`     | 函数                     | `server.ts` | 处理 SIGTERM/SIGINT，关闭所有 WS 和 PTY |

---

## 数据库层（lib/db/）

| 名称            | 类型                    | 所在文件               | 职责                                                        |
| --------------- | ----------------------- | ---------------------- | ----------------------------------------------------------- |
| `initDb`        | 函数                    | `lib/db/index.ts`      | 数据库初始化（建表 + 迁移），单例模式                       |
| `getDb`         | 函数                    | `lib/db/index.ts`      | 获取数据库实例                                              |
| `db`            | 变量 (`Database Proxy`) | `lib/db/index.ts`      | 惰性初始化数据库代理，首次访问时调用 `initDb()`             |
| `createSchema`  | 函数                    | `lib/db/schema.ts`     | 执行 DDL 建表语句（8 张表 + 索引）                          |
| `runMigrations` | 函数                    | `lib/db/migrations.ts` | 执行增量迁移（13 个迁移）                                   |
| `migrations`    | 常量 (`Migration[]`)    | `lib/db/migrations.ts` | 迁移定义数组                                                |
| `queries`       | 对象                    | `lib/db/queries.ts`    | 预编译 SQL 语句缓存（~60 个 prepared statement）            |
| `stmtCache`     | 变量 (`Map`)            | `lib/db/queries.ts`    | Prepared statement 缓存 Map                                 |
| `Session`       | 类型                    | `lib/db/types.ts`      | 会话记录类型（含 fork、agent_type、model、worktree 等字段） |
| `Project`       | 类型                    | `lib/db/types.ts`      | 项目记录类型                                                |
| `Message`       | 类型                    | `lib/db/types.ts`      | 消息记录类型                                                |
| `ToolCall`      | 类型                    | `lib/db/types.ts`      | 工具调用记录类型                                            |
| `DevServer`     | 类型                    | `lib/db/types.ts`      | 开发服务器实例类型                                          |
| `Group`         | 类型                    | `lib/db/types.ts`      | 分组类型（旧版）                                            |

---

## Agent Provider 系统

| 名称                   | 类型                                   | 所在文件                    | 职责                                                                         |
| ---------------------- | -------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `AgentProvider`        | 接口                                   | `lib/providers/registry.ts` | Provider 接口定义（id、name、command、buildFlags、状态模式等）               |
| `getProvider`          | 函数                                   | `lib/providers.ts`          | 根据 AgentType 获取 Provider 实例                                            |
| `isValidAgentType`     | 函数                                   | `lib/providers.ts`          | 校验 Agent 类型是否有效                                                      |
| `providers`            | 常量 (`Map<AgentType, AgentProvider>`) | `lib/providers/registry.ts` | 10 种 Agent Provider 注册表                                                  |
| `AgentType`            | 类型                                   | `lib/providers/registry.ts` | Agent 类型枚举（claude/codex/opencode/gemini/aider/cursor/amp/pi/omp/shell） |
| `resolveModelForAgent` | 函数                                   | `lib/model-catalog.ts`      | 为指定 Agent 类型解析模型名称                                                |

---

## Claude 流式通信（lib/claude/）

| 名称                   | 类型 | 所在文件                        | 职责                                                   |
| ---------------------- | ---- | ------------------------------- | ------------------------------------------------------ |
| `ClaudeProcessManager` | 类   | `lib/claude/process-manager.ts` | Claude CLI 进程生命周期管理、WebSocket 广播、DB 持久化 |
| `StreamParser`         | 类   | `lib/claude/stream-parser.ts`   | NDJSON 流解析器，将 Claude CLI 输出转换为客户端事件    |
| `StreamMessage`        | 类型 | `lib/claude/types.ts`           | Claude CLI 输出的流式消息类型                          |
| `ClientEvent`          | 类型 | `lib/claude/types.ts`           | 转换后的客户端事件类型                                 |

**注意**：`ClaudeProcessManager` 当前代码存在但未在 API 路由中被直接调用。实际 Agent 交互通过 tmux 会话间接完成。

---

## 编排系统（lib/orchestration.ts）

| 名称                | 类型 | 所在文件               | 职责                                                   |
| ------------------- | ---- | ---------------------- | ------------------------------------------------------ |
| `spawnWorker`       | 函数 | `lib/orchestration.ts` | 创建 Worker 会话、创建 worktree、启动 tmux + Agent CLI |
| `getWorkers`        | 函数 | `lib/orchestration.ts` | 获取指定指挥者的所有 Worker 及实时状态                 |
| `getWorkerOutput`   | 函数 | `lib/orchestration.ts` | 通过 `tmux capture-pane` 获取 Worker 终端输出          |
| `sendToWorker`      | 函数 | `lib/orchestration.ts` | 通过 `tmux send-keys` 向 Worker 发送消息               |
| `completeWorker`    | 函数 | `lib/orchestration.ts` | 标记 Worker 为 completed                               |
| `killWorker`        | 函数 | `lib/orchestration.ts` | 终止 tmux 会话并可选清理 worktree                      |
| `getWorkersSummary` | 函数 | `lib/orchestration.ts` | 统计 Worker 状态汇总                                   |

---

## 项目管理（lib/projects.ts）

| 名称                           | 类型 | 所在文件          | 职责                                   |
| ------------------------------ | ---- | ----------------- | -------------------------------------- |
| `createProject`                | 函数 | `lib/projects.ts` | 创建项目，含 dev server 配置           |
| `getAllProjectsWithDevServers` | 函数 | `lib/projects.ts` | 获取所有项目及其 dev server 配置       |
| `updateProject`                | 函数 | `lib/projects.ts` | 更新项目设置                           |
| `deleteProject`                | 函数 | `lib/projects.ts` | 删除项目，会话归入 Uncategorized       |
| `detectDevServers`             | 函数 | `lib/projects.ts` | 自动检测 npm scripts 和 Docker Compose |
| `addProjectRepository`         | 函数 | `lib/projects.ts` | 添加多仓库关联                         |

---

## Git 模块

| 名称                    | 类型 | 所在文件                | 职责                   |
| ----------------------- | ---- | ----------------------- | ---------------------- |
| `getRepoName`           | 函数 | `lib/git.ts`            | 获取仓库名称           |
| `checkBranch`           | 函数 | `lib/git.ts`            | 检查分支状态           |
| `slugify`               | 函数 | `lib/git.ts`            | 字符串转 slug          |
| `parseGitStatus`        | 函数 | `lib/git-status.ts`     | 解析 `git status` 输出 |
| `parseGitLog`           | 函数 | `lib/git-history.ts`    | 解析 `git log` 输出    |
| `getMultiRepoGitStatus` | 函数 | `lib/multi-repo-git.ts` | 聚合多仓库 Git 状态    |

---

## Worktree 管理（lib/worktrees.ts）

| 名称                | 类型 | 所在文件           | 职责                                                            |
| ------------------- | ---- | ------------------ | --------------------------------------------------------------- |
| `createWorktree`    | 函数 | `lib/worktrees.ts` | 创建 Git Worktree + 新分支（基础目录 `~/.agent-os/worktrees/`） |
| `deleteWorktree`    | 函数 | `lib/worktrees.ts` | 删除 Worktree + 可选删分支                                      |
| `isAgentOSWorktree` | 函数 | `lib/worktrees.ts` | 判断路径是否为 AgentOS 管理的 worktree                          |

---

## 状态检测（lib/status-detector.ts）

| 名称             | 类型 | 所在文件                 | 职责                                      |
| ---------------- | ---- | ------------------------ | ----------------------------------------- |
| `statusDetector` | 对象 | `lib/status-detector.ts` | 会话状态检测单例，提供 `getStatus()` 方法 |

---

## PR 管理

| 名称                | 类型 | 所在文件               | 职责                   |
| ------------------- | ---- | ---------------------- | ---------------------- |
| `generatePRContent` | 函数 | `lib/pr-generation.ts` | 自动生成 PR 标题和描述 |
| `createPR`          | 函数 | `lib/pr.ts`            | PR 创建逻辑            |

---

## Dev Server 管理（lib/dev-servers.ts）

| 名称                   | 类型   | 所在文件             | 职责                               |
| ---------------------- | ------ | -------------------- | ---------------------------------- |
| 各 dev server 管理函数 | 函数集 | `lib/dev-servers.ts` | 开发服务器启停、端口检测、进程监控 |

---

## MCP 编排服务器（mcp/orchestration-server.ts）

| 名称                  | 类型     | 所在文件                      | 职责                 |
| --------------------- | -------- | ----------------------------- | -------------------- |
| `spawn_worker`        | MCP 工具 | `mcp/orchestration-server.ts` | 创建 Worker 会话     |
| `list_workers`        | MCP 工具 | `mcp/orchestration-server.ts` | 列出所有 Worker      |
| `get_worker_output`   | MCP 工具 | `mcp/orchestration-server.ts` | 获取 Worker 终端输出 |
| `send_to_worker`      | MCP 工具 | `mcp/orchestration-server.ts` | 向 Worker 发送消息   |
| `complete_worker`     | MCP 工具 | `mcp/orchestration-server.ts` | 标记 Worker 完成     |
| `kill_worker`         | MCP 工具 | `mcp/orchestration-server.ts` | 终止 Worker          |
| `get_workers_summary` | MCP 工具 | `mcp/orchestration-server.ts` | Worker 状态汇总      |

---

## 数据层（data/）

| 名称                      | 类型 | 所在文件                   | 职责             |
| ------------------------- | ---- | -------------------------- | ---------------- |
| `useSessionsQuery`        | Hook | `data/sessions/queries.ts` | 会话列表查询     |
| `useCreateSession`        | Hook | `data/sessions/queries.ts` | 创建会话         |
| `useDeleteSession`        | Hook | `data/sessions/queries.ts` | 删除会话         |
| `useRenameSession`        | Hook | `data/sessions/queries.ts` | 重命名会话       |
| `useForkSession`          | Hook | `data/sessions/queries.ts` | 分叉会话         |
| `useSummarizeSession`     | Hook | `data/sessions/queries.ts` | 会话摘要         |
| `useProjectsQuery`        | Hook | `data/projects/queries.ts` | 项目列表查询     |
| `useCreateProject`        | Hook | `data/projects/queries.ts` | 创建项目         |
| `useDeleteProject`        | Hook | `data/projects/queries.ts` | 删除项目         |
| `useGitStatus`            | Hook | `data/git/queries.ts`      | Git 状态查询     |
| `useCommitHistory`        | Hook | `data/git/queries.ts`      | 提交历史查询     |
| `useStageFiles`           | Hook | `data/git/queries.ts`      | 暂存文件         |
| `useCommitAndPush`        | Hook | `data/git/queries.ts`      | 提交并推送       |
| `useCreatePR`             | Hook | `data/git/queries.ts`      | 创建 PR          |
| `useSessionStatusesQuery` | Hook | `data/statuses/queries.ts` | 会话状态批量轮询 |

---

## 状态管理层

| 名称                   | 类型    | 所在文件                     | 职责                                     |
| ---------------------- | ------- | ---------------------------- | ---------------------------------------- |
| `PaneContext`          | Context | `contexts/PaneContext.tsx`   | 多面板布局上下文（分屏、标签、会话附加） |
| `PaneProvider`         | 组件    | `contexts/PaneContext.tsx`   | PaneContext Provider                     |
| `selectionStore`       | Store   | `stores/sessionSelection.ts` | 会话多选状态（Valtio）                   |
| `selectionActions`     | 对象    | `stores/sessionSelection.ts` | 选择操作方法                             |
| `fileOpen`             | Store   | `stores/fileOpen.ts`         | 文件打开状态（Valtio）                   |
| `initialPrompt`        | Store   | `stores/initialPrompt.ts`    | 待发送的初始提示词（Valtio）             |
| `ResumeQueryRefetcher` | 组件    | `components/Providers.tsx`   | 监听页面恢复事件，重新获取活跃查询       |
| `ThemeClassHandler`    | 组件    | `components/Providers.tsx`   | 同步主题 CSS class                       |

---

## UI 关键组件

| 名称                    | 类型              | 所在文件                                                 | 职责                                      |
| ----------------------- | ----------------- | -------------------------------------------------------- | ----------------------------------------- |
| `Terminal`              | 组件 (forwardRef) | `components/Terminal/index.tsx`                          | xterm.js 终端组件主体                     |
| `useTerminalConnection` | Hook              | `components/Terminal/hooks/useTerminalConnection.ts`     | 终端初始化 + WebSocket 连接管理           |
| `WebSocketConnection`   | 类/函数           | `components/Terminal/hooks/websocket-connection.ts`      | WebSocket 底层连接逻辑（重连、休眠检测）  |
| `SessionCard`           | 组件              | `components/SessionCard.tsx`                             | 会话卡片（状态、模型、操作菜单）          |
| `SessionList`           | 组件              | `components/SessionList/`                                | 侧边栏会话列表                            |
| `NewSessionDialog`      | 组件              | `components/NewSessionDialog/`                           | 新建会话对话框                            |
| `useNewSessionForm`     | Hook              | `components/NewSessionDialog/hooks/useNewSessionForm.ts` | 新建会话表单逻辑                          |
| `DesktopView`           | 组件              | `components/views/DesktopView.tsx`                       | 桌面端布局                                |
| `MobileView`            | 组件              | `components/views/MobileView.tsx`                        | 移动端布局                                |
| `GitPanel`              | 组件              | `components/GitPanel/`                                   | Git 状态面板                              |
| `ConductorPanel`        | 组件              | `components/ConductorPanel.tsx`                          | 多 Agent 编排 UI                          |
| `FileExplorer`          | 组件              | `components/FileExplorer/`                               | 文件浏览 + 编辑器                         |
| `QuickSwitcher`         | 组件              | `components/QuickSwitcher.tsx`                           | Cmd+K 快速切换器                          |
| `Providers`             | 组件              | `components/Providers.tsx`                               | 全局 Provider 包装（QueryClient + Theme） |
| `PaneLayout`            | 组件              | `components/PaneLayout.tsx`                              | 多面板布局容器                            |
| `ChatView`              | 组件              | `components/ChatView.tsx`                                | 聊天消息列表                              |
| `DiffViewer`            | 组件              | `components/DiffViewer/`                                 | Diff 查看器                               |
| `PRCreationModal`       | 组件              | `components/PRCreationModal.tsx`                         | PR 创建模态框                             |

---

## 关键 Hooks

| 名称                      | 类型 | 所在文件                                                  | 职责                               |
| ------------------------- | ---- | --------------------------------------------------------- | ---------------------------------- |
| `useSessions`             | Hook | `hooks/useSessions.ts`                                    | 会话列表加载、创建、删除、状态轮询 |
| `useProjects`             | Hook | `hooks/useProjects.ts`                                    | 项目列表加载                       |
| `useDevServersManager`    | Hook | `hooks/useDevServersManager.ts`                           | dev server 启停、监控              |
| `useNotifications`        | Hook | `hooks/useNotifications.ts`                               | 浏览器通知、声音提醒               |
| `useSessionStatuses`      | Hook | `hooks/useSessionStatuses.ts`                             | 会话状态批量查询                   |
| `useViewport`             | Hook | `hooks/useViewport.ts`                                    | 桌面/移动视口检测                  |
| `useViewportHeight`       | Hook | `hooks/useViewportHeight.ts`                              | CSS 视口高度（处理移动端键盘）     |
| `useSpeechRecognition`    | Hook | `hooks/useSpeechRecognition.ts`                           | Web Speech API 语音识别            |
| `useFileDrop`             | Hook | `hooks/useFileDrop.ts`                                    | 文件拖放上传处理                   |
| `useSessionListMutations` | Hook | `components/SessionList/hooks/useSessionListMutations.ts` | 会话列表变更操作                   |
| `useNewProjectForm`       | Hook | `components/Projects/hooks/useNewProjectForm.ts`          | 新建项目表单逻辑                   |
