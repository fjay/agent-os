# 一致性规则

## 概述

AgentOS 的数据一致性主要依赖以下机制：

1. better-sqlite3 的同步特性（Node.js 单线程串行化写入）
2. SQLite 外键的 `ON DELETE CASCADE` 声明
3. 应用层手动级联逻辑
4. WAL 模式 + busy_timeout 处理并发

**注意**: SQLite 默认不启用 `PRAGMA foreign_keys`，AgentOS 未显式启用此 pragma。CASCADE 行为在 foreign_keys 未启用时实际不生效，实际清理逻辑依赖应用层代码。

## 级联删除规则

### 自动级联（ON DELETE CASCADE）

以下关联设置了 `ON DELETE CASCADE`：

| 父表     | 子表                 | 外键字段   | 效果                                |
| -------- | -------------------- | ---------- | ----------------------------------- |
| sessions | messages             | session_id | 删除 session 自动清理消息           |
| sessions | tool_calls           | session_id | 删除 session 自动清理工具调用       |
| messages | tool_calls           | message_id | 删除 message 自动清理关联工具调用   |
| projects | dev_servers          | project_id | 删除 project 自动清理开发服务器实例 |
| projects | project_dev_servers  | project_id | 删除 project 自动清理配置模板       |
| projects | project_repositories | project_id | 删除 project 自动清理仓库记录       |

### 无 CASCADE 的外键

| 父表     | 子表     | 外键字段             | 处理方式                              |
| -------- | -------- | -------------------- | ------------------------------------- |
| sessions | sessions | parent_session_id    | 删除父 session 不会级联删除子 session |
| sessions | sessions | conductor_session_id | 删除 conductor 不会级联删除 workers   |
| projects | sessions | project_id           | 删除 project 需手动迁移 sessions      |
| groups   | sessions | group_path           | 旧版关联，已弃用                      |

## 手动级联规则

### 规则 1: 删除项目 -> 迁移 sessions

- **路径**: `lib/projects.ts:279-282`
- **逻辑**: 循环调用 `updateSessionProject(sessionId, 'uncategorized')`，将所有关联 sessions 迁移到 `uncategorized` 项目
- **风险**: 迁移完成后如果后续删除步骤失败，sessions 已迁移但项目记录残留

### 规则 2: 删除 conductor -> 清理 workers

- **路径**: `app/api/sessions/[id]/route.ts:160-168`
- **逻辑**: 手动循环查找并删除所有 `conductor_session_id` 指向当前 session 的 worker sessions
- **风险**: 部分删除成功、部分失败时，残留的 worker 成为孤儿

### 规则 3: 后台 worktree 清理

- **路径**: `app/api/sessions/[id]/route.ts:179-221`
- **逻辑**: worktree 清理在后台执行（`runInBackground`），不阻塞 API 响应
- **风险**: 如果后台清理失败，孤儿 worktree 会残留在文件系统中

## 默认数据保障

- **默认 group**: `path='sessions'` 的根分组通过 `INSERT OR IGNORE` 确保始终存在（`lib/db/schema.ts:32`）
- **默认 project**: `id='uncategorized'` 的项目通过 `INSERT OR IGNORE` 确保始终存在（`lib/db/schema.ts:124`）
- 新 session 默认关联 `uncategorized` 项目

## 端口分配并发安全

- **路径**: `lib/ports.ts`
- **逻辑**: `findAvailablePort()` 查询 DB 已分配端口 + `lsof` 检查系统端口
- **风险**: check-then-use 无锁模式。两个并发请求可能获得相同端口。单线程 Node.js 串行处理请求时风险低，但 HMR 多实例场景可能出问题
- **严重性**: 低 -- 实际并发场景少见

## sessions 表 status 字段的多源更新

status 字段可被多个来源更新，存在 last-write-wins 语义冲突：

| 来源                 | 路径                               | 触发条件                                    |
| -------------------- | ---------------------------------- | ------------------------------------------- |
| statusDetector       | `app/api/sessions/status/route.ts` | 轮询时检测到状态变化，同时更新 `updated_at` |
| ClaudeProcessManager | `lib/claude/process-manager.ts`    | 进程启动/退出/出错                          |
| PATCH API            | `app/api/sessions/[id]/route.ts`   | 手动更新                                    |
| Orchestration        | `lib/orchestration.ts`             | worker 状态变化                             |

better-sqlite3 同步执行保证无数据损坏，但 last-write-wins 可能导致状态短暂不准确。例如 statusDetector 将状态更新为 `idle`，紧接着 ClaudeProcessManager 将其覆盖为 `running`。

## 锁机制

| 锁类型       | 说明                                                                           | 代码路径                |
| ------------ | ------------------------------------------------------------------------------ | ----------------------- |
| 文件初始化锁 | `agent-os.db.init-lock`，忙等轮询 100ms，最长 10 秒，超时后强制删除 stale lock | `lib/db/index.ts:15-49` |
| WAL 模式     | 允许并发读取 + 单写入                                                          | `lib/db/index.ts:57`    |
| busy_timeout | 10000ms 等待写入冲突                                                           | `lib/db/index.ts:58`    |
| 单例连接     | Proxy 懒加载全局单例                                                           | `lib/db/index.ts:71-85` |

**缺失机制**:

- 无乐观锁（无 version 字段或 CAS 操作）
- 无悲观锁（无行级锁或应用层 mutex）
- 无分布式锁（无跨进程/跨实例锁机制）
- 无数据校验（无应用层 schema 验证如 Zod）
- 无审计日志（无数据变更审计追踪）

## 状态检测机制

### tmux 探测

- **路径**: `lib/status-detector.ts`
- **机制**: 通过 tmux 命令检测终端内容推断状态
- **状态流**: `running` (GREEN) -> `waiting` (YELLOW) -> `idle` (GRAY) -> `dead`
- **检测策略**: busy indicators -> waiting patterns -> spike detection -> cooldown (2 秒宽限期)

### 状态轮询

- **路径**: `data/statuses/queries.ts` `useSessionStatusesQuery()`
- **轮询间隔**: 有活跃会话时 5 秒，无活跃会话时 30 秒
- **服务端**: `app/api/sessions/status/route.ts` GET -- 批量获取所有 managed session 状态
- **状态变化追踪**: `previousStatuses` Map 记录上次状态，检测变化时更新 DB

## WebSocket 状态同步

### 终端 WebSocket

- **端点**: `/ws/terminal`（`server.ts:33-124`）
- **协议**: 原生 WebSocket（`ws` 库）
- **每个连接对应一个 `node-pty` 进程**

### 重连机制

- **路径**: `components/Terminal/hooks/websocket-connection.ts`
- **策略**: 指数退避重连
- **触发**: WebSocket close、页面可见性变化、浏览器休眠检测、pageshow/focus/online 事件

### Claude 进程管理 WebSocket

- **路径**: `lib/claude/process-manager.ts`
- **机制**: 每个 session 维护一个 `Set<WebSocket>` 客户端集合
- **广播**: `broadcastToSession()` 向所有订阅客户端推送事件

### 优雅关闭

- **路径**: `server.ts:130-157`
- **序列**: 关闭 WebSocket -> 杀死 PTY -> 关闭 HTTP -> 5 秒超时强制退出
