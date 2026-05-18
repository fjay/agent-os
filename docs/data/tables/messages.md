# messages 表

## 当前用途

存储 AI 会话中的用户输入和助手回复。每条消息的 `content` 字段为 JSON 数组格式，可能包含文本、代码块等多种内容类型。messages 通过 `session_id` 外键关联到 sessions 表，随 session 删除而级联清理。

## 关键字段

| 字段名        | 类型    | 约束                             | 说明                       |
| ------------- | ------- | -------------------------------- | -------------------------- |
| `id`          | INTEGER | PRIMARY KEY AUTOINCREMENT        | 消息 ID                    |
| `session_id`  | TEXT    | NOT NULL                         | 所属会话                   |
| `role`        | TEXT    | NOT NULL                         | 角色：`user` / `assistant` |
| `content`     | TEXT    | NOT NULL                         | 消息内容（JSON 数组）      |
| `timestamp`   | TEXT    | NOT NULL DEFAULT datetime('now') | 时间戳                     |
| `duration_ms` | INTEGER | --                               | 响应耗时（毫秒）           |

## 外键关系

| 字段         | 引用           | 级联              | 说明                    |
| ------------ | -------------- | ----------------- | ----------------------- |
| `session_id` | `sessions(id)` | ON DELETE CASCADE | 随 session 删除自动清理 |

## 索引

| 索引名                 | 字段       | 用途           |
| ---------------------- | ---------- | -------------- |
| `idx_messages_session` | session_id | 按会话查询消息 |

## 相关代码路径

| 层      | 文件                | 行号    |
| ------- | ------------------- | ------- |
| Schema  | `lib/db/schema.ts`  | 35-44   |
| Type    | `lib/db/types.ts`   | 77-83   |
| Queries | `lib/db/queries.ts` | 115-136 |

## CRUD 操作

| 操作         | 函数名                  | 类型   |
| ------------ | ----------------------- | ------ |
| 创建消息     | `createMessage`         | INSERT |
| 查询会话消息 | `getSessionMessages`    | SELECT |
| 查询最后一条 | `getLastMessage`        | SELECT |
| 更新响应耗时 | `updateMessageDuration` | UPDATE |

## 常见诊断场景

### 消息内容解析失败

- **症状**: 前端显示消息内容为空或报错
- **排查**: 检查 `content` 字段是否为合法 JSON 数组，空字符串或非 JSON 格式会导致解析失败
- **路径**: `data/sessions/queries.ts`（前端渲染逻辑）

### fork 后消息缺失

- **症状**: fork 子会话的消息数量少于父会话
- **排查**: 对比父子会话的 messages 记录，检查 fork 操作是否在消息复制中途失败
- **路径**: `app/api/sessions/route.ts:145-188`（fork 逻辑循环调用 `createMessage`，无事务保护）

### 响应耗时不准确

- **症状**: `duration_ms` 为 NULL 或值异常
- **排查**: 确认 `updateMessageDuration` 是否在正确的时机被调用
- **路径**: `lib/db/queries.ts` 中 `updateMessageDuration`
