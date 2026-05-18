# 事务分析

## 概述

AgentOS 使用 better-sqlite3 的同步 API，所有数据库操作均为单条语句执行。**项目未使用显式事务包装**（`db.transaction`、`BEGIN`、`COMMIT`、`ROLLBACK` 全项目搜索无结果）。

每条 SQL 语句在 better-sqlite3 中自动在独立事务中执行（自动提交模式）。涉及多步操作的场景存在数据一致性风险。

## 并发控制基础

| 机制         | 说明                                   | 代码路径                |
| ------------ | -------------------------------------- | ----------------------- |
| WAL 模式     | 允许并发读取 + 单写入                  | `lib/db/index.ts:57`    |
| busy_timeout | 10000ms，写入冲突时等待 10 秒          | `lib/db/index.ts:58`    |
| 文件初始化锁 | 保护 schema 创建 + migration 执行      | `lib/db/index.ts:15-49` |
| 单例连接     | Proxy 懒加载，Node.js 单线程串行化写入 | `lib/db/index.ts:71-85` |

## 风险点

### 风险 1: 会话创建 + 消息复制（fork）

- **路径**: `app/api/sessions/route.ts` POST handler（第 145-188 行）
- **操作序列**: `createSession` -> `updateSessionWorktree` -> `updateClaudeId` -> 循环 `createMessage`（复制父会话消息）
- **风险**: 如果消息复制过程中出错，会话已创建但消息不完整。fork 出来的子会话只有部分消息，用户体验断裂。
- **严重性**: 中 -- fork 后可删除重建，但用户可能未察觉消息缺失

### 风险 2: 会话删除 + worker 清理

- **路径**: `app/api/sessions/[id]/route.ts` DELETE handler（第 149-231 行）
- **操作序列**: 循环 `killWorker` -> `deleteSession(worker)` -> `releasePort` -> `deleteSession(main)` -> 后台 `deleteWorktree`
- **风险**: worker 删除部分成功、部分失败时，数据处于中间状态。已删除的 worker session 不会回滚，残留的 worker 可能成为孤儿。
- **严重性**: 高 -- 孤儿 worker 会话持续占用资源

### 风险 3: 项目删除 + 级联迁移

- **路径**: `lib/projects.ts` `deleteProject()`（第 274-293 行）
- **操作序列**: 循环 `updateSessionProject`（迁移 sessions 到 uncategorized） -> `deleteDevServersByProject` -> `deleteProjectDevServers` -> `deleteProject`
- **风险**: sessions 迁移到 uncategorized 后，如果后续删除步骤失败，项目数据部分残留。sessions 已不属于原项目但项目记录仍在。
- **严重性**: 中 -- 可手动清理残留项目数据

### 风险 4: 仓库 Primary 标志管理

- **路径**: `lib/projects.ts` `addProjectRepository()`（第 540-565 行）
- **操作序列**: 循环 `updateProjectRepository`（清除其他 primary） -> `createProjectRepository`
- **风险**: 清除 primary 与设置新 primary 之间非原子。并发操作可能导致同一项目下多个仓库标记为 primary，或所有仓库都没有 primary 标记。
- **严重性**: 低 -- 可通过应用层查询修复

## 迁移事务

- **路径**: `lib/db/migrations.ts` `runMigrations()`（第 188-244 行）
- **机制**: 每个迁移在独立 try-catch 中执行，使用 `INSERT OR IGNORE INTO _migrations` 记录
- **风险**: 每个迁移的 `up()` 中的多条 DDL/DML 语句不在同一事务中。如果迁移中途失败，已执行的语句不会回滚，但迁移被标记为已应用（`duplicate column / already exists` 错误被静默忽略）。
- **缓解**: 静默忽略策略使得重试时跳过已执行的变更

## 幂等机制

| 机制             | 使用位置                           | 代码路径                                    |
| ---------------- | ---------------------------------- | ------------------------------------------- |
| INSERT OR IGNORE | 默认 group 插入                    | `lib/db/schema.ts:32`                       |
| INSERT OR IGNORE | 默认 uncategorized 项目插入        | `lib/db/schema.ts:124`                      |
| INSERT OR IGNORE | 并发迁移记录                       | `lib/db/migrations.ts:207`                  |
| 条件更新         | claude_session_id 仅在值变化时更新 | `app/api/sessions/status/route.ts:218-220`  |
| UUID 碰撞概率    | Session ID (UUID v4)               | `randomUUID()`                              |
| 时间戳+随机      | Project/DevServer/Repository ID    | `proj_${Date.now().toString(36)}_${random}` |

**缺失**: 没有应用层的去重逻辑（如 dedup key、request id、idempotency token）。

## ID 生成策略

| 实体              | 策略                  | 代码               |
| ----------------- | --------------------- | ------------------ |
| Session           | UUID v4               | `randomUUID()`     |
| Project           | 时间戳 + 随机         | `proj_{ts}_{rand}` |
| Dev Server Config | 时间戳 + 随机         | `pds_{ts}_{rand}`  |
| Repository        | 时间戳 + 随机         | `repo_{ts}_{rand}` |
| Message           | INTEGER AUTOINCREMENT | SQLite 内置        |
| Tool Call         | INTEGER AUTOINCREMENT | SQLite 内置        |
