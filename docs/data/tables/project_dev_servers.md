# project_dev_servers 表

## 当前用途

存储项目关联的开发服务器**配置模板**。与 `dev_servers` 表不同，本表存储的是配置定义（启动命令、端口等），而非运行实例。一个项目可定义多个开发服务器配置模板。

## 关键字段

| 字段名         | 类型    | 约束                    | 说明                                        |
| -------------- | ------- | ----------------------- | ------------------------------------------- |
| `id`           | TEXT    | PRIMARY KEY             | 配置 ID（格式：`pds_{timestamp}_{random}`） |
| `project_id`   | TEXT    | NOT NULL                | 所属项目                                    |
| `name`         | TEXT    | NOT NULL                | 服务器名称                                  |
| `type`         | TEXT    | NOT NULL DEFAULT 'node' | 类型：`node` / `docker`                     |
| `command`      | TEXT    | NOT NULL                | 启动命令                                    |
| `port`         | INTEGER | --                      | 端口号                                      |
| `port_env_var` | TEXT    | --                      | 端口环境变量名                              |
| `sort_order`   | INTEGER | NOT NULL DEFAULT 0      | 排序权重                                    |

## 外键关系

| 字段         | 引用           | 级联              | 说明                    |
| ------------ | -------------- | ----------------- | ----------------------- |
| `project_id` | `projects(id)` | ON DELETE CASCADE | 随 project 删除自动清理 |

## 索引

| 索引名                            | 字段       | 用途           |
| --------------------------------- | ---------- | -------------- |
| `idx_project_dev_servers_project` | project_id | 按项目查询配置 |

## 相关代码路径

| 层      | 文件                | 行号    |
| ------- | ------------------- | ------- |
| Schema  | `lib/db/schema.ts`  | 92-102  |
| Type    | `lib/db/types.ts`   | 56-65   |
| Queries | `lib/db/queries.ts` | 221-247 |

## CRUD 操作

| 操作       | 函数名                    | 类型                         |
| ---------- | ------------------------- | ---------------------------- |
| 创建配置   | `createProjectDevServer`  | INSERT                       |
| 查询单个   | `getProjectDevServer`     | SELECT                       |
| 按项目查询 | `getProjectDevServers`    | SELECT（按 sort_order 排序） |
| 更新配置   | `updateProjectDevServer`  | UPDATE                       |
| 删除单个   | `deleteProjectDevServer`  | DELETE                       |
| 按项目删除 | `deleteProjectDevServers` | DELETE                       |

## 常见诊断场景

### 配置模板与实际实例不一致

- **症状**: 修改了配置模板但已运行的 dev_server 未更新
- **排查**: `project_dev_servers` 是配置模板，`dev_servers` 是运行实例，两者独立管理
- **路径**: 需重启 dev_server 才能应用新的配置模板

### 删除项目后配置未清理

- **症状**: 删除 project 后配置模板仍存在
- **排查**: 此情况不应发生（ON DELETE CASCADE），如出现需检查 foreign_keys pragma
- **路径**: `lib/db/schema.ts:92-102`（外键定义）
