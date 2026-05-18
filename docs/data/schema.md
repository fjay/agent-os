# Schema 总览

## 数据库引擎

- **引擎**: better-sqlite3（SQLite 同步绑定）
- **数据库文件**: `agent-os.db`
- **WAL 文件**: `agent-os.db-wal`、`agent-os.db-shm`
- **日志模式**: WAL（Write-Ahead Logging），支持多进程并发读取
- **busy_timeout**: 10000ms

配置位置：`lib/db/index.ts:57-58`

```typescript
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 10000");
```

## 架构分层

AgentOS 数据库分为五层：

| 层            | 文件                   | 职责                                     |
| ------------- | ---------------------- | ---------------------------------------- |
| Schema 定义层 | `lib/db/schema.ts`     | 建表语句和初始数据                       |
| 迁移层        | `lib/db/migrations.ts` | 增量式 schema 变更管理                   |
| 查询层        | `lib/db/queries.ts`    | 预编译 SQL 语句缓存（PreparedStatement） |
| 类型层        | `lib/db/types.ts`      | TypeScript 接口定义                      |
| 前端数据层    | `data/` 目录           | TanStack React Query 前端缓存与 API 调用 |

数据库初始化入口：`lib/db/index.ts` -> `initDb()`，使用文件锁 (`agent-os.db.init-lock`) 保证多进程安全。

## 表总览

共 **8 张业务表 + 1 张迁移记录表**：

| 表名                   | 用途                      | 主键类型     | 关键特征                      |
| ---------------------- | ------------------------- | ------------ | ----------------------------- |
| `sessions`             | AI Agent 会话实例，核心表 | TEXT         | 自引用外键、支持 fork/编排    |
| `messages`             | 会话消息                  | INTEGER AUTO | JSON content                  |
| `tool_calls`           | 工具调用记录              | INTEGER AUTO | 冗余外键（message + session） |
| `projects`             | 项目组织单元              | TEXT         | 替代旧版 groups               |
| `dev_servers`          | 运行中的开发服务器实例    | TEXT         | 运行时状态跟踪                |
| `project_dev_servers`  | 项目开发服务器配置模板    | TEXT         | 配置定义，非运行实例          |
| `project_repositories` | 项目 Git 仓库             | TEXT         | 多仓库支持                    |
| `groups`               | 旧版会话分组              | TEXT         | **已弃用**，保留兼容          |
| `_migrations`          | 数据库迁移追踪            | INTEGER      | 防止重复执行                  |

## 索引总览

| 索引名                             | 表                   | 字段                 |
| ---------------------------------- | -------------------- | -------------------- |
| `idx_messages_session`             | messages             | session_id           |
| `idx_tool_calls_session`           | tool_calls           | session_id           |
| `idx_tool_calls_message`           | tool_calls           | message_id           |
| `idx_sessions_parent`              | sessions             | parent_session_id    |
| `idx_sessions_group`               | sessions             | group_path           |
| `idx_sessions_conductor`           | sessions             | conductor_session_id |
| `idx_sessions_project`             | sessions             | project_id           |
| `idx_dev_servers_project`          | dev_servers          | project_id           |
| `idx_project_dev_servers_project`  | project_dev_servers  | project_id           |
| `idx_project_repositories_project` | project_repositories | project_id           |

## 枚举类型汇总

以下枚举在 TypeScript 层定义，数据库中以 TEXT 存储：

| 枚举                  | 值                                                                                                        | 代码位置                    |
| --------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------- |
| AgentType             | `claude` \| `codex` \| `opencode` \| `gemini` \| `aider` \| `cursor` \| `amp` \| `pi` \| `omp` \| `shell` | `lib/providers/registry.ts` |
| Session.status        | `idle` \| `running` \| `waiting` \| `error`                                                               | `lib/db/types.ts`           |
| Session.worker_status | `pending` \| `running` \| `completed` \| `failed`                                                         | `lib/db/types.ts`           |
| Session.pr_status     | `open` \| `merged` \| `closed`                                                                            | `lib/db/types.ts`           |
| Message.role          | `user` \| `assistant`                                                                                     | `lib/db/types.ts`           |
| ToolCall.status       | `pending` \| `running` \| `completed` \| `error`                                                          | `lib/db/types.ts`           |
| DevServer.type        | `node` \| `docker`                                                                                        | `lib/db/types.ts`           |
| DevServer.status      | `stopped` \| `starting` \| `running` \| `failed`                                                          | `lib/db/types.ts`           |

## 前端数据层

前端使用 TanStack React Query 进行数据缓存和 API 交互，不直接操作数据库。各模块通过 API 端点访问数据：

| 模块         | 目录                 | API 端点                          |
| ------------ | -------------------- | --------------------------------- |
| sessions     | `data/sessions/`     | `/api/sessions`                   |
| projects     | `data/projects/`     | `/api/projects`                   |
| dev-servers  | `data/dev-servers/`  | `/api/dev-servers`                |
| repositories | `data/repositories/` | `/api/projects/[id]/repositories` |
| groups       | `data/groups/`       | `/api/groups`                     |
| statuses     | `data/statuses/`     | `/api/sessions/status`            |
| git          | `data/git/`          | `/api/git/*`                      |
| files        | `data/files/`        | `/api/files`                      |
| code-search  | `data/code-search/`  | `/api/code-search`                |

`data/git/`、`data/files/`、`data/code-search/` 不操作数据库，通过 API 调用文件系统和 Git 命令。

## 数据库迁移记录

所有迁移定义在 `lib/db/migrations.ts`，当前共 **13 个迁移**：

| ID  | 名称                                  | 说明                                                                   |
| --- | ------------------------------------- | ---------------------------------------------------------------------- |
| 1   | add_group_path_to_sessions            | sessions 新增 group_path 列                                            |
| 2   | add_agent_type_to_sessions            | sessions 新增 agent_type 列                                            |
| 3   | add_worktree_columns_to_sessions      | sessions 新增 worktree_path, branch_name, base_branch, dev_server_port |
| 4   | add_pr_tracking_to_sessions           | sessions 新增 pr_url, pr_number, pr_status                             |
| 5   | add_group_path_index                  | 创建 idx_sessions_group 索引                                           |
| 6   | add_orchestration_columns_to_sessions | sessions 新增 conductor_session_id, worker_task, worker_status 及索引  |
| 7   | add_auto_approve_to_sessions          | sessions 新增 auto_approve                                             |
| 8   | add_dev_server_columns                | dev_servers 新增 type, name, command, pid, working_directory           |
| 9   | add_project_id_to_sessions            | sessions 新增 project_id 外键及索引                                    |
| 10  | add_project_id_to_dev_servers         | dev_servers 新增 project_id，从 session_id 迁移数据                    |
| 11  | add_tmux_name_to_sessions             | sessions 新增 tmux_name，回填 agent_type-id                            |
| 12  | add_initial_prompt_to_projects        | projects 新增 initial_prompt                                           |
| 13  | add_project_repositories_table        | 创建 project_repositories 表及索引                                     |

迁移执行策略：

- 使用 `_migrations` 表追踪已执行的迁移 ID
- 使用 `INSERT OR IGNORE` 处理并发 worker 竞争
- `duplicate column / already exists` 错误被静默忽略并标记为已应用
- 每个迁移在独立 try-catch 中执行（`lib/db/migrations.ts:188-244`）

## 关键设计特点

1. **无 ORM**：全部使用手写 SQL，无 ORM 层
2. **预编译语句缓存**：`lib/db/queries.ts` 使用 Map 缓存 PreparedStatement
3. **自引用外键**：`sessions` 通过 `parent_session_id` 和 `conductor_session_id` 支持 fork 树和编排模式
4. **冗余外键**：`tool_calls` 同时引用 `messages(id)` 和 `sessions(id)`，后者用于加速查询
5. **JSON 存储字段**：`messages.content`、`tool_calls.tool_input`、`tool_calls.tool_result`、`dev_servers.ports` 使用 TEXT 存储 JSON
6. **全局单例连接**：`lib/db/index.ts` 使用 Proxy 实现懒加载数据库连接
