# project_repositories 表

## 当前用途

支持一个项目关联多个 Git 仓库（多仓库支持）。记录仓库名称、路径和主仓库标记。通过迁移 13 创建（`lib/db/migrations.ts:169-185`）。

## 关键字段

| 字段名       | 类型    | 约束               | 说明                                             |
| ------------ | ------- | ------------------ | ------------------------------------------------ |
| `id`         | TEXT    | PRIMARY KEY        | 仓库记录 ID（格式：`repo_{timestamp}_{random}`） |
| `project_id` | TEXT    | NOT NULL           | 所属项目                                         |
| `name`       | TEXT    | NOT NULL           | 仓库名称                                         |
| `path`       | TEXT    | NOT NULL           | 仓库文件系统路径                                 |
| `is_primary` | INTEGER | NOT NULL DEFAULT 0 | 是否为主仓库                                     |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | 排序权重                                         |

## 外键关系

| 字段         | 引用           | 级联              | 说明                    |
| ------------ | -------------- | ----------------- | ----------------------- |
| `project_id` | `projects(id)` | ON DELETE CASCADE | 随 project 删除自动清理 |

## 索引

| 索引名                             | 字段       | 用途           |
| ---------------------------------- | ---------- | -------------- |
| `idx_project_repositories_project` | project_id | 按项目查询仓库 |

## 相关代码路径

| 层       | 文件                           | 行号                |
| -------- | ------------------------------ | ------------------- |
| Schema   | `lib/db/schema.ts`             | 105-113（基础结构） |
| 迁移     | `lib/db/migrations.ts`         | 169-185（创建此表） |
| Type     | `lib/db/types.ts`              | 67-74               |
| Queries  | `lib/db/queries.ts`            | 250-276             |
| 前端数据 | `data/repositories/queries.ts` | --                  |

## CRUD 操作

| 操作       | 函数名                      | 类型                         |
| ---------- | --------------------------- | ---------------------------- |
| 创建仓库   | `createProjectRepository`   | INSERT                       |
| 查询单个   | `getProjectRepository`      | SELECT                       |
| 按项目查询 | `getProjectRepositories`    | SELECT（按 sort_order 排序） |
| 更新仓库   | `updateProjectRepository`   | UPDATE                       |
| 删除单个   | `deleteProjectRepository`   | DELETE                       |
| 按项目删除 | `deleteProjectRepositories` | DELETE                       |

## 常见诊断场景

### 多个仓库标记为 primary

- **症状**: 同一项目下多个仓库的 `is_primary=1`
- **排查**: 检查 `addProjectRepository` 中的 primary 标志管理逻辑
- **路径**: `lib/projects.ts:540-565`（清除旧 primary 与设置新 primary 之间非原子，存在竞态风险）

### 仓库路径无效

- **症状**: `path` 指向的文件系统目录不存在
- **排查**: 直接检查 `path` 字段对应的目录是否存在
- **路径**: 此为外部因素（目录被手动删除），系统不主动校验路径有效性

### 迁移 13 未执行

- **症状**: 项目中无法使用多仓库功能
- **排查**: 检查 `_migrations` 表中是否存在 id=13 的记录
- **路径**: `lib/db/migrations.ts:169-185`
