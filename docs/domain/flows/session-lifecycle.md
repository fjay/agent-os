# 会话（session）生命周期

## 概述

会话是 AgentOS 的核心实体。每个会话对应一个 tmux 终端中运行的 AI 编码代理（如 Claude Code）。会话从创建到终止经历完整的生命周期，支持分叉（fork）、摘要恢复（summarize）、状态检测等高级操作。

## 核心代码路径

### API 路由

- `app/api/sessions/route.ts` — 会话列表、创建
- `app/api/sessions/[id]/route.ts` — 单会话 CRUD
- `app/api/sessions/[id]/fork/route.ts` — 分叉
- `app/api/sessions/[id]/summarize/route.ts` — 摘要恢复
- `app/api/sessions/[id]/send-keys/route.ts` — 向 tmux 发送按键
- `app/api/sessions/[id]/messages/route.ts` — 消息读写
- `app/api/sessions/[id]/claude-session/route.ts` — Claude Session ID 获取
- `app/api/sessions/[id]/mcp-config/route.ts` — MCP 配置自动写入
- `app/api/sessions/status/route.ts` — 批量状态检测

### 核心库

- `lib/db/schema.ts` — sessions 表定义
- `lib/db/queries.ts` — 所有 SQL 查询
- `lib/db/types.ts` — Session 类型定义
- `lib/status-detector.ts` — 会话状态检测器（tmux 内容分析）
- `lib/providers.ts` — 代理提供者抽象（9 种）
- `lib/worktrees.ts` — Git worktree 创建/删除
- `lib/env-setup.ts` — Worktree 环境初始化
- `lib/ports.ts` — 端口分配
- `lib/panes.ts` — 前端分屏布局管理
- `lib/mcp-config.ts` — .mcp.json 自动写入
- `lib/async-operations.ts` — 后台任务执行

### 数据层

- `data/sessions/queries.ts` — React Query hooks
- `data/sessions/keys.ts` — Query key 定义
- `data/statuses/queries.ts` — 状态轮询 hook

## 主流程

### 1. 创建会话（POST /api/sessions）

```
前端请求 → 解析参数 → 验证 agentType → 解析 model
  → 如 useWorktree=true:
      → createWorktree() 创建 Git worktree
      → findAvailablePort() 分配端口
      → runInBackground(setupWorktree()) 异步安装依赖
  → 生成 tmux 会话名: {agentType}-{uuid}
  → INSERT INTO sessions → 写入 DB
  → 如有 parentSessionId → 复制父消息
  → 如有 claudeSessionId → 写入外部会话 ID
  → 合并项目初始 prompt 和会话 prompt
  → 返回 { session, setup?, initialPrompt? }
```

### 2. 附加到 tmux（前端操作）

```
前端创建 xterm.js Terminal → 建立 WebSocket /ws/terminal
→ 关联 tmux session: tmux attach -t {tmux_name}
→ 或创建新 tmux: tmux new-session -d -s {name} -c {cwd} "{agentCommand}"
```

### 3. 状态检测（轮询 GET /api/sessions/status）

```
获取所有 tmux sessions → 过滤 AgentOS 管理的 session（UUID 正则匹配）
→ 对每个 managed session:
    → statusDetector.getStatus() 分析 tmux 内容
    → 检测 Claude Session ID（环境变量 + 文件系统）
    → 获取最后输出行
→ 批量更新 DB（status, claude_session_id）
→ 返回 { statuses: { [id]: { sessionName, status, lastLine, ... } } }
```

### 4. 删除会话（DELETE /api/sessions/[id]）

```
验证 session 存在 → 如是 conductor → 先删除所有 workers
→ 释放端口（releasePort）
→ DELETE FROM sessions → 立即返回（前端即时反馈）
→ runInBackground: 清理 worktree（非阻塞）
```

### 5. 分叉会话（POST /api/sessions/[id]/fork）

```
获取父 session → 创建新 session（继承 working_directory, model, system_prompt）
→ 复制父消息到新 session
→ 不复制 claude_session_id（首次附加时用 --fork-session 创建新分支）
→ 返回 { session, messagesCopied }
```

### 6. 摘要恢复（POST /api/sessions/[id]/summarize）

```
获取 session → 获取 tmux cwd
→ 尝试读取 Claude JSONL 历史文件（~/.claude/projects/{path}/{id}.jsonl）
→ 回退到 tmux scrollback 捕获
→ 调用 Claude CLI 生成摘要（claude -p "Summarize..."）
→ 创建新 session + 新 tmux session
→ 等待 Claude 就绪 → 发送上下文消息
→ 返回 { summary, newSession }
```

## 状态转换

```
                ┌──────────────────────┐
                │       idle           │
                │ (代理空闲，已确认)    │
                └──┬───────────────────┘
                   │ acknowledge
                   ▼
           ┌──────────────┐    activity detected    ┌──────────────┐
           │   waiting    │─────────────────────────▶│   running    │
           │ (需要关注)    │                          │ (代理工作中)  │
           └──────────────┘◀─────────────────────────└──────────────┘
                   ▲         cooldown expired             │
                   │        (未确认)                       │
                   │                                      │
                   │                 tmux session 关闭     │
                   │                                      ▼
                   │         ┌──────────────┐
                   └─────────│    dead      │
                             │ (会话不存在)  │
                             └──────────────┘
```

状态检测策略（`lib/status-detector.ts`）:

1. **Busy 指标**（最高优先级）：检测 "esc to interrupt"、spinner 字符、whimsical words + "tokens"
2. **等待模式**：检测 `[Y/n]`、`Allow?`、`Continue?` 等交互提示
3. **Spike 检测**：2 秒内 2 次 tmux activity 变更 → 确认持续活动
4. **Cooldown**：2 秒宽限期，活动停止后维持 running 状态
5. **Dead**：tmux session 不存在

## 数据模型

### sessions 表（核心字段）

| 字段                           | 类型    | 说明                                                                 |
| ------------------------------ | ------- | -------------------------------------------------------------------- |
| id                             | TEXT PK | UUID                                                                 |
| name                           | TEXT    | 会话名称                                                             |
| tmux_name                      | TEXT    | tmux 会话名：`{agentType}-{id}`                                      |
| status                         | TEXT    | 逻辑状态：idle/running/waiting/error                                 |
| working_directory              | TEXT    | 工作目录                                                             |
| agent_type                     | TEXT    | 代理类型：claude/codex/opencode/gemini/aider/cursor/amp/pi/omp/shell |
| model                          | TEXT    | 使用的模型                                                           |
| parent_session_id              | TEXT FK | 父会话（fork 来源）                                                  |
| claude_session_id              | TEXT    | Claude CLI 的会话 ID                                                 |
| project_id                     | TEXT FK | 所属项目                                                             |
| conductor_session_id           | TEXT FK | 编排中的 conductor（仅 worker）                                      |
| worker_task                    | TEXT    | Worker 任务描述                                                      |
| worker_status                  | TEXT    | Worker 状态：pending/running/completed/failed                        |
| worktree_path                  | TEXT    | Git worktree 路径                                                    |
| branch_name                    | TEXT    | Git 分支名                                                           |
| pr_url / pr_number / pr_status | TEXT    | PR 跟踪                                                              |
| auto_approve                   | INTEGER | 是否自动批准                                                         |
| system_prompt                  | TEXT    | 系统提示                                                             |

### messages 表

| 字段        | 类型       | 说明                    |
| ----------- | ---------- | ----------------------- |
| id          | INTEGER PK | 自增 ID                 |
| session_id  | TEXT FK    | 所属会话                |
| role        | TEXT       | user / assistant        |
| content     | TEXT       | JSON 数组格式的消息内容 |
| timestamp   | TEXT       | 创建时间                |
| duration_ms | INTEGER    | 消息耗时                |

### tool_calls 表

| 字段        | 类型       | 说明                            |
| ----------- | ---------- | ------------------------------- |
| id          | INTEGER PK | 自增 ID                         |
| message_id  | INTEGER FK | 所属消息                        |
| session_id  | TEXT FK    | 所属会话                        |
| tool_name   | TEXT       | 工具名                          |
| tool_input  | TEXT       | JSON 输入                       |
| tool_result | TEXT       | JSON 结果                       |
| status      | TEXT       | pending/running/completed/error |

## 排查路径

1. **会话无法创建** → 检查 `agentType` 是否有效（`lib/providers/registry.ts`）→ 检查 worktree 创建 → 检查端口分配
2. **会话状态不准确** → 查看 `lib/status-detector.ts` 的 spike/cooldown 逻辑 → 检查 tmux capture-pane 输出
3. **tmux 连不上** → `tmux list-sessions` 查看是否存在 → 检查 tmux_name 格式
4. **消息丢失** → 检查 messages 表 → 检查 claude_session_id 是否正确关联
5. **Worktree 清理失败** → 检查 `~/.agent-os/worktrees/` 目录 → 手动 `git worktree prune`
