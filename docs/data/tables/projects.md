# projects 表

## 当前用途

组织管理多个 AI 会话的顶层容器，替代旧版 `groups` 表。每个项目有独立的工作目录、默认模型和 Agent 类型配置。系统中存在一个不可删除的默认项目 `uncategorized`，未分配项目的会话归属此项目。

## 关键字段

| 字段名              | 类型    | 约束                             | 说明                                         |
| ------------------- | ------- | -------------------------------- | -------------------------------------------- |
| `id`                | TEXT    | PRIMARY KEY                      | 项目 ID（格式：`proj_{timestamp}_{random}`） |
| `name`              | TEXT    | NOT NULL                         | 项目名称                                     |
| `working_directory` | TEXT    | NOT NULL                         | 项目根目录                                   |
| `agent_type`        | TEXT    | NOT NULL DEFAULT 'claude'        | 默认 Agent 类型                              |
| `default_model`     | TEXT    | NOT NULL DEFAULT 'sonnet'        | 默认 AI 模型                                 |
| `initial_prompt`    | TEXT    | --                               | 创建会话时的默认初始提示词（迁移 12 新增）   |
| `expanded`          | INTEGER | NOT NULL DEFAULT 1               | UI 展开状态                                  |
| `sort_order`        | INTEGER | NOT NULL DEFAULT 0               | 排序权重                                     |
| `is_uncategorized`  | INTEGER | NOT NULL DEFAULT 0               | 是否为"未分类"默认项目                       |
| `created_at`        | TEXT    | NOT NULL DEFAULT datetime('now') | 创建时间                                     |
| `updated_at`        | TEXT    | NOT NULL DEFAULT datetime('now') | 更新时间                                     |

## 外键关系

projects 表无外键引用其他表。以下表引用 projects：

| 来源表                 | 字段       | 级联                     |
| ---------------------- | ---------- | ------------------------ |
| `sessions`             | project_id | 无 CASCADE（需手动迁移） |
| `dev_servers`          | project_id | ON DELETE CASCADE        |
| `project_dev_servers`  | project_id | ON DELETE CASCADE        |
| `project_repositories` | project_id | ON DELETE CASCADE        |

## 初始数据

默认插入 `id='uncategorized'` 的未分类项目（`is_uncategorized=1, sort_order=999999`），通过 `INSERT OR IGNORE` 确保始终存在。

代码位置：`lib/db/schema.ts:124`

## 相关代码路径

| 层       | 文件                       | 行号    |
| -------- | -------------------------- | ------- |
| Schema   | `lib/db/schema.ts`         | 77-89   |
| Type     | `lib/db/types.ts`          | 42-54   |
| Queries  | `lib/db/queries.ts`        | 189-218 |
| 前端数据 | `data/projects/queries.ts` | --      |
| 业务逻辑 | `lib/projects.ts`          | --      |
| 删除逻辑 | `lib/projects.ts`          | 274-293 |

## CRUD 操作

| 操作         | 函数名                  | 类型                                                             |
| ------------ | ----------------------- | ---------------------------------------------------------------- |
| 创建项目     | `createProject`         | INSERT                                                           |
| 查询单个项目 | `getProject`            | SELECT                                                           |
| 查询全部项目 | `getAllProjects`        | SELECT（按 is_uncategorized ASC, sort_order ASC, name ASC 排序） |
| 更新项目     | `updateProject`         | UPDATE                                                           |
| 更新展开状态 | `updateProjectExpanded` | UPDATE                                                           |
| 更新排序     | `updateProjectOrder`    | UPDATE                                                           |
| 删除项目     | `deleteProject`         | DELETE（禁止删除 is_uncategorized=1 的项目）                     |

## 常见诊断场景

### 项目删除失败

- **症状**: 删除项目时返回错误
- **排查**: 检查 `is_uncategorized` 是否为 1，默认的 `uncategorized` 项目不允许删除
- **路径**: `lib/projects.ts:274-293`（`deleteProject` 函数中的保护检查）

### 项目删除后 sessions 残留

- **症状**: 删除项目后，原属于该项目的 sessions 未迁移到 uncategorized
- **排查**: 查询 `project_id` 指向已删除项目的 sessions
- **路径**: `lib/projects.ts:279-282`（手动迁移 sessions 到 uncategorized，无事务保护）

### 项目排序异常

- **症状**: 项目列表显示顺序不符合预期
- **排查**: 检查 `sort_order` 值是否正确，`uncategorized` 项目 `sort_order=999999` 应排在最后
- **路径**: `lib/db/queries.ts` 中 `getAllProjects` 的排序逻辑
