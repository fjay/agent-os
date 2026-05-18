# AgentOS 日志模式与可搜索关键词

> 最后更新：2026-05-18

---

## 一、日志架构现状

AgentOS 全部使用原生 `console.log/error/warn/debug` 输出日志，无结构化日志框架，无 traceId/requestId，无 JSON 格式日志。

| 统计项             | 数量           |
| ------------------ | -------------- |
| console.log 调用   | 50+            |
| console.error 调用 | 80+            |
| console.warn 调用  | 1              |
| console.debug 调用 | 3              |
| 文件日志输出       | 1（send-keys） |
| 结构化日志         | 0              |

---

## 二、半结构化日志前缀

部分模块使用方括号前缀做半结构化区分：

| 前缀                         | 模块        | 代码路径                                   |
| ---------------------------- | ----------- | ------------------------------------------ |
| `[orchestration]`            | 编排系统    | `lib/orchestration.ts`                     |
| `[summarize]`                | 会话摘要    | `app/api/sessions/[id]/summarize/route.ts` |
| `[send-keys]`                | 按键发送    | `app/api/sessions/[id]/send-keys/route.ts` |
| `[AgentOS]`                  | 前端调试    | `app/page.tsx`                             |
| `[Background Task: ${name}]` | 后台任务    | `lib/async-operations.ts`                  |
| `[${sessionId}]`             | Claude 进程 | `lib/claude/process-manager.ts`            |

---

## 三、服务端日志关键词速查表

### 3.1 启动与关闭

| 关键词                           | 含义         | 代码路径        |
| -------------------------------- | ------------ | --------------- |
| `"Agent-OS ready on http://..."` | 服务启动成功 | `server.ts:127` |
| `"shutting down AgentOS server"` | 服务开始关闭 | `server.ts:133` |

### 3.2 终端与 WebSocket

| 关键词                    | 含义                   | 代码路径        |
| ------------------------- | ---------------------- | --------------- |
| `"Failed to spawn pty"`   | PTY 创建失败           | `server.ts:73`  |
| `"WebSocket error"`       | WebSocket 连接错误     | `server.ts:120` |
| `"Error parsing message"` | WebSocket 消息解析失败 | `server.ts:110` |

### 3.3 Claude 进程

| 关键词                          | 含义                | 代码路径                            |
| ------------------------------- | ------------------- | ----------------------------------- |
| `"Spawning Claude for session"` | Claude 进程启动     | `lib/claude/process-manager.ts:132` |
| `"Claude stderr"`               | Claude 错误输出     | `lib/claude/process-manager.ts:181` |
| `"Claude spawn error"`          | Claude 进程启动失败 | `lib/claude/process-manager.ts:185` |
| `"Claude process exited"`       | Claude 进程退出     | `lib/claude/process-manager.ts:190` |
| `"Claude process error"`        | Claude 进程运行错误 | `lib/claude/process-manager.ts:209` |
| `"Failed to parse stream line"` | 流解析错误          | `lib/claude/stream-parser.ts:51`    |

### 3.4 编排系统

| 关键词                              | 含义              | 代码路径                   |
| ----------------------------------- | ----------------- | -------------------------- |
| `"Failed to create worktree"`       | Worktree 创建失败 | `lib/orchestration.ts:129` |
| `"Failed to start worker session"`  | Worker 启动失败   | `lib/orchestration.ts:255` |
| `"Worker worktree setup completed"` | Worktree 设置完成 | `lib/orchestration.ts:121` |

### 3.5 数据库

| 关键词                      | 含义     | 代码路径                   |
| --------------------------- | -------- | -------------------------- |
| `"Migration"` + `"applied"` | 迁移成功 | `lib/db/migrations.ts:217` |
| `"Migration"` + `"failed"`  | 迁移失败 | `lib/db/migrations.ts:236` |

### 3.6 其他服务端模块

| 关键词                             | 含义                | 代码路径                 |
| ---------------------------------- | ------------------- | ------------------------ |
| `"Error occurred handling"`        | HTTP 请求处理失败   | `server.ts:26`           |
| `"Failed to start Docker service"` | Docker 服务启动失败 | `lib/dev-servers.ts:242` |
| `"Upload failed"`                  | 文件上传失败        | `lib/file-upload.ts:32`  |

---

## 四、前端日志关键词速查表

| 关键词                             | 含义                | 代码路径                                                            |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `"Failed to open file"`            | 文件打开失败        | `hooks/useFileEditor.ts:69,85`                                      |
| `"Failed to fetch workers"`        | Worker 列表获取失败 | `components/ConductorPanel.tsx:55`                                  |
| `"Failed to upload file"`          | 文件上传失败        | `components/FilePicker.tsx:82`、`components/Terminal/index.tsx:171` |
| `"Failed to capture tmux history"` | tmux 历史捕获失败   | `components/Terminal/index.tsx:235`                                 |
| `"Failed to kill sessions"`        | 会话批量终止失败    | `components/SessionList/KillAllConfirm.tsx:22`                      |
| `"Failed to copy to clipboard"`    | 剪贴板操作失败      | `components/views/DesktopView.tsx:154`                              |

---

## 五、文件日志

仅 `send-keys` 模块写入文件日志：

- 日志文件：`/tmp/agent-os-send-keys.log`
- 格式：`[ISO时间戳] [send-keys] <消息>`
- 代码路径：`app/api/sessions/[id]/send-keys/route.ts:10-17`

开发服务器日志存储在独立目录：

- 日志目录：`~/.agent-os/logs/`
- 日志文件：`{serverId}.log`
- 代码路径：`lib/dev-servers.ts:9,38,178-209`

> WebSocket 协议的完整消息类型定义见 `docs/api/http.md` 第三节。本文件仅记录与日志相关的上下文。
