# groups 表（已弃用）

> **弃用说明**: groups 表是旧版会话分组系统，已被 `projects` 表完全替代。保留此表仅用于数据迁移兼容，不建议新增相关功能。

## 当前用途

旧版会话分组系统。通过层级路径（`path`）组织 sessions，已被 `projects` 替代。sessions 表中的 `group_path` 字段仍引用此表，但新功能应使用 `project_id` 关联 `projects` 表。

## 关键字段

| 字段名       | 类型    | 约束                             | 说明                                |
| ------------ | ------- | -------------------------------- | ----------------------------------- |
| `path`       | TEXT    | PRIMARY KEY                      | 分组路径（层级路径，如 `sessions`） |
| `name`       | TEXT    | NOT NULL                         | 显示名称                            |
| `expanded`   | INTEGER | NOT NULL DEFAULT 1               | UI 展开状态                         |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0               | 排序权重                            |
| `created_at` | TEXT    | NOT NULL DEFAULT datetime('now') | 创建时间                            |

## 外键关系

groups 表无外键引用其他表。sessions 表通过 `group_path` 字段引用此表：

| 来源表     | 字段       | 说明                         |
| ---------- | ---------- | ---------------------------- |
| `sessions` | group_path | 旧版关联，无 CASCADE，已弃用 |

## 初始数据

默认插入 `path='sessions'` 的根分组，通过 `INSERT OR IGNORE` 确保始终存在。

代码位置：`lib/db/schema.ts:32`

## 相关代码路径

| 层       | 文件                       | 行号    |
| -------- | -------------------------- | ------- |
| Schema   | `lib/db/schema.ts`         | 23-29   |
| Type     | `lib/db/types.ts`          | 34-40   |
| Queries  | `lib/db/queries.ts`        | 166-186 |
| 前端数据 | `data/groups/mutations.ts` | --      |

## CRUD 操作

| 操作         | 函数名                | 类型   |
| ------------ | --------------------- | ------ |
| 创建分组     | `createGroup`         | INSERT |
| 查询全部分组 | `getAllGroups`        | SELECT |
| 查询单个分组 | `getGroup`            | SELECT |
| 更新名称     | `updateGroupName`     | UPDATE |
| 更新展开状态 | `updateGroupExpanded` | UPDATE |
| 更新排序     | `updateGroupOrder`    | UPDATE |
| 删除分组     | `deleteGroup`         | DELETE |

## 常见诊断场景

### sessions 仍关联旧分组

- **症状**: session 的 `group_path` 指向已删除或不存在的 group
- **排查**: 查询 `group_path` 不在 groups 表中的 sessions 记录
- **路径**: 此为迁移遗留问题，应通过迁移将 sessions 转移到 projects 体系

### 与 projects 体系冲突

- **症状**: session 同时有 `group_path` 和 `project_id`，前端显示不一致
- **排查**: 确认前端优先使用 `project_id`，`group_path` 仅作兼容
- **路径**: `data/sessions/queries.ts`（前端会话查询逻辑）
