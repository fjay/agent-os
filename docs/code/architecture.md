# AgentOS 架构文档

> 生成日期：2026-05-18

---

## 1. 系统概述

AgentOS 是一个自托管的 Web UI，用于管理 Claude Code 及其他 AI Agent 的终端会话。技术栈为 **Next.js 16 + React 19 + TypeScript + SQLite (better-sqlite3)**。服务端通过自定义 HTTP 服务器（`server.ts`）启动，内置 WebSocket 终端代理和 node-pty 伪终端。

核心能力：

- 多 Agent 类型支持（Claude、Codex、Gemini、Aider、OpenCode、Cursor、Amp、Pi、OMP、Shell）
- 多面板/多标签终端布局（tmux 会话管理）
- Git Worktree 隔离开发
- MCP 协议编排（Worker 并行任务）
- 多仓库 Git 管理 + PR 自动创建
- 移动端适配 + PWA

---

## 2. 架构层次

```
+-----------------------------------------------------------+
|                     客户端 (Browser)                       |
|  +-----------+  +----------+  +-----------+  +---------+  |
|  |components |  |  hooks/  |  |  stores/  |  |contexts |  |
|  |  (UI层)   |--| (业务Hook)|--|(Valtio状态)|  |(Pane)  |  |
|  +-----+-----+  +----+-----+  +-----------+  +---------+  |
|        |              |                                    |
|  +-----+--------------+------------------------------+    |
|  |           data/ (React Query 层)                   |    |
|  |    queries + mutations + query keys                |    |
|  +---------------------+------------------------------+    |
|                        | fetch() + WebSocket             |
+------------------------+----------------------------------+
|                     服务端 (Node.js)                       |
|  +---------------------+------------------------------+    |
|  |         app/api/ (Next.js API Routes)              |    |
|  +---------------------+------------------------------+    |
|                        |                                  |
|  +---------------------+------------------------------+    |
|  |              lib/ (业务逻辑层)                      |    |
|  |  projects.ts / orchestration.ts / git.ts / ...     |    |
|  +----------+-----------------------+-----------------+    |
|             |                       |                      |
|  +----------+-----------+  +--------+--------------+       |
|  |  lib/db/ (数据层)     |  |  lib/claude/ (流式)   |       |
|  |  schema + queries    |  |  process-manager     |       |
|  +----------+-----------+  +--------+--------------+       |
|             |                       |                      |
|  +----------+-----------------------+-----------------+    |
|  |          server.ts (HTTP + WebSocket + PTY)         |    |
|  |     Next.js handler + WS /ws/terminal + pty        |    |
|  +----------------------------------------------------+    |
+-----------------------------------------------------------+
         外部:
    +--------------+    +--------------+
    |  tmux 会话    |    | MCP Server   |
    | (Agent终端)   |    | (编排协议)   |
    +--------------+    +--------------+
```

---

## 3. 入口层：server.ts

**路径**：`server.ts`

服务端入口采用**自定义 HTTP 服务器**模式，不使用 Next.js 内置服务器。

- 使用 `next()` 创建 Next.js 应用实例
- 通过 `http.createServer` 创建原生 HTTP 服务器，将请求代理给 Next.js 的 `getRequestHandler()`
- 通过 `ws` 库创建独立的 WebSocket 服务器，挂载到 `/ws/terminal` 路径
- WebSocket 升级请求通过 `server.on("upgrade")` 拦截分发

### WebSocket 终端通信协议

客户端通过 `/ws/terminal` 建立 WebSocket 连接，服务端为每个连接 `pty.spawn()` 一个新的 shell 进程。

**消息格式**（JSON）：

| 方向             | type      | 字段              | 说明                    |
| ---------------- | --------- | ----------------- | ----------------------- |
| 客户端 -> 服务端 | `input`   | `data: string`    | 原始终端输入            |
| 客户端 -> 服务端 | `resize`  | `cols, rows`      | 终端尺寸变更            |
| 客户端 -> 服务端 | `command` | `data: string`    | 发送命令（自动加 `\r`） |
| 服务端 -> 客户端 | `output`  | `data: string`    | PTY 输出数据            |
| 服务端 -> 客户端 | `exit`    | `code: number`    | 进程退出码              |
| 服务端 -> 客户端 | `error`   | `message: string` | 启动失败                |

### 生命周期管理

- `shutdown()` 函数处理 `SIGTERM` / `SIGINT`，依次关闭所有 WebSocket 客户端和 PTY 进程
- 5 秒强制退出超时

---

## 4. HTTP API 层：app/api/

**路径**：`app/api/`

所有 API 路由遵循 Next.js App Router 的文件系统约定（`route.ts` 导出 `GET/POST/PATCH/DELETE`）。

### 请求处理模式

所有 API Route 遵循统一模式：

```typescript
export async function GET/POST/PATCH/DELETE(request: NextRequest) {
  try {
    const db = getDb();
    // 业务逻辑，调用 lib/ 层函数或直接使用 queries
    return NextResponse.json({ ... });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "..." }, { status: 500 });
  }
}
```

无中间件层：没有全局的认证、日志或请求校验中间件。错误处理在各路由内部通过 try-catch 完成。

---

## 5. 业务逻辑层：lib/

**路径**：`lib/`

### 5.1 数据库层（lib/db/）

**路径**：`lib/db/`

- SQLite WAL 模式 + 10s 忙等超时
- 文件锁初始化（防并发建表）
- Prepared statement 缓存（`stmtCache` Map）
- 惰性初始化 Proxy 模式（`db` 导出为 Proxy，首次访问时才 `initDb()`）

### 5.2 实际 Agent 交互路径

Agent 并非通过 `ClaudeProcessManager` 直接管理。实际流程：

```
前端 attachToSession()
  -> buildSessionCommand() 构建 tmux 命令
    -> provider.command + provider.buildFlags() 组装 CLI 参数
  -> terminal.sendCommand(tmux命令)
    -> WebSocket -> server.ts -> pty.write()
      -> 在 PTY shell 中执行:
        tmux attach -t {session} || tmux new -s {session} -c {cwd} "{agentCmd}"
```

Agent 进程运行在 **tmux 会话**内，终端通过 WebSocket <-> PTY <-> tmux 间接交互。

### 5.3 状态检测机制

**路径**：`lib/status-detector.ts`

通过 tmux 终端内容分析会话实时状态。状态机：

```
running (GREEN) -> 检测到忙指示器 / 持续活动
  | cooldown 过期
waiting (YELLOW) -> cooldown 过期，未确认
  | acknowledge()
idle (GRAY) -> cooldown 过期，已确认
dead -> tmux 会话不存在
```

检测优先级：

1. Busy indicators（"esc to interrupt"、spinner 字符、whimsical words + "tokens"）
2. Waiting patterns（确认提示）
3. Spike detection（时间戳变化 2+/s = 持续活动）
4. Cooldown（2s 缓冲）

---

## 6. 数据访问层：data/

**路径**：`data/`

采用 TanStack React Query 封装，每个领域包含 `keys.ts`（查询键工厂）、`queries.ts`（查询/变更 Hook）、`index.ts`（统一导出）。

### 数据流模式

```
组件 (components/)
  -> hooks/useSessions.ts (业务 Hook 聚合)
    -> data/sessions/queries.ts (React Query)
      -> fetch("/api/sessions") (HTTP 请求)
        -> app/api/sessions/route.ts (API Route)
          -> lib/db/queries.ts (SQL 操作)
            -> better-sqlite3 (SQLite)
```

### 缓存策略

| 数据             | staleTime | refetchInterval   |
| ---------------- | --------- | ----------------- |
| Sessions         | 5000ms    | 10000ms           |
| Git Status       | 10000ms   | 15000ms           |
| Session Statuses | 动态      | 活跃 5s，空闲 30s |
| PR Status        | 60000ms   | -                 |

---

## 7. WebSocket 通信架构

### 终端 WebSocket（/ws/terminal）

**服务端**：`server.ts` -> `terminalWss`
**客户端**：`components/Terminal/hooks/websocket-connection.ts`

```
浏览器 xterm.js
  <-> WebSocket (/ws/terminal)
    <-> server.ts WebSocketServer
      <-> node-pty (伪终端)
        <-> shell (zsh/bash)
          <-> tmux attach / tmux new
            <-> Agent CLI (claude / codex / ...)
```

**客户端连接管理**（`websocket-connection.ts`）：

- 指数退避重连（基础 1s，最大 30s）
- 页面可见性检测（隐藏 >5s 强制重连）
- 休眠检测（时钟跳变 >30s 触发重连）
- 浏览器事件监听：`visibilitychange`、`pageshow`、`focus`、`online`

---

## 8. MCP 协议集成

**路径**：`mcp/orchestration-server.ts`

MCP Server 是独立进程，通过 `@modelcontextprotocol/sdk` 实现，使用 Stdio 传输。

```
Claude Code (任意会话)
  <-> MCP Stdio Protocol
    <-> orchestration-server.ts (MCP Server)
      <-> HTTP fetch -> AgentOS API (/api/orchestrate/*)
```

---

## 9. 状态管理架构

| 层            | 模块                         | 说明                                                   |
| ------------- | ---------------------------- | ------------------------------------------------------ |
| React Context | `contexts/PaneContext.tsx`   | 多面板布局状态，持久化到 localStorage                  |
| Valtio Store  | `stores/sessionSelection.ts` | 会话多选状态（shift 范围选择）                         |
| Valtio Store  | `stores/fileOpen.ts`         | 文件打开状态                                           |
| Valtio Store  | `stores/initialPrompt.ts`    | 待发送的初始提示词                                     |
| React Query   | `components/Providers.tsx`   | 服务端状态管理，含 `ResumeQueryRefetcher` 页面恢复重获 |

---

## 10. UI 组件层次

```
app/layout.tsx
  +-- Providers (QueryClientProvider + ThemeProvider + TooltipProvider)
        +-- app/page.tsx
              +-- PaneProvider (contexts/PaneContext.tsx)
                    +-- HomeContent
                          |-- DesktopView / MobileView
                          |     |-- Sidebar (SessionList + Projects)
                          |     |-- PaneLayout (多面板容器)
                          |     |     +-- Pane
                          |     |           |-- TerminalTabBar
                          |     |           +-- Terminal (xterm.js)
                          |     |-- GitDrawer / GitPanel
                          |     |-- ShellDrawer
                          |     +-- ConductorPanel
                          |-- NewSessionDialog
                          |-- QuickSwitcher (Cmd+K)
                          +-- NotificationSettings
```

---

## 11. 关键调用链

### 创建会话

```
[前端] NewSessionDialog 提交
  -> fetch("POST /api/sessions", body)
    -> app/api/sessions/route.ts::POST()
      -> lib/providers.ts::isValidAgentType() -- 类型校验
      -> lib/model-catalog.ts::resolveModelForAgent() -- 模型解析
      -> lib/projects.ts::getProject() -- 获取项目配置
      -> [可选] lib/worktrees.ts::createWorktree() -- 创建 Git Worktree
      -> [可选] lib/ports.ts::findAvailablePort() -- 分配端口
      -> [可选] lib/async-operations.ts::runInBackground() -- 异步环境搭建
      -> lib/db/queries.ts::createSession() -- 写入数据库
      -> NextResponse.json({ session, initialPrompt })
```

### 附加会话到终端

```
[前端] page.tsx::attachToSession()
  -> buildSessionCommand()
    -> lib/providers.ts::getProvider() -- 获取 Provider
    -> provider.buildFlags() -- 组装 CLI 参数
  -> Terminal.sendCommand(tmux attach || tmux new 命令)
    -> WebSocket -> server.ts -> pty.write() -> shell 执行 tmux 命令
```

### Git 操作

```
[前端] GitPanel::StageFiles
  -> data/git/queries.ts::useStageFiles()
    -> fetch("POST /api/git/stage", { path, files })
      -> app/api/git/stage/route.ts::POST()
        -> child_process.exec("git add ...")
        -> NextResponse.json({ success: true })
```

### Worker 编排

```
[MCP Client] Claude Code 调用 spawn_worker
  -> mcp/orchestration-server.ts::CallToolRequestHandler
    -> fetch("POST /api/orchestrate/spawn")
      -> app/api/orchestrate/spawn/route.ts::POST()
        -> lib/orchestration.ts::spawnWorker()
          -> lib/db/queries.ts::createWorkerSession() -- DB 写入
          -> lib/worktrees.ts::createWorktree() -- 创建隔离环境
          -> child_process.exec("tmux new-session ...") -- 启动 tmux
          -> tmux send-keys -- 发送任务
```

### 会话状态检测

```
[前端] data/statuses/queries.ts::useSessionStatusesQuery()
  -> fetch("GET /api/sessions/status")
    -> app/api/sessions/status/route.ts::GET()
      -> lib/status-detector.ts::statusDetector.getStatus()
        -> exec("tmux list-sessions") -- 检查会话存在
        -> exec("tmux capture-pane") -- 获取终端内容
        -> 内容模式匹配 -> 返回 running/waiting/idle/dead
```

---

## 12. 横切关注点

### 错误处理

- **API 路由层**：统一的 try-catch，返回 `{ error: string }` + 对应 HTTP 状态码
- **数据库层**：SQLite busy_timeout + WAL 模式处理并发
- **WebSocket 层**：客户端指数退避重连 + 休眠检测 + 强制重连
- **没有全局错误边界**：没有 Next.js 的 `error.tsx` 或 `global-error.tsx`

### 异步操作

`lib/async-operations.ts` 提供 fire-and-forget 模式：

- 快速 DB 操作立即执行，立即返回成功响应给客户端
- 耗时操作（worktree 清理、环境搭建）在后台执行

### 主题系统

- `next-themes` 管理暗/亮模式 + 变体（warm、purple 等）
- `lib/theme-config.ts` 定义主题配置
- `lib/terminal-themes.ts` 为 xterm.js 提供对应终端颜色
- `app/layout.tsx` 内联脚本防止闪烁

### PWA / Service Worker

- `serwist` 集成（`next.config.ts` 中 `withSerwist`）
- `app/serwist-provider.ts` + `app/sw.ts` + `public/manifest.json`

### 移动端适配

- `hooks/useViewport.ts` 检测桌面/移动
- `components/views/MobileView.tsx` 独立移动布局
- `components/mobile/SwipeSidebar.tsx` 滑动侧边栏
- 禁止面板分割（单面板模式）
- `hooks/useViewportHeight.ts` 处理虚拟键盘弹出

---

## 13. 依赖流向

```
components/ -> hooks/ -> data/ -> fetch() -> app/api/
                                                |
                                             lib/ -> lib/db/ -> SQLite
                                               |
                                        lib/providers/
                                        lib/claude/
                                        lib/orchestration.ts
                                        lib/worktrees.ts
                                        lib/status-detector.ts
                                               |
                                        child_process.exec()
                                        (tmux, git, docker, npm)

contexts/ (PaneContext) <-- components/ (面板状态)
stores/   (Valtio)      <-- components/ (选择状态)
```

**核心依赖规则**：

- `app/api/` 只依赖 `lib/`，不直接被 `lib/` 引用
- `lib/` 不依赖任何前端模块（components、hooks、data）
- `data/` 只依赖 `lib/db` 类型定义，不直接操作数据库
- `components/` 不直接调用 API，全部通过 `data/` 层或 `hooks/` 层
- `server.ts` 只负责 HTTP + WebSocket + PTY 基础设施，不包含业务逻辑

**数据流方向**：单向流动

```
用户交互 -> 组件事件 -> Hook/Store -> React Query Mutation -> fetch() -> API Route -> lib -> DB
                                                                                |
UI 更新 <- 组件重渲染 <- Hook 状态 <- React Query Cache <- fetch() <- API Route <- lib <- DB
```
