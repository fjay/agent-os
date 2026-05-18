# AgentOS HTTP 端点与 WebSocket 协议

> 最后更新：2026-05-18

---

## 一、架构概览

- **HTTP 入口**：`server.ts`（自定义 server，监听 `0.0.0.0:3011`）
- **Next.js 路由**：`app/api/` 目录（App Router API Routes）
- **WebSocket 终端**：`ws://host/ws/terminal`（`server.ts` 中定义）
- **WebSocket Claude Chat**：`ws://host/ws/claude/:sessionId`（前端发起，当前 server.ts 未注册路由）
- **MCP 编排服务器**：`mcp/orchestration-server.ts`（Stdio 传输，调用 HTTP API）
- **数据库**：SQLite（`agent-os.db`），通过 `lib/db/` 操作
- **认证**：无应用层认证机制

---

## 二、HTTP 端点列表

### 2.1 会话管理（Sessions）— 18 个端点

| 方法   | 路径                                | 用途                                                          | 文件路径                                        |
| ------ | ----------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| GET    | `/api/sessions`                     | 列出所有会话和分组                                            | `app/api/sessions/route.ts`                     |
| POST   | `/api/sessions`                     | 创建新会话（支持 worktree、tmux、初始提示等）                 | `app/api/sessions/route.ts`                     |
| GET    | `/api/sessions/[id]`                | 获取单个会话详情                                              | `app/api/sessions/[id]/route.ts`                |
| PATCH  | `/api/sessions/[id]`                | 更新会话（名称、状态、工作目录、系统提示、分组路径）          | `app/api/sessions/[id]/route.ts`                |
| DELETE | `/api/sessions/[id]`                | 删除会话（级联删除 worker、后台清理 worktree）                | `app/api/sessions/[id]/route.ts`                |
| GET    | `/api/sessions/[id]/messages`       | 获取会话所有消息                                              | `app/api/sessions/[id]/messages/route.ts`       |
| POST   | `/api/sessions/[id]/messages`       | 添加消息到会话                                                | `app/api/sessions/[id]/messages/route.ts`       |
| POST   | `/api/sessions/[id]/send-keys`      | 向 tmux 会话发送文本（通过 load-buffer/paste-buffer）         | `app/api/sessions/[id]/send-keys/route.ts`      |
| POST   | `/api/sessions/[id]/summarize`      | 总结会话并可选创建新会话（用 Claude CLI 生成摘要）            | `app/api/sessions/[id]/summarize/route.ts`      |
| POST   | `/api/sessions/[id]/fork`           | 复刻会话（复制消息，不复制 claude_session_id）                | `app/api/sessions/[id]/fork/route.ts`           |
| GET    | `/api/sessions/[id]/claude-session` | 从 tmux 环境获取 Claude Session ID                            | `app/api/sessions/[id]/claude-session/route.ts` |
| POST   | `/api/sessions/[id]/mcp-config`     | 为会话工作目录写入 .mcp.json 配置                             | `app/api/sessions/[id]/mcp-config/route.ts`     |
| GET    | `/api/sessions/[id]/preview`        | 获取 tmux 终端最后 50 行输出预览                              | `app/api/sessions/[id]/preview/route.ts`        |
| GET    | `/api/sessions/[id]/pr`             | 获取会话关联的 PR 信息                                        | `app/api/sessions/[id]/pr/route.ts`             |
| POST   | `/api/sessions/[id]/pr`             | 为会话的 worktree 分支创建 PR                                 | `app/api/sessions/[id]/pr/route.ts`             |
| GET    | `/api/sessions/status`              | 获取所有托管 tmux 会话的实时状态（running/waiting/idle/dead） | `app/api/sessions/status/route.ts`              |
| POST   | `/api/sessions/init-script`         | 生成 tmux 初始化脚本（含 AgentOS banner）                     | `app/api/sessions/init-script/route.ts`         |

**POST /api/sessions 请求体关键字段**：

```json
{
  "name": "string（可选，自动生成）",
  "workingDirectory": "string（默认 ~）",
  "parentSessionId": "string|null",
  "model": "string|null",
  "systemPrompt": "string|null",
  "groupPath": "string（默认 sessions）",
  "agentType": "claude|codex|opencode|gemini|aider|cursor",
  "autoApprove": "boolean",
  "projectId": "string（默认 uncategorized）",
  "useWorktree": "boolean",
  "featureName": "string|null",
  "baseBranch": "string（默认 main）",
  "useTmux": "boolean（默认 true）",
  "initialPrompt": "string|null"
}
```

**GET /api/sessions/status 响应结构**：

```json
{
  "statuses": {
    "<sessionId>": {
      "sessionName": "claude-<uuid>",
      "status": "running|waiting|idle|dead",
      "lastLine": "string",
      "claudeSessionId": "string|null",
      "agentType": "claude|codex|..."
    }
  }
}
```

### 2.2 Git 操作 — 16 个端点

| 方法 | 路径                                             | 用途                                                         | 文件路径                                   |
| ---- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------ |
| GET  | `/api/git/status`                                | 获取 Git 仓库状态（staged/unstaged/untracked/ahead/behind）  | `app/api/git/status/route.ts`              |
| GET  | `/api/git/status?path=&file=&staged=&untracked=` | 获取单个文件的 diff                                          | `app/api/git/status/route.ts`              |
| POST | `/api/git/stage`                                 | 暂存文件（指定 files 数组或全部）                            | `app/api/git/stage/route.ts`               |
| POST | `/api/git/unstage`                               | 取消暂存文件                                                 | `app/api/git/unstage/route.ts`             |
| POST | `/api/git/commit`                                | 提交已暂存的变更（可在 main 上自动建分支）                   | `app/api/git/commit/route.ts`              |
| POST | `/api/git/push`                                  | 推送到远程（自动设置 upstream）                              | `app/api/git/push/route.ts`                |
| POST | `/api/git/discard`                               | 丢弃单个文件的修改                                           | `app/api/git/discard/route.ts`             |
| POST | `/api/git/clone`                                 | 克隆远程仓库                                                 | `app/api/git/clone/route.ts`               |
| POST | `/api/git/check`                                 | 检查路径是否为 Git 仓库并返回分支信息                        | `app/api/git/check/route.ts`               |
| GET  | `/api/git/history`                               | 获取提交历史（limit 参数，默认 30）                          | `app/api/git/history/route.ts`             |
| GET  | `/api/git/history/[hash]`                        | 获取单个提交详情                                             | `app/api/git/history/[hash]/route.ts`      |
| GET  | `/api/git/history/[hash]/diff`                   | 获取提交中单个文件的 diff                                    | `app/api/git/history/[hash]/diff/route.ts` |
| GET  | `/api/git/file-content`                          | 获取 Git HEAD 中文件的内容                                   | `app/api/git/file-content/route.ts`        |
| GET  | `/api/git/multi-status`                          | 获取项目多个仓库的聚合 Git 状态                              | `app/api/git/multi-status/route.ts`        |
| GET  | `/api/git/pr`                                    | 获取分支 PR 信息（可选 `generate=true` 用 AI 生成标题/描述） | `app/api/git/pr/route.ts`                  |
| POST | `/api/git/pr`                                    | 创建 PR（使用 gh CLI）                                       | `app/api/git/pr/route.ts`                  |

**GET /api/git/status 查询参数**：`path`（必填）、`file`（可选）、`staged=true`、`untracked=true`

**GET /api/git/multi-status 查询参数**：`projectId` 或 `fallbackPath`（二选一必填）

### 2.3 文件操作 — 4 个端点

| 方法 | 路径                     | 用途                                       | 文件路径                             |
| ---- | ------------------------ | ------------------------------------------ | ------------------------------------ |
| GET  | `/api/files`             | 列出目录内容（支持 recursive，最大深度 2） | `app/api/files/route.ts`             |
| GET  | `/api/files/content`     | 读取文件内容                               | `app/api/files/content/route.ts`     |
| POST | `/api/files/content`     | 写入文件内容                               | `app/api/files/content/route.ts`     |
| POST | `/api/files/upload-temp` | 上传 base64 图片到临时目录                 | `app/api/files/upload-temp/route.ts` |

**GET /api/files 查询参数**：`path`（必填）、`recursive=true`

**POST /api/files/upload-temp 请求体**：

```json
{
  "filename": "string",
  "base64": "string（图片 base64 编码）",
  "mimeType": "image/png"
}
```

### 2.4 项目管理（Projects）— 14 个端点

| 方法   | 路径                                       | 用途                                                   | 文件路径                                               |
| ------ | ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| GET    | `/api/projects`                            | 列出所有项目（含 dev server 配置）                     | `app/api/projects/route.ts`                            |
| POST   | `/api/projects`                            | 创建新项目                                             | `app/api/projects/route.ts`                            |
| GET    | `/api/projects/[id]`                       | 获取单个项目详情                                       | `app/api/projects/[id]/route.ts`                       |
| PATCH  | `/api/projects/[id]`                       | 更新项目（名称、工作目录、agent 类型、模型、初始提示） | `app/api/projects/[id]/route.ts`                       |
| DELETE | `/api/projects/[id]`                       | 删除项目                                               | `app/api/projects/[id]/route.ts`                       |
| POST   | `/api/projects/detect`                     | 检测目录中可用的 dev server                            | `app/api/projects/detect/route.ts`                     |
| GET    | `/api/projects/[id]/detect`                | 检测项目目录中的 dev server                            | `app/api/projects/[id]/detect/route.ts`                |
| POST   | `/api/projects/[id]/dev-servers`           | 为项目添加 dev server 配置                             | `app/api/projects/[id]/dev-servers/route.ts`           |
| PATCH  | `/api/projects/[id]/dev-servers/[dsId]`    | 更新 dev server 配置                                   | `app/api/projects/[id]/dev-servers/[dsId]/route.ts`    |
| DELETE | `/api/projects/[id]/dev-servers/[dsId]`    | 删除 dev server 配置                                   | `app/api/projects/[id]/dev-servers/[dsId]/route.ts`    |
| GET    | `/api/projects/[id]/repositories`          | 列出项目的代码仓库                                     | `app/api/projects/[id]/repositories/route.ts`          |
| POST   | `/api/projects/[id]/repositories`          | 为项目添加代码仓库                                     | `app/api/projects/[id]/repositories/route.ts`          |
| PATCH  | `/api/projects/[id]/repositories/[repoId]` | 更新代码仓库配置                                       | `app/api/projects/[id]/repositories/[repoId]/route.ts` |
| DELETE | `/api/projects/[id]/repositories/[repoId]` | 删除代码仓库                                           | `app/api/projects/[id]/repositories/[repoId]/route.ts` |

### 2.5 Dev Servers — 8 个端点

| 方法   | 路径                            | 用途                           | 文件路径                                    |
| ------ | ------------------------------- | ------------------------------ | ------------------------------------------- |
| GET    | `/api/dev-servers`              | 列出所有 dev server 及实时状态 | `app/api/dev-servers/route.ts`              |
| POST   | `/api/dev-servers`              | 启动新 dev server              | `app/api/dev-servers/route.ts`              |
| GET    | `/api/dev-servers/detect`       | 自动检测可用的 dev server      | `app/api/dev-servers/detect/route.ts`       |
| GET    | `/api/dev-servers/[id]`         | 获取单个 dev server 状态       | `app/api/dev-servers/[id]/route.ts`         |
| DELETE | `/api/dev-servers/[id]`         | 停止并删除 dev server          | `app/api/dev-servers/[id]/route.ts`         |
| GET    | `/api/dev-servers/[id]/logs`    | 获取 dev server 日志           | `app/api/dev-servers/[id]/logs/route.ts`    |
| POST   | `/api/dev-servers/[id]/restart` | 重启 dev server                | `app/api/dev-servers/[id]/restart/route.ts` |
| POST   | `/api/dev-servers/[id]/stop`    | 停止 dev server                | `app/api/dev-servers/[id]/stop/route.ts`    |

### 2.6 编排（Orchestration）— 4 个端点

| 方法   | 路径                            | 用途                                               | 文件路径                                    |
| ------ | ------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| POST   | `/api/orchestrate/spawn`        | 生成一个 worker 会话                               | `app/api/orchestrate/spawn/route.ts`        |
| GET    | `/api/orchestrate/workers`      | 列出 conductor 的所有 worker                       | `app/api/orchestrate/workers/route.ts`      |
| GET    | `/api/orchestrate/workers/[id]` | 获取 worker 终端输出                               | `app/api/orchestrate/workers/[id]/route.ts` |
| POST   | `/api/orchestrate/workers/[id]` | 向 worker 发送消息或更新状态（send/complete/fail） | `app/api/orchestrate/workers/[id]/route.ts` |
| DELETE | `/api/orchestrate/workers/[id]` | 终止 worker（可选清理 worktree）                   | `app/api/orchestrate/workers/[id]/route.ts` |

**POST /api/orchestrate/spawn 请求体**：

```json
{
  "conductorSessionId": "string（必填）",
  "task": "string（必填）",
  "workingDirectory": "string（必填）",
  "branchName": "string（可选，自动生成）",
  "useWorktree": "boolean（默认 true）",
  "model": "string",
  "agentType": "claude|codex|..."
}
```

**GET /api/orchestrate/workers 查询参数**：`conductorId`（必填）、`summary=true`（只返回统计）

**POST /api/orchestrate/workers/[id] 请求体**：

```json
{ "action": "send", "message": "string" }
{ "action": "complete" }
{ "action": "fail" }
```

**DELETE /api/orchestrate/workers/[id] 查询参数**：`cleanup=true`（同时删除 worktree）

### 2.7 分组管理（Groups）— 5 个端点

| 方法   | 路径                    | 用途                                 | 文件路径                            |
| ------ | ----------------------- | ------------------------------------ | ----------------------------------- |
| GET    | `/api/groups`           | 列出所有分组                         | `app/api/groups/route.ts`           |
| POST   | `/api/groups`           | 创建新分组                           | `app/api/groups/route.ts`           |
| GET    | `/api/groups/[...path]` | 获取单个分组                         | `app/api/groups/[...path]/route.ts` |
| PATCH  | `/api/groups/[...path]` | 更新分组（名称、展开状态、排序）     | `app/api/groups/[...path]/route.ts` |
| DELETE | `/api/groups/[...path]` | 删除分组（会话移至父分组或默认分组） | `app/api/groups/[...path]/route.ts` |

### 2.8 代码搜索 — 2 个端点

| 方法 | 路径                         | 用途                     | 文件路径                                 |
| ---- | ---------------------------- | ------------------------ | ---------------------------------------- |
| GET  | `/api/code-search`           | 代码搜索（基于 ripgrep） | `app/api/code-search/route.ts`           |
| GET  | `/api/code-search/available` | 检查 ripgrep 是否可用    | `app/api/code-search/available/route.ts` |

**GET /api/code-search 查询参数**：`query`（必填）、`path`（必填）、`maxResults`（默认 100）、`contextLines`（默认 2）

### 2.9 Tmux 操作 — 2 个端点

| 方法 | 路径                 | 用途                                   | 文件路径                         |
| ---- | -------------------- | -------------------------------------- | -------------------------------- |
| POST | `/api/tmux/kill-all` | 终止所有 AgentOS tmux 会话并清空数据库 | `app/api/tmux/kill-all/route.ts` |
| POST | `/api/tmux/rename`   | 重命名 tmux 会话                       | `app/api/tmux/rename/route.ts`   |

### 2.10 命令执行 — 1 个端点

| 方法 | 路径        | 用途                             | 文件路径                |
| ---- | ----------- | -------------------------------- | ----------------------- |
| POST | `/api/exec` | 执行任意 shell 命令（10 秒超时） | `app/api/exec/route.ts` |

**POST /api/exec 请求体**：

```json
{ "command": "string" }
```

**响应**：

```json
{
  "success": "boolean",
  "output": "string",
  "duration": "number（毫秒）"
}
```

### 端点统计

| 域          | 端点数 |
| ----------- | ------ |
| 会话管理    | 17     |
| Git 操作    | 16     |
| 文件操作    | 4      |
| 项目管理    | 14     |
| Dev Servers | 8      |
| 编排        | 5      |
| 分组管理    | 5      |
| 代码搜索    | 2      |
| Tmux 操作   | 2      |
| 命令执行    | 1      |
| **合计**    | **74** |

> 注：原始草稿提到的 55 个端点已通过重新核对 API 路由文件补充完整，实际为 74 个 HTTP 端点。

---

## 三、WebSocket 协议

### 3.1 终端 WebSocket (`/ws/terminal`)

**定义位置**：`server.ts` 第 33-124 行

**连接建立**：客户端连接后，服务端自动生成一个新的 PTY 进程（默认 shell 为 `$SHELL` 或 `/bin/zsh`）。

**环境变量**：PTY 使用最小环境变量集（PATH、HOME、USER、SHELL、TERM、COLORTERM、LANG），不继承父进程的其余环境变量。

#### 客户端 -> 服务端消息

| 消息类型  | 用途                           | Payload 结构                                     | 代码位置            |
| --------- | ------------------------------ | ------------------------------------------------ | ------------------- |
| `input`   | 发送键盘输入到 PTY             | `{ type: "input", data: "string" }`              | `server.ts:99-101`  |
| `resize`  | 调整终端尺寸                   | `{ type: "resize", cols: number, rows: number }` | `server.ts:102-104` |
| `command` | 发送完整命令（自动追加换行符） | `{ type: "command", data: "string" }`            | `server.ts:105-107` |

#### 服务端 -> 客户端消息

| 消息类型 | 用途         | Payload 结构                           | 代码位置          |
| -------- | ------------ | -------------------------------------- | ----------------- |
| `output` | PTY 输出数据 | `{ type: "output", data: "string" }`   | `server.ts:83`    |
| `exit`   | PTY 进程退出 | `{ type: "exit", code: number }`       | `server.ts:90`    |
| `error`  | 连接错误     | `{ type: "error", message: "string" }` | `server.ts:74-76` |

**客户端连接管理**（`components/Terminal/hooks/websocket-connection.ts`）：

- 自动重连机制（指数退避，基础延迟 1000ms，最大延迟 30000ms）
- 页面可见性变化检测（隐藏超过 5 秒强制重连）
- 浏览器休眠检测（时钟跳跃超过 30 秒触发重连）
- 滚动位置保持（修复 Claude Code 强制滚动到顶部的 bug）

### 3.2 Claude 对话 WebSocket (`/ws/claude/:sessionId`)

**前端连接位置**：`components/ChatView.tsx:99-101`

> 此 WebSocket 路径在当前 `server.ts` 中未注册对应的升级处理。可能通过 `lib/claude/process-manager.ts` 管理，但该管理器未被 server.ts 引用。此功能为部分实现。

**后端处理逻辑位置**：`lib/claude/process-manager.ts`

#### 客户端 -> 服务端消息

| 消息类型 | 用途                       | Payload 结构                                                      | 代码位置           |
| -------- | -------------------------- | ----------------------------------------------------------------- | ------------------ |
| `prompt` | 发送用户消息给 Claude      | `{ type: "prompt", prompt: "string", options: { resume: true } }` | `ChatView.tsx:242` |
| `cancel` | 取消正在进行的 Claude 请求 | `{ type: "cancel" }`                                              | `ChatView.tsx:251` |

#### 服务端 -> 客户端消息（ClientEvent 类型）

定义位置：`lib/claude/types.ts`

| 事件类型     | 用途                    | Payload 结构                                                                     |
| ------------ | ----------------------- | -------------------------------------------------------------------------------- |
| `init`       | Claude 会话初始化       | `{ type: "init", sessionId, timestamp, data: { claudeSessionId } }`              |
| `text`       | Claude 文本响应（流式） | `{ type: "text", sessionId, timestamp, data: { role, text, content } }`          |
| `tool_start` | 工具调用开始            | `{ type: "tool_start", sessionId, timestamp, data: { toolName, input } }`        |
| `tool_end`   | 工具调用完成            | `{ type: "tool_end", sessionId, timestamp, data: { toolName, output, status } }` |
| `complete`   | Claude 响应完成         | `{ type: "complete", sessionId, timestamp, data: { durationMs, output } }`       |
| `error`      | 错误                    | `{ type: "error", sessionId, timestamp, data: { error } }`                       |
| `status`     | 状态变更                | `{ type: "status", sessionId, timestamp, data: { status, exitCode? } }`          |

#### 流式解析管线

1. Claude CLI 以 `--output-format stream-json` 模式运行，输出 NDJSON 格式
2. `StreamParser`（`lib/claude/stream-parser.ts`）将 NDJSON 行解析为 `StreamMessage`
3. `StreamMessage` 被转换为 `ClientEvent` 后广播给所有 WebSocket 客户端
4. 同时将 assistant 消息持久化到 SQLite 数据库

**StreamMessage 输入类型**（来自 Claude CLI）：

- `system`（subtype: init）：系统初始化
- `assistant`：助手响应
- `message`：消息格式
- `tool_use`：工具调用开始
- `tool_result`：工具调用结果
- `result`：最终结果

---

## 四、MCP 集成

### 4.1 编排 MCP 服务器

**定义位置**：`mcp/orchestration-server.ts`

**传输方式**：Stdio（标准输入/输出），通过 `@modelcontextprotocol/sdk` 实现

**服务名称**：`agent-os-orchestration`（版本 1.0.0）

**环境变量**：

- `AGENTOS_URL`：AgentOS HTTP 服务器地址（默认 `http://localhost:3011`）
- `CONDUCTOR_SESSION_ID`：默认的 conductor 会话 ID（可选，可由每次调用参数覆盖）

### 4.2 MCP 工具列表

| 工具名称              | 用途                         | 必填参数                   | 调用的 HTTP 端点                            |
| --------------------- | ---------------------------- | -------------------------- | ------------------------------------------- |
| `spawn_worker`        | 生成新的 worker 会话         | `task`, `workingDirectory` | `POST /api/orchestrate/spawn`               |
| `list_workers`        | 列出 conductor 的所有 worker | -                          | `GET /api/orchestrate/workers`              |
| `get_worker_output`   | 获取 worker 终端输出         | `workerId`                 | `GET /api/orchestrate/workers/:id`          |
| `send_to_worker`      | 向 worker 发送消息           | `workerId`, `message`      | `POST /api/orchestrate/workers/:id`         |
| `complete_worker`     | 标记 worker 完成             | `workerId`                 | `POST /api/orchestrate/workers/:id`         |
| `kill_worker`         | 终止 worker                  | `workerId`                 | `DELETE /api/orchestrate/workers/:id`       |
| `get_workers_summary` | 获取 worker 状态统计         | -                          | `GET /api/orchestrate/workers?summary=true` |

### 4.3 MCP 配置自动生成

`lib/mcp-config.ts` 中的 `ensureMcpConfig(workingDirectory, sessionId)` 函数在工作目录中创建或更新 `.mcp.json` 文件，将 `agent-os` MCP 服务器配置注入，并将当前会话 ID 作为 `CONDUCTOR_SESSION_ID` 环境变量写入。

---

## 五、数据流总览

### 5.1 会话生命周期

```
创建会话 (POST /api/sessions)
  -> 写入 SQLite
  -> [可选] 创建 git worktree
  -> [可选] 后台环境配置（npm install 等）
  -> 创建 tmux 会话（名称: {agentType}-{uuid}）
  -> [可选] 写入 .mcp.json

轮询状态 (GET /api/sessions/status)
  -> tmux list-sessions
  -> tmux capture-pane（获取最后一行）
  -> tmux show-environment（获取 CLAUDE_SESSION_ID）
  -> 更新数据库

删除会话 (DELETE /api/sessions/[id])
  -> 级联删除 worker 会话
  -> 删除数据库记录
  -> 后台清理 worktree
```

### 5.2 终端交互流

```
浏览器 <-> WebSocket (/ws/terminal) <-> PTY (node-pty) <-> Shell (zsh)
                                         ^
                                         |
                              tmux session (AgentOS 管理的 AI agent)
```

### 5.3 编排流

```
Claude Session (conductor)
  -> MCP Tool Call (spawn_worker)
  -> MCP Server (mcp/orchestration-server.ts)
  -> HTTP POST /api/orchestrate/spawn
  -> 创建 worker 会话 + worktree + tmux
  -> 发送 task 到 worker
  -> 轮询 worker 状态
  -> MCP Tool Call (get_worker_output / complete_worker)
```
