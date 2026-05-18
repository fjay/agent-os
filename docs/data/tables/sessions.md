# sessions 表

## 当前用途

`sessions` 是 AgentOS 系统的核心表，存储所有 AI Agent 会话的元数据。支持以下功能：

- 会话的创建、重命名、删除
- 父/子会话 fork 关系
- conductor/worker 编排模式（一个 conductor 管理多个 worker）
- Git worktree 隔离开发
- PR 追踪
- tmux 会话关联
- 多 Agent 类型支持（claude/codex/opencode/gemini/aider/cursor/amp/pi/omp/shell）

## 关键字段

| 字段名                 | 类型    | 约束                             | 说明                                                                       |
| ---------------------- | ------- | -------------------------------- | -------------------------------------------------------------------------- |
| `id`                   | TEXT    | PRIMARY KEY                      | 会话唯一 ID（UUID v4）                                                     |
| `name`                 | TEXT    | NOT NULL                         | 会话显示名称                                                               |
| `tmux_name`            | TEXT    | --                               | tmux 会话名（迁移 11 新增，回填为 `agent_type-id`）                        |
| `created_at`           | TEXT    | NOT NULL DEFAULT datetime('now') | 创建时间                                                                   |
| `updated_at`           | TEXT    | NOT NULL DEFAULT datetime('now') | 更新时间                                                                   |
| `status`               | TEXT    | NOT NULL DEFAULT 'idle'          | 会话状态：`idle` / `running` / `waiting` / `error`                         |
| `working_directory`    | TEXT    | NOT NULL DEFAULT '~'             | 工作目录                                                                   |
| `parent_session_id`    | TEXT    | --                               | 父会话 ID（fork 关系）                                                     |
| `claude_session_id`    | TEXT    | --                               | Claude 官方会话 ID                                                         |
| `model`                | TEXT    | DEFAULT 'sonnet'                 | 使用的 AI 模型                                                             |
| `system_prompt`        | TEXT    | --                               | 系统提示词                                                                 |
| `group_path`           | TEXT    | NOT NULL DEFAULT 'sessions'      | 旧版分组路径（已弃用，迁移 1 新增）                                        |
| `agent_type`           | TEXT    | NOT NULL DEFAULT 'claude'        | Agent 类型（迁移 2 新增）                                                  |
| `auto_approve`         | INTEGER | NOT NULL DEFAULT 0               | 是否自动批准工具调用（迁移 7 新增）                                        |
| `worktree_path`        | TEXT    | --                               | Git worktree 路径（迁移 3 新增）                                           |
| `branch_name`          | TEXT    | --                               | 当前 Git 分支名（迁移 3 新增）                                             |
| `base_branch`          | TEXT    | --                               | 基础分支名（迁移 3 新增）                                                  |
| `dev_server_port`      | INTEGER | --                               | 开发服务器端口（迁移 3 新增）                                              |
| `pr_url`               | TEXT    | --                               | PR 链接（迁移 4 新增）                                                     |
| `pr_number`            | INTEGER | --                               | PR 编号（迁移 4 新增）                                                     |
| `pr_status`            | TEXT    | --                               | PR 状态：`open` / `merged` / `closed`（迁移 4 新增）                       |
| `conductor_session_id` | TEXT    | --                               | Conductor 会话 ID，自引用外键（迁移 6 新增）                               |
| `worker_task`          | TEXT    | --                               | Worker 任务描述（迁移 6 新增）                                             |
| `worker_status`        | TEXT    | --                               | Worker 状态：`pending` / `running` / `completed` / `failed`（迁移 6 新增） |
| `project_id`           | TEXT    | --                               | 所属项目 ID（迁移 9 新增）                                                 |

## 外键关系

| 字段                   | 引用           | 级联       | 说明                          |
| ---------------------- | -------------- | ---------- | ----------------------------- |
| `parent_session_id`    | `sessions(id)` | 无 CASCADE | 自引用，支持 fork 树          |
| `conductor_session_id` | `sessions(id)` | 无 CASCADE | 自引用，conductor/worker 编排 |
| `project_id`           | `projects(id)` | 无 CASCADE | 所属项目                      |

## 索引

| 索引名                   | 字段                 | 用途                   |
| ------------------------ | -------------------- | ---------------------- |
| `idx_sessions_parent`    | parent_session_id    | 查找 fork 子会话       |
| `idx_sessions_group`     | group_path           | 旧版分组查询（已弃用） |
| `idx_sessions_conductor` | conductor_session_id | 编排查询               |
| `idx_sessions_project`   | project_id           | 按项目查询             |

## 相关代码路径

| 层           | 文件                                    | 行号    |
| ------------ | --------------------------------------- | ------- |
| Schema       | `lib/db/schema.ts`                      | 6-21    |
| Type         | `lib/db/types.ts`                       | 3-32    |
| Queries      | `lib/db/queries.ts`                     | 17-113  |
| 前端数据     | `data/sessions/queries.ts`              | --      |
| 状态检测     | `lib/status-detector.ts`                | --      |
| 进程管理     | `lib/claude/process-manager.ts`         | --      |
| 编排         | `lib/orchestration.ts`                  | --      |
| API 创建     | `app/api/sessions/route.ts` POST        | 145-188 |
| API 删除     | `app/api/sessions/[id]/route.ts` DELETE | 149-231 |
| API 状态更新 | `app/api/sessions/[id]/route.ts` PATCH  | --      |
| 批量状态     | `app/api/sessions/status/route.ts` GET  | --      |

## CRUD 操作

| 操作             | 函数名                                                                                                    | 类型   |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| 创建会话         | `createSession` / `createWorkerSession`                                                                   | INSERT |
| 查询会话         | `getSession` / `getAllSessions` / `getSessionsByGroup` / `getSessionsByProject` / `getWorkersByConductor` | SELECT |
| 更新状态         | `updateSessionStatus`                                                                                     | UPDATE |
| 更新 Claude ID   | `updateSessionClaudeId`                                                                                   | UPDATE |
| 更新名称         | `updateSessionName`                                                                                       | UPDATE |
| 更新 worktree    | `updateSessionWorktree`                                                                                   | UPDATE |
| 更新 PR          | `updateSessionPR`                                                                                         | UPDATE |
| 更新分组         | `updateSessionGroup`                                                                                      | UPDATE |
| 更新项目         | `updateSessionProject`                                                                                    | UPDATE |
| 更新 worker 状态 | `updateWorkerStatus`                                                                                      | UPDATE |
| 删除会话         | `deleteSession`                                                                                           | DELETE |

## 状态更新来源

status 字段可被多个来源更新，存在 last-write-wins 的语义冲突（better-sqlite3 同步执行保证无数据损坏）：

| 来源                 | 路径                               | 触发条件             |
| -------------------- | ---------------------------------- | -------------------- |
| statusDetector       | `app/api/sessions/status/route.ts` | 轮询时检测到状态变化 |
| ClaudeProcessManager | `lib/claude/process-manager.ts`    | 进程启动/退出/出错   |
| PATCH API            | `app/api/sessions/[id]/route.ts`   | 手动更新             |
| Orchestration        | `lib/orchestration.ts`             | worker 状态变化      |

## 常见诊断场景

### 会话状态异常

- **症状**: session 显示 `running` 但实际已停止
- **排查**: 检查 `updated_at` 是否长时间未更新，结合 `lib/status-detector.ts` 的 tmux 探测结果判断
- **路径**: `lib/status-detector.ts`、`app/api/sessions/status/route.ts`

### fork 后消息不完整

- **症状**: fork 的子会话消息数量少于父会话
- **排查**: 对比父会话和子会话的 messages 表记录数
- **路径**: `app/api/sessions/route.ts:145-188`（fork 逻辑，无事务包装，存在部分失败风险）

### worker 会话残留

- **症状**: 删除 conductor 后 worker sessions 仍存在
- **排查**: 查询 `conductor_session_id` 指向已删除 session 的记录
- **路径**: `app/api/sessions/[id]/route.ts:160-168`（手动循环删除 workers）

### worktree 未清理

- **症状**: 删除 session 后 `.claude/worktrees/` 下残留目录
- **排查**: 对比 sessions 表已删除记录与文件系统 worktree 目录
- **路径**: `app/api/sessions/[id]/route.ts:179-221`（后台清理，失败时无重试）
