# tool_calls 表

## 当前用途

记录 AI 助手在会话中发起的工具调用及其结果。每条 tool_call 记录关联到一条消息（`message_id`）和一个会话（`session_id`）。`session_id` 为冗余外键，用于加速按会话查询工具调用，避免通过 messages 表 JOIN。

工具调用的生命周期：`pending` -> `running` -> `completed` / `error`

## 关键字段

| 字段名        | 类型    | 约束                             | 说明                                                |
| ------------- | ------- | -------------------------------- | --------------------------------------------------- |
| `id`          | INTEGER | PRIMARY KEY AUTOINCREMENT        | 工具调用 ID                                         |
| `message_id`  | INTEGER | NOT NULL                         | 关联消息 ID                                         |
| `session_id`  | TEXT    | NOT NULL                         | 所属会话（冗余，便于查询）                          |
| `tool_name`   | TEXT    | NOT NULL                         | 工具名称                                            |
| `tool_input`  | TEXT    | NOT NULL                         | 工具输入参数（JSON）                                |
| `tool_result` | TEXT    | --                               | 工具返回结果（JSON）                                |
| `status`      | TEXT    | NOT NULL DEFAULT 'pending'       | 状态：`pending` / `running` / `completed` / `error` |
| `timestamp`   | TEXT    | NOT NULL DEFAULT datetime('now') | 时间戳                                              |

## 外键关系

| 字段         | 引用           | 级联              | 说明                    |
| ------------ | -------------- | ----------------- | ----------------------- |
| `message_id` | `messages(id)` | ON DELETE CASCADE | 随 message 删除自动清理 |
| `session_id` | `sessions(id)` | ON DELETE CASCADE | 随 session 删除自动清理 |

**冗余外键说明**: `tool_calls` 同时引用 `messages(id)` 和 `sessions(id)`。`session_id` 是冗余字段，用于加速按会话查询，避免通过 messages 表 JOIN。

## 索引

| 索引名                   | 字段       | 用途               |
| ------------------------ | ---------- | ------------------ |
| `idx_tool_calls_session` | session_id | 按会话查询工具调用 |
| `idx_tool_calls_message` | message_id | 按消息查询工具调用 |

## 相关代码路径

| 层      | 文件                | 行号    |
| ------- | ------------------- | ------- |
| Schema  | `lib/db/schema.ts`  | 46-57   |
| Type    | `lib/db/types.ts`   | 85-94   |
| Queries | `lib/db/queries.ts` | 138-164 |

## CRUD 操作

| 操作         | 函数名                 | 类型   |
| ------------ | ---------------------- | ------ |
| 创建工具调用 | `createToolCall`       | INSERT |
| 更新结果     | `updateToolCallResult` | UPDATE |
| 更新状态     | `updateToolCallStatus` | UPDATE |
| 按会话查询   | `getSessionToolCalls`  | SELECT |
| 按消息查询   | `getMessageToolCalls`  | SELECT |

## 常见诊断场景

### 工具调用卡在 pending 状态

- **症状**: tool_call 记录的 status 长期为 `pending`，无 `tool_result`
- **排查**: 检查对应的 session 是否正常运行，进程是否意外退出
- **路径**: `lib/claude/process-manager.ts`（进程管理）、`lib/db/queries.ts` 中 `updateToolCallStatus`

### tool_result 解析失败

- **症状**: 前端显示工具调用结果为空或报错
- **排查**: 检查 `tool_result` 字段是否为合法 JSON，部分工具可能返回超大结果被截断
- **路径**: `lib/db/queries.ts` 中 `updateToolCallResult`

### 孤儿 tool_calls（冗余外键不一致）

- **症状**: `session_id` 指向已删除 session，但 `message_id` 关联的 message 仍存在
- **排查**: 查询 session_id 不在 sessions 表中的 tool_calls 记录
- **路径**: 此场景在正常 CASCADE 行为下不应发生，如出现需检查 foreign_keys pragma 是否启用
