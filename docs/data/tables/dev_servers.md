# dev_servers 表

## 当前用途

记录当前运行中的开发服务器实例信息，包括 PID、容器 ID、端口映射等运行时状态。与 `project_dev_servers` 不同，本表存储的是实际运行的服务器实例，而 `project_dev_servers` 存储的是配置模板。

服务器实例的生命周期：`stopped` -> `starting` -> `running` -> `stopped` / `failed`

## 关键字段

| 字段名              | 类型    | 约束                             | 说明                                                    |
| ------------------- | ------- | -------------------------------- | ------------------------------------------------------- |
| `id`                | TEXT    | PRIMARY KEY                      | 服务器实例 ID                                           |
| `project_id`        | TEXT    | NOT NULL                         | 所属项目                                                |
| `type`              | TEXT    | NOT NULL DEFAULT 'node'          | 类型：`node` / `docker`（迁移 8 新增）                  |
| `name`              | TEXT    | NOT NULL DEFAULT ''              | 名称（迁移 8 新增）                                     |
| `command`           | TEXT    | NOT NULL DEFAULT ''              | 启动命令（迁移 8 新增）                                 |
| `status`            | TEXT    | NOT NULL DEFAULT 'stopped'       | 运行状态：`stopped` / `starting` / `running` / `failed` |
| `pid`               | INTEGER | --                               | 进程 PID（迁移 8 新增）                                 |
| `container_id`      | TEXT    | --                               | Docker 容器 ID                                          |
| `ports`             | TEXT    | NOT NULL DEFAULT '[]'            | 端口列表（JSON 数组）                                   |
| `working_directory` | TEXT    | NOT NULL DEFAULT ''              | 工作目录（迁移 8 新增）                                 |
| `created_at`        | TEXT    | NOT NULL DEFAULT datetime('now') | 创建时间                                                |
| `updated_at`        | TEXT    | NOT NULL DEFAULT datetime('now') | 更新时间                                                |

## 外键关系

| 字段         | 引用           | 级联              | 说明                    |
| ------------ | -------------- | ----------------- | ----------------------- |
| `project_id` | `projects(id)` | ON DELETE CASCADE | 随 project 删除自动清理 |

## 索引

| 索引名                    | 字段       | 用途                                 |
| ------------------------- | ---------- | ------------------------------------ |
| `idx_dev_servers_project` | project_id | 按项目查询开发服务器（迁移 10 新增） |

## 相关代码路径

| 层       | 文件                          | 行号    |
| -------- | ----------------------------- | ------- |
| Schema   | `lib/db/schema.ts`            | 60-74   |
| Type     | `lib/db/types.ts`             | 96-112  |
| Queries  | `lib/db/queries.ts`           | 279-320 |
| 前端数据 | `data/dev-servers/queries.ts` | --      |
| 端口分配 | `lib/ports.ts`                | --      |

## CRUD 操作

| 操作       | 函数名                      | 类型   |
| ---------- | --------------------------- | ------ |
| 创建实例   | `createDevServer`           | INSERT |
| 查询单个   | `getDevServer`              | SELECT |
| 查询全部   | `getAllDevServers`          | SELECT |
| 按项目查询 | `getDevServersByProject`    | SELECT |
| 更新状态   | `updateDevServerStatus`     | UPDATE |
| 更新 PID   | `updateDevServerPid`        | UPDATE |
| 更新信息   | `updateDevServer`           | UPDATE |
| 删除单个   | `deleteDevServer`           | DELETE |
| 按项目删除 | `deleteDevServersByProject` | DELETE |

## 常见诊断场景

### 服务器状态与实际不符

- **症状**: dev_server 显示 `running` 但实际进程已退出
- **排查**: 检查 `pid` 字段，通过 `ps` 命令验证进程是否存在；检查 `updated_at` 判断状态是否过期
- **路径**: `lib/db/queries.ts` 中 `updateDevServerStatus`

### 端口冲突

- **症状**: 新启动的开发服务器端口与已有实例冲突
- **排查**: 检查 `ports` 字段（JSON 数组），结合 `lsof` 验证端口占用
- **路径**: `lib/ports.ts` 中 `findAvailablePort()`（check-then-use 无锁，HMR 多实例时可能竞态）

### Docker 容器残留

- **症状**: dev_server 已删除但 Docker 容器仍在运行
- **排查**: 检查 `container_id` 对应的容器状态
- **路径**: 删除逻辑需确保先停止容器再删除记录

### 迁移 10 前的旧数据

- **症状**: dev_servers 的 `project_id` 为空
- **排查**: 迁移 10 将 `session_id` 数据迁移到 `project_id`，如果迁移失败则 `project_id` 为 NULL
- **路径**: `lib/db/migrations.ts` 中迁移 10
