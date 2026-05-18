# AgentOS 错误类与 WebSocket 消息类型

> 最后更新：2026-05-18

---

## 一、自定义 Error 类

**AgentOS 当前未定义任何自定义 Error 类。** 所有错误处理使用原生 `Error` 构造器，通过字符串消息区分错误类型，无错误码、无结构化字段。

---

## 二、throw new Error 消息模板

以下为代码中 `throw new Error(...)` 使用的主要错误消息模板，按模块分组。

### 2.1 会话与进程

| 错误消息模板                                           | 代码路径                           |
| ------------------------------------------------------ | ---------------------------------- |
| `"Session ${sessionId} not found"`                     | `lib/claude/process-manager.ts:81` |
| `"Session ${sessionId} already has a running process"` | `lib/claude/process-manager.ts:85` |
| `"Worker ${workerId} not found"`                       | `lib/orchestration.ts:323,348`     |

### 2.2 Provider 注册

| 错误消息模板                | 代码路径                        |
| --------------------------- | ------------------------------- |
| `"Unknown provider: ${id}"` | `lib/providers/registry.ts:189` |

### 2.3 Dev Server

| 错误消息模板         | 代码路径                 |
| -------------------- | ------------------------ |
| `"Server not found"` | `lib/dev-servers.ts:344` |

### 2.4 Git 与 Worktree

| 错误消息模板                                      | 代码路径               |
| ------------------------------------------------- | ---------------------- |
| `"Failed to rename local branch: ${message}"`     | `lib/git.ts:178`       |
| `"Not a git repository: ${projectPath}"`          | `lib/worktrees.ts:74`  |
| `"Branch already exists: ${branchName}"`          | `lib/worktrees.ts:82`  |
| `"Worktree path already exists: ${worktreePath}"` | `lib/worktrees.ts:92`  |
| `"Failed to create worktree: ${message}"`         | `lib/worktrees.ts:122` |

### 2.5 文件系统

| 错误消息模板                                  | 代码路径               |
| --------------------------------------------- | ---------------------- |
| `"Failed to read file: ${...}"`               | `lib/files.ts:172-174` |
| `"Content too large (...) Maximum size: ..."` | `lib/files.ts:191-193` |
| `"Failed to write file: ${...}"`              | `lib/files.ts:203-205` |

### 2.6 代码搜索

| 错误消息模板                                                   | 代码路径                 |
| -------------------------------------------------------------- | ------------------------ |
| `"ripgrep (rg) not found. Install with: brew install ripgrep"` | `lib/code-search.ts:104` |

### 2.7 PR 操作

| 错误消息模板                           | 代码路径        |
| -------------------------------------- | --------------- |
| `"Failed to parse PR URL from output"` | `lib/pr.ts:191` |

### 2.8 React Context

| 错误消息模板                                    | 代码路径                       |
| ----------------------------------------------- | ------------------------------ |
| `"usePanes must be used within a PaneProvider"` | `contexts/PaneContext.tsx:290` |

### 2.9 数据层（React Query）

`data/` 目录下的 React Query 层使用两种错误构造模式：

| 模式                                                  | 文件                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `if (!res.ok) throw new Error("Failed to fetch XXX")` | `data/*/queries.ts`（多个）                                                               |
| `if (data.error) throw new Error(data.error)`         | `data/sessions/queries.ts:118`、`data/files/queries.ts:15`、`data/git/queries.ts`（多处） |

---

## 三、HTTP 状态码使用

AgentOS 未定义数字错误码体系，API 路由使用标准 HTTP 状态码：

| HTTP 状态码 | 含义         | 触发场景                                                                                            |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------- |
| 400         | 请求参数错误 | 路径/参数缺失（"Path is required"、"No text provided"、"Name is required" 等）                      |
| 404         | 资源不存在   | "Session not found"、"Project not found"、"Group not found"、"Server not found"、"Commit not found" |
| 500         | 服务端错误   | 所有 catch 块的默认响应                                                                             |
| 201         | 创建成功     | POST 创建资源的成功响应                                                                             |

API 错误响应统一格式：

```json
{ "error": "<描述性错误消息>" }
```

所有 API 路由的 catch 块统一返回：

```typescript
return NextResponse.json({ error: "Failed to <操作>" }, { status: 500 });
```

---

## 四、WebSocket 消息类型

> 完整的 WebSocket 协议定义（含数据结构、流式解析管线、MCP 集成等）见 `docs/api/http.md` 第三节。本节仅列出消息类型摘要。

### 4.1 终端 WebSocket (`/ws/terminal`)

**服务端 -> 客户端：**

| type 字段  | 含义         | 代码路径       |
| ---------- | ------------ | -------------- |
| `"output"` | 终端输出数据 | `server.ts:83` |
| `"exit"`   | 终端进程退出 | `server.ts:90` |
| `"error"`  | 启动错误     | `server.ts:75` |

**客户端 -> 服务端：**

| type 字段   | 含义         | 代码路径        |
| ----------- | ------------ | --------------- |
| `"input"`   | 用户键盘输入 | `server.ts:99`  |
| `"resize"`  | 终端尺寸变化 | `server.ts:102` |
| `"command"` | 执行命令     | `server.ts:105` |

### 4.2 Claude Chat WebSocket (`/ws/claude/${sessionId}`)

**服务端 -> 客户端（ClientEvent 类型，定义于 `lib/claude/types.ts`）：**

| type 字段      | 含义             | 代码路径           |
| -------------- | ---------------- | ------------------ |
| `"init"`       | 初始化事件       | `types.ts:89-94`   |
| `"text"`       | 文本消息（流式） | `types.ts:96-101`  |
| `"tool_start"` | 工具调用开始     | `types.ts:103-108` |
| `"tool_end"`   | 工具调用结束     | `types.ts:110-115` |
| `"complete"`   | 对话完成         | `types.ts:117-122` |
| `"error"`      | 错误事件         | `types.ts:124-129` |
| `"status"`     | 状态变更         | `types.ts:131-136` |

**客户端 -> 服务端：**

| type 字段  | 含义         | 代码路径                      |
| ---------- | ------------ | ----------------------------- |
| `"prompt"` | 发送 prompt  | `components/ChatView.tsx:243` |
| `"cancel"` | 取消当前请求 | `components/ChatView.tsx:251` |

---

## 五、全局错误处理机制

### 5.1 HTTP 服务端

- **请求级错误**：`server.ts:21-29`，try/catch 包裹所有请求处理，错误时返回 500 + `"internal server error"`
- **WebSocket 升级**：`server.ts:36-45`，仅处理 `/ws/terminal`，其余透传给 Next.js
- **进程信号**：`server.ts:130-161`，SIGTERM/SIGINT 触发优雅关闭，关闭所有 WebSocket、杀死所有 PTY，5 秒超时后强制退出

### 5.2 前端 React Query

- Query 层：`fetch` 后检查 `res.ok`，不通过则 `throw new Error("Failed to fetch ...")`
- Mutation 层：部分实现乐观更新 + 回滚（如 `useRenameSession`）
- 错误传播：所有 mutation 错误通过 React Query 机制传播到组件层

### 5.3 用户通知

- toast 库：`sonner`
- 通知事件类型：`"waiting" | "error" | "completed"`
- 多通道通知：浏览器 Notification API + 音频提示 + Tab 标题闪烁
- 代码路径：`hooks/useNotifications.ts`

### 5.4 后台任务

- `runInBackground(task, taskName)`：fire-and-forget，捕获错误并记录 `[Background Task: ${taskName}] Error:`
- `runManyInBackground(tasks, taskName)`：并行执行，`Promise.all` 统一捕获
- 代码路径：`lib/async-operations.ts`
