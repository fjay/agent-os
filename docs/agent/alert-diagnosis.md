# Agent 告警诊断指南

> 更新日期: 2026-05-18
> 适用项目: AgentOS（`/root/code/agent-os`）

---

## 一、目标

根据日志信息快速定位代码位置、判断根因、提供修复建议。本指南基于项目实际的代码结构、日志模式和错误处理机制编写。

---

## 二、输入

诊断时需要获取以下信息：

| 字段      | 必需 | 说明                                                    |
| --------- | ---- | ------------------------------------------------------- |
| alertName | 是   | 告警名称或日志关键词                                    |
| logs      | 是   | 相关日志文本                                            |
| traceId   | 否   | 请求追踪 ID（注意: 当前项目未实现 traceId，见下方说明） |
| timestamp | 否   | 告警发生时间                                            |
| sessionId | 否   | 关联的会话 ID（如涉及 Agent 会话）                      |

**重要**: AgentOS 当前没有实现结构化日志或 traceId（代码路径: 全部模块使用 `console.log/error/warn/debug`）。日志关联依赖以下半结构化前缀：

- `[orchestration]` — 编排系统操作（`lib/orchestration.ts`）
- `[summarize]` — 会话摘要操作（`app/api/sessions/[id]/summarize/route.ts`）
- `[send-keys]` — 按键发送操作（`app/api/sessions/[id]/send-keys/route.ts`）
- `[AgentOS]` — 前端调试（`app/page.tsx`）
- `[Background Task: ${taskName}]` — 后台任务（`lib/async-operations.ts`）
- `[${sessionId}]` — Claude 进程日志（`lib/claude/process-manager.ts`）

---

## 三、诊断顺序

### 步骤 1: 识别告警类型

根据日志关键词匹配所属模块：

| 日志前缀/关键词                                  | 所属模块            | 主要代码路径                                       |
| ------------------------------------------------ | ------------------- | -------------------------------------------------- |
| `Failed to spawn pty`                            | 服务器启动          | `server.ts:73`                                     |
| `WebSocket error`                                | WebSocket 通信      | `server.ts:120`                                    |
| `Error parsing message`                          | WebSocket 消息解析  | `server.ts:110`                                    |
| `Error occurred handling`                        | HTTP 请求处理       | `server.ts:26`                                     |
| `Spawning Claude for session`                    | Claude 进程管理     | `lib/claude/process-manager.ts:132`                |
| `Claude stderr` / `Claude spawn error`           | Claude 进程错误     | `lib/claude/process-manager.ts:181,185`            |
| `Claude process exited` / `Claude process error` | Claude 进程生命周期 | `lib/claude/process-manager.ts:190,209`            |
| `Failed to parse stream line`                    | 流解析错误          | `lib/claude/stream-parser.ts:51`                   |
| `[orchestration]`                                | 多 Agent 编排       | `lib/orchestration.ts`                             |
| `[summarize]`                                    | 会话摘要            | `app/api/sessions/[id]/summarize/route.ts`         |
| `[send-keys]`                                    | 按键发送            | `app/api/sessions/[id]/send-keys/route.ts`         |
| `Migration` + `failed`                           | 数据库迁移          | `lib/db/migrations.ts:236`                         |
| `Failed to create worktree`                      | Git Worktree        | `lib/orchestration.ts:129`, `lib/worktrees.ts:122` |
| `Failed to start worker`                         | Worker 启动         | `lib/orchestration.ts:255`                         |
| `Failed to start Docker`                         | 开发服务器          | `lib/dev-servers.ts:242`                           |
| `Upload failed`                                  | 文件上传            | `lib/file-upload.ts:32`                            |
| `Failed to copy`                                 | 环境配置            | `lib/env-setup.ts:124`                             |
| `[Background Task: ...] Error`                   | 后台任务失败        | `lib/async-operations.ts:20`                       |

### 步骤 2: 定位代码路径

根据模块定位具体文件和行号：

1. **终端/WebSocket 问题** → 先查 `server.ts`，再看 `components/Terminal/hooks/websocket-connection.ts`
2. **Agent 进程问题** → `lib/claude/process-manager.ts`（进程管理）、`lib/orchestration.ts`（tmux 交互）
3. **Git 操作问题** → `lib/git-status.ts`（状态/提交）、`lib/git.ts`（基础操作）、`lib/git-history.ts`（历史）
4. **会话管理问题** → `app/api/sessions/route.ts`（创建）、`app/api/sessions/[id]/route.ts`（更新/删除）
5. **文件操作问题** → `lib/files.ts`（读写）、`lib/file-upload.ts`（上传）
6. **数据库问题** → `lib/db/migrations.ts`（迁移）、`lib/db/queries.ts`（查询）
7. **编排问题** → `lib/orchestration.ts`（核心逻辑）、`app/api/orchestrate/spawn/route.ts`（API 入口）
8. **开发服务器问题** → `lib/dev-servers.ts`（生命周期）、`app/api/dev-servers/route.ts`（API）

### 步骤 3: 读取错误上下文

定位到文件后，检查以下内容：

1. 错误抛出点的 try-catch 范围
2. 调用链上的参数来源（是否来自用户输入）
3. 相关的后台异步操作（`lib/async-operations.ts`）
4. tmux 相关操作的静默错误（`2>/dev/null || true` 模式可能吞噬错误）

### 步骤 4: 验证假设

- 检查日志中是否有会话 ID，搜索相关 `sessionId` 的全部日志
- 检查 `send-keys` 专用日志文件：`/tmp/agent-os-send-keys.log`
- 检查开发服务器日志：`~/.agent-os/logs/{serverId}.log`
- 检查数据库迁移状态：`_migrations` 表

---

## 四、输出要求

诊断结果应包含以下结构：

### 4.1 可能原因

按可能性从高到低排列，每个原因标注置信度（高/中/低）。

### 4.2 证据

引用日志原文，标注日志关键词在代码中的位置（文件:行号）。

### 4.3 代码位置

给出精确的代码路径，格式为 `文件路径:行号`。

### 4.4 不确定性

明确标注以下情况：

- 日志不足以确定根因（如静默错误吞噬）
- 可能涉及多个模块交互（如 WebSocket + tmux + pty 链路）
- 当前项目没有 traceId，无法追踪完整请求链路

---

## 五、关键日志关键词表

### 5.1 严重级别（系统不可用）

| 关键词                  | 场景                        | 代码路径                            |
| ----------------------- | --------------------------- | ----------------------------------- |
| `Failed to spawn pty`   | 终端子系统不可用            | `server.ts:73`                      |
| `Claude spawn error`    | Claude CLI 不可用或路径错误 | `lib/claude/process-manager.ts:185` |
| `shutting down AgentOS` | 服务正在关闭                | `server.ts:133`                     |

### 5.2 高级别（核心功能故障）

| 关键词                                | 场景                  | 代码路径                                           |
| ------------------------------------- | --------------------- | -------------------------------------------------- |
| `WebSocket error`                     | WebSocket 连接异常    | `server.ts:120`                                    |
| `Failed to start worker session`      | 编排 Worker 启动失败  | `lib/orchestration.ts:255`                         |
| `Migration` + `failed`                | 数据库迁移失败        | `lib/db/migrations.ts:236`                         |
| `Failed to create worktree`           | Git Worktree 创建失败 | `lib/orchestration.ts:129`, `lib/worktrees.ts:122` |
| `Claude process exited` + `code != 0` | Claude 进程异常退出   | `lib/claude/process-manager.ts:190`                |
| `Failed to start Docker`              | Docker 服务启动失败   | `lib/dev-servers.ts:242`                           |

### 5.3 中级别（功能降级）

| 关键词                                  | 场景                    | 代码路径                                       |
| --------------------------------------- | ----------------------- | ---------------------------------------------- |
| `Error occurred handling`               | HTTP 请求未处理异常     | `server.ts:26`                                 |
| `Error parsing message`                 | WebSocket 消息解析失败  | `server.ts:110`                                |
| `Failed to parse stream line`           | Claude 流式输出解析错误 | `lib/claude/stream-parser.ts:51`               |
| `[orchestration] Timed out`             | Claude 初始化超时       | `lib/orchestration.ts:227`                     |
| `[orchestration] Failed to send task`   | 任务发送失败            | `lib/orchestration.ts:246`                     |
| `Failed to delete worktree`             | Worktree 清理失败       | `lib/orchestration.ts:416`                     |
| `Failed to get commit history`          | Git 历史查询失败        | `lib/git-history.ts:145`                       |
| `Upload failed`                         | 文件上传失败            | `lib/file-upload.ts:32`                        |
| `[summarize] WARNING: Claude not ready` | Claude 未就绪           | `app/api/sessions/[id]/summarize/route.ts:311` |

### 5.4 低级别（可恢复/信息性）

| 关键词                                                   | 场景                             | 代码路径                            |
| -------------------------------------------------------- | -------------------------------- | ----------------------------------- |
| `Agent-OS ready`                                         | 服务启动成功（确认信息）         | `server.ts:127`                     |
| `Migration` + `skipped`                                  | 迁移已存在（正常）               | `lib/db/migrations.ts:219,233`      |
| `No session found for broadcast`                         | 广播时无会话（可恢复）           | `lib/claude/process-manager.ts:244` |
| `Client not open, state: N`                              | WebSocket 客户端已关闭（可恢复） | `lib/claude/process-manager.ts:257` |
| `Warning: Local branch renamed but remote rename failed` | 本地重命名成功但远程失败         | `lib/git.ts:198`                    |

### 5.5 前端日志关键词

以下关键词出现在浏览器开发者工具中：

| 关键词                           | 场景                | 代码路径                                                            |
| -------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `Failed to open file`            | 文件打开失败        | `hooks/useFileEditor.ts:69,85`                                      |
| `Failed to fetch workers`        | Worker 列表获取失败 | `components/ConductorPanel.tsx:55`                                  |
| `Failed to upload file`          | 文件上传失败        | `components/FilePicker.tsx:82`, `components/Terminal/index.tsx:171` |
| `Failed to capture tmux history` | tmux 历史捕获失败   | `components/Terminal/index.tsx:235`                                 |
| `Failed to kill sessions`        | 会话批量终止失败    | `components/SessionList/KillAllConfirm.tsx:22`                      |
| `Failed to create project`       | 项目创建失败        | `components/SessionList/index.tsx:349`                              |
| `[AgentOS]`                      | 前端调试日志        | `app/page.tsx:14`                                                   |

---

## 六、常见诊断场景

### 场景 A: 终端连接不上

1. 检查 `Failed to spawn pty` → `server.ts:73`（PTY 创建失败）
2. 检查 `WebSocket error` → `server.ts:120`（连接异常）
3. 检查前端 `websocket-connection.ts` 的重连日志（指数退避，基础 1s，最大 30s）
4. 检查休眠恢复：`visibilitychange` / `pageshow` / `focus` 事件是否触发重连

### 场景 B: Claude 会话无响应

1. 检查 `Claude process exited` → `lib/claude/process-manager.ts:190`（进程退出）
2. 检查 `[orchestration] Timed out` → `lib/orchestration.ts:227`（初始化超时）
3. 检查 tmux 会话是否存在：`tmux list-sessions`
4. 检查 `lib/status-detector.ts` 的状态判断（waiting/running/idle/dead）

### 场景 C: Git 操作失败

1. 检查 `Failed to get commit history` → `lib/git-history.ts:145`
2. 检查 `Warning: Local branch renamed but remote rename failed` → `lib/git.ts:198`
3. 检查 worktree 路径是否有效 → `lib/worktrees.ts`
4. 检查是否为命令注入导致的 shell 错误（参考 `docs/security/sensitive-operations.md`）

### 场景 D: 数据库迁移失败

1. 检查 `Migration` + `failed` → `lib/db/migrations.ts:236`
2. 检查 SQLite 文件锁（WAL 模式 + 10s 忙等超时）
3. 检查 `lib/db/index.ts` 的初始化锁机制

---

## 七、注意事项

1. **大量静默错误**: tmux 操作（`orchestration.ts`）、Docker 状态检查（`dev-servers.ts`）、Git 操作（`git.ts`）中存在大量 `catch {}` 或 `2>/dev/null || true` 模式，可能吞噬错误
2. **无错误分类**: 所有 API 500 错误使用统一消息 `"Failed to <操作>"`，无法区分可恢复错误与系统故障
3. **前端错误仅 console.error**: 组件层错误仅写入浏览器控制台，无集中错误上报
4. **日志文件有限**: 仅 `send-keys` 模块写入文件日志（`/tmp/agent-os-send-keys.log`），其他模块全部依赖 console
5. **Dev Server 日志独立**: 开发服务器日志存储在 `~/.agent-os/logs/` 目录，与应用日志分离
