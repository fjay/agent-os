# MCP 编排

## 概述

AgentOS 实现了 Conductor/Worker 编排模式。一个会话可以作为 conductor，通过 MCP（Model Context Protocol）工具生成和管理多个 worker 会话。每个 worker 获得独立的 Git worktree 实现代码隔离。MCP Server 以 stdio 方式运行，Claude Code 自动通过 `.mcp.json` 发现并使用编排工具。

## 核心代码路径

### MCP Server

- `mcp/orchestration-server.ts` — MCP Server 实现（@modelcontextprotocol/sdk），stdio transport

### API 路由

- `app/api/orchestrate/spawn/route.ts` — 生成 worker
- `app/api/orchestrate/workers/route.ts` — Worker 列表/摘要
- `app/api/orchestrate/workers/[id]/route.ts` — 单 worker 操作

### 核心库

- `lib/orchestration.ts` — 编排核心逻辑（spawnWorker, getWorkers, getWorkerOutput, sendToWorker, completeWorker, failWorker, killWorker）
- `lib/mcp-config.ts` — `.mcp.json` 自动生成（确保 Claude Code 发现 MCP Server）

### 前端

- `components/ConductorPanel.tsx` — Conductor 面板（显示 workers、状态、输出）
- `components/WorkerCard.tsx` — Worker 卡片（状态、操作）

## MCP 工具一览

| 工具名                | 说明                             | 对应 HTTP 端点                              |
| --------------------- | -------------------------------- | ------------------------------------------- |
| `spawn_worker`        | 生成新 worker，创建隔离 worktree | `POST /api/orchestrate/spawn`               |
| `list_workers`        | 列出所有 worker                  | `GET /api/orchestrate/workers`              |
| `get_worker_output`   | 获取 worker 终端输出             | `GET /api/orchestrate/workers/[id]`         |
| `send_to_worker`      | 向 worker 发送消息               | `POST /api/orchestrate/workers/[id]`        |
| `complete_worker`     | 标记 worker 完成                 | `POST /api/orchestrate/workers/[id]`        |
| `kill_worker`         | 终止 worker                      | `DELETE /api/orchestrate/workers/[id]`      |
| `get_workers_summary` | 获取 worker 状态汇总             | `GET /api/orchestrate/workers?summary=true` |

## 主流程

### 1. MCP 配置注入

```
会话创建时（POST /api/sessions/[id]/mcp-config）:
→ ensureMcpConfig(workingDirectory, sessionId):
    1. 读取/创建 .mcp.json
    2. 添加 agent-os MCP Server 配置:
       {
         "mcpServers": {
           "agent-os": {
             "command": "npx",
             "args": ["tsx", "mcp/orchestration-server.ts"],
             "env": {
               "AGENTOS_URL": "http://localhost:3011",
               "CONDUCTOR_SESSION_ID": "{sessionId}"
             }
           }
         }
       }
    3. 写入 .mcp.json
→ Claude Code 启动时自动加载 .mcp.json
```

### 2. 生成 Worker（spawn_worker）

```
Claude Code 调用 MCP 工具 spawn_worker { task, workingDirectory, ... }
→ MCP Server → apiCall("/api/orchestrate/spawn", POST)
→ spawnWorker(options):
    1. 解析参数 → 解析 model
    2. 如 useWorktree=true:
       a. createWorktree({ projectPath, featureName })
       b. runInBackground(setupWorktree()) → 异步安装依赖
    3. INSERT INTO sessions (conductor_session_id, worker_task, worker_status="pending")
    4. 构建 tmux 命令:
       - provider.buildFlags({ model, autoApprove: true }) → 自动批准
       - wrapWithBanner(agentCmd) → 显示 banner
       - tmux new-session -d -s "{provider}-{id}" -c "{cwd}" "{cmd}"
    5. 等待 Claude 就绪（最多 30s）:
       - 每 2s 轮询 tmux capture-pane
       - 检测 "Ready to code here?" → 按 Enter 接受
       - 检测 "? for shortcuts" 或 "?>" → 就绪
    6. 发送任务: tmux send-keys -l '{task}' + Enter
    7. UPDATE worker_status="running"
→ MCP Server 返回: "Worker spawned! ID: {id}, Worktree: {path}"
```

### 3. 列出 Workers（list_workers）

```
Claude Code 调用 MCP 工具 list_workers
→ GET /api/orchestrate/workers?conductorId={id}
→ getWorkers(conductorSessionId):
    1. SELECT * FROM sessions WHERE conductor_session_id=?
    2. 对每个 worker:
       - 获取 tmux live status（statusDetector.getStatus）
       - 合并 DB status + live status
       - 终态（completed/failed）以 DB 为准
       - tmux 不存在 → "dead"
→ 返回 WorkerInfo[] { id, name, task, status, worktreePath, branchName }
```

### 4. 获取 Worker 输出

```
get_worker_output { workerId, lines=50 }
→ GET /api/orchestrate/workers/{id}?lines=50
→ tmux capture-pane -t "{tmuxSession}" -p -S -50
→ 返回终端输出文本
```

### 5. 发送消息给 Worker

```
send_to_worker { workerId, message }
→ POST /api/orchestrate/workers/{id} { action: "send", message }
→ tmux send-keys -t "{tmuxSession}" "{escapedMessage}" Enter
```

### 6. 标记完成/失败

```
complete_worker { workerId }:
→ queries.updateWorkerStatus → "completed"

fail_worker { workerId }:
→ queries.updateWorkerStatus → "failed"
```

### 7. 终止 Worker

```
kill_worker { workerId, cleanupWorktree=false }
→ DELETE /api/orchestrate/workers/{id}?cleanup={bool}
→ killWorker(workerId, cleanupWorktree):
    1. tmux kill-session -t "{tmuxSession}"
    2. 如 cleanupWorktree=true:
       a. 获取 projectPath（从 git worktree list）
       b. deleteWorktree(worktreePath, projectPath, true)
    3. UPDATE worker_status="failed"
```

## 状态转换

### Worker 状态

```
                    ┌───────────┐
                    │  pending   │ ◄─── DB 初始状态
                    └─────┬─────┘
                          │ tmux 启动 + 任务发送
                          ▼
                    ┌───────────┐
              ┌────▶│  running   │────┐
              │     └─────┬─────┘    │
              │           │          │
              │  等待输入  │  任务完成 │ 任务失败
              │           ▼          ▼
              │     ┌───────────┐  ┌───────────┐
              │     │  waiting   │  │ completed  │
              │     └───────────┘  └───────────┘
              │                          │
              │  继续运行                 │
              └──────────────────────────┘
                                         │
                              kill_worker │
                                         ▼
                                   ┌───────────┐
                                   │   failed   │
                                   └───────────┘
                                         ▲
                              tmux 不存在 │
                                   ┌─────┴────┐
                                   │   dead    │
                                   └──────────┘
```

## 数据模型

sessions 表中的编排字段:

| 字段                 | 类型    | 说明                             |
| -------------------- | ------- | -------------------------------- |
| conductor_session_id | TEXT FK | 所属 conductor（仅 worker 有值） |
| worker_task          | TEXT    | Worker 任务描述                  |
| worker_status        | TEXT    | pending/running/completed/failed |

关系: sessions.id ← sessions.conductor_session_id（一对多）

## 排查路径

1. **Worker 无法生成** → 检查 `.mcp.json` 配置 → 检查 MCP Server 路径 → 检查 AGENTOS_URL
2. **Worker 启动超时** → 检查 Claude CLI 安装 → 检查 tmux session 创建 → 手动 `tmux capture-pane` 查看
3. **Worker 状态不对** → `getWorkers()` 合并了 DB status + live status → 终态以 DB 为准
4. **Worktree 冲突** → 检查 `~/.agent-os/worktrees/` → `git worktree list` → 分支名唯一性
5. **MCP 工具不可见** → 检查 `.mcp.json` 是否在工作目录 → 检查 npx/tsx 可用
6. **Worker 输出为空** → 检查 tmux session 是否存在 → 检查 capture-pane 参数
7. **Conductor 删除时 Worker 未清理** → 检查 DELETE handler 中 worker 清理循环
