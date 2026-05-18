# Agent 代码搜索指南

> 更新日期: 2026-05-18
> 适用项目: AgentOS（`/root/code/agent-os`）

---

## 一、搜索优先级

基于项目的目录结构和依赖关系，按以下优先级搜索代码：

### 1.1 按功能领域搜索

| 优先级 | 搜索范围      | 适用场景                                            |
| ------ | ------------- | --------------------------------------------------- |
| 1      | `lib/`        | 核心业务逻辑：Git、数据库、文件系统、编排、会话管理 |
| 2      | `app/api/`    | API 路由处理：HTTP 请求处理、参数验证、调用 lib 层  |
| 3      | `server.ts`   | HTTP/WebSocket 服务器、PTY 管理、连接生命周期       |
| 4      | `components/` | UI 组件和前端逻辑                                   |
| 5      | `data/`       | React Query 数据层（queries/mutations/keys）        |
| 6      | `hooks/`      | React Hooks 桥梁层                                  |
| 7      | `mcp/`        | MCP 编排服务器                                      |
| 8      | `scripts/`    | CLI 和安装脚本                                      |

### 1.2 按关键词搜索策略

**优先搜索日志关键词或错误消息**，而非完整日志文本：

| 搜索方式 | 示例                                                               | 效果                               |
| -------- | ------------------------------------------------------------------ | ---------------------------------- |
| 正确     | `rg "Failed to spawn pty" lib/ server.ts`                          | 精确定位 `server.ts:73`            |
| 正确     | `rg "Claude process exited" lib/`                                  | 精确定位 `process-manager.ts:190`  |
| 错误     | `rg "2026-05-18 10:23:45 [error] Failed to spawn pty: Error: ..."` | 时间戳和完整错误消息在代码中不存在 |

### 1.3 按模块精确定位

如果已知功能领域，直接在目标模块搜索：

| 功能领域       | 搜索目录                            | 关键文件                                              |
| -------------- | ----------------------------------- | ----------------------------------------------------- |
| 终端/WebSocket | `server.ts`, `components/Terminal/` | `websocket-connection.ts`, `useTerminalConnection.ts` |
| Claude 进程    | `lib/claude/`                       | `process-manager.ts`, `stream-parser.ts`              |
| Git 操作       | `lib/`                              | `git.ts`, `git-status.ts`, `git-history.ts`           |
| 文件操作       | `lib/`                              | `files.ts`, `file-upload.ts`                          |
| 数据库         | `lib/db/`                           | `schema.ts`, `queries.ts`, `migrations.ts`            |
| 会话管理       | `app/api/sessions/`                 | `route.ts`, `[id]/route.ts`                           |
| 编排系统       | `lib/`, `app/api/orchestrate/`      | `orchestration.ts`                                    |
| Agent Provider | `lib/providers/`                    | `registry.ts`, `../providers.ts`                      |
| 开发服务器     | `lib/`, `app/api/dev-servers/`      | `dev-servers.ts`                                      |
| 项目管理       | `lib/`, `app/api/projects/`         | `projects.ts`                                         |
| Worktree       | `lib/`                              | `worktrees.ts`                                        |
| PR 创建        | `lib/`                              | `pr.ts`, `pr-generation.ts`                           |

---

## 二、搜索规则

### 规则 1: 不搜完整日志文本

日志输出包含运行时数据（时间戳、动态 ID、错误堆栈），这些不会出现在源代码中。只搜索固定的字符串常量。

示例：

```
# 日志原文（不要直接搜）
[2026-05-18T10:23:45.123Z] Claude process exited for session abc-123 with code 1

# 搜索关键词（正确）
"Claude process exited"
```

### 规则 2: 结论必须附代码路径

所有搜索结论必须标注精确的代码位置，格式为 `文件:行号`。不要只说"在 lib/ 中"，要说 `lib/git-status.ts:321`。

### 规则 3: 优先用 rg 而非 grep

项目使用 ripgrep（`rg`），`lib/code-search.ts:66` 中调用 ripgrep 使用 `spawnSync("rg", args)` 形式。本地搜索同样推荐 rg。

### 规则 4: 注意 API 路由的统一模式

50+ 个 API 路由文件（`app/api/*/route.ts`）遵循完全统一的错误处理模式：

```typescript
try {
  // 业务逻辑
} catch (error) {
  console.error("Error XXX:", error);
  return NextResponse.json({ error: "Failed to XXX" }, { status: 500 });
}
```

搜索 API 路由时，先搜 `"Error "` 或 `"Failed to "` + 操作关键词。

### 规则 5: 注意 exec 命令的搜索方式

项目中存在 30+ 处使用 `exec/execSync` + 字符串拼接的位置。搜索命令注入风险时：

```
# 搜索 execSync + 模板字符串
rg 'execSync\(`' lib/
# 搜索 execAsync + 模板字符串
rg 'execAsync\(`' lib/ app/
# 搜索 spawn + shell: true
rg 'shell:\s*true' lib/
```

### 规则 6: 检查调用链

不要只看错误抛出点。项目数据流为单向流动：

```
components/ → hooks/ → data/ → fetch() → app/api/ → lib/ → lib/db/
```

如果问题出在前端，沿调用链向上追踪到 API 层和 lib 层。

### 规则 7: 搜索 WebSocket 消息类型时

WebSocket 消息类型字符串分散在两端：

- 服务端: `server.ts`（终端 WebSocket）、`lib/claude/types.ts`（Claude Chat WebSocket）
- 客户端: `components/Terminal/hooks/websocket-connection.ts`（终端）、`components/ChatView.tsx`（Chat）

搜索消息类型时需要同时检查服务端和客户端。

### 规则 8: tmux 操作的搜索

tmux 相关操作分布在多个文件中：

- `lib/orchestration.ts` — Worker 编排的 tmux 操作
- `lib/status-detector.ts` — 状态检测的 tmux 操作
- `app/api/sessions/[id]/send-keys/route.ts` — 按键发送
- `app/api/sessions/[id]/route.ts` — 会话管理的 tmux 重命名
- `app/api/tmux/` — tmux API 路由

搜索 `tmux` 关键词时，需要覆盖以上所有文件。

---

## 三、常用搜索命令

### 3.1 按错误消息搜索

```bash
# 搜索日志关键词在源码中的位置
rg "关键词" lib/ server.ts app/
```

### 3.2 按 API 端点搜索

```bash
# 搜索 API 路由定义
rg "export async function GET\|POST\|PATCH\|DELETE" app/api/
```

### 3.3 按函数名搜索

```bash
# 搜索 lib 层函数定义
rg "export function\|export async function" lib/
```

### 3.4 按 SQL 操作搜索

```bash
# 搜索数据库查询
rg "db\.prepare\|\.run(\|\.get(\|\.all(" lib/db/
```

### 3.5 按子进程调用搜索

```bash
# 搜索所有 shell 命令执行
rg "execSync\(|execAsync\(|spawn(" lib/ app/ server.ts
```
