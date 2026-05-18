# 项目管理

## 概述

项目（Project）是 AgentOS 中组织会话的顶层容器。每个项目有独立的工作目录、默认代理类型、默认模型、初始提示词，以及关联的 dev server 配置和代码仓库配置。会话从项目继承设置。支持多仓库（multi-repo）配置，允许一个项目管理多个 Git 仓库的联合状态。

## 核心代码路径

### API 路由

- `app/api/projects/route.ts` — 项目列表/创建
- `app/api/projects/[id]/route.ts` — 项目 CRUD
- `app/api/projects/detect/route.ts` — 目录检测
- `app/api/projects/[id]/detect/route.ts` — 项目内检测
- `app/api/projects/[id]/dev-servers/route.ts` — dev server 配置
- `app/api/projects/[id]/dev-servers/[dsId]/route.ts` — 配置 CRUD
- `app/api/projects/[id]/repositories/route.ts` — 仓库配置列表/添加
- `app/api/projects/[id]/repositories/[repoId]/route.ts` — 仓库 CRUD
- `app/api/groups/route.ts` — 分组管理（旧版）
- `app/api/groups/[...path]/route.ts` — 分组 CRUD（旧版）

### 核心库

- `lib/projects.ts` — 项目管理核心（CRUD、dev server 配置、仓库管理、自动检测）
- `lib/db/queries.ts` — SQL 查询（projects, project_dev_servers, project_repositories）

### 数据层

- `data/projects/queries.ts` — React Query hooks
- `data/projects/keys.ts` — Query key
- `data/repositories/queries.ts` — 仓库 React Query hooks
- `data/repositories/keys.ts` — 仓库 Query key
- `data/groups/index.ts` — 分组导出
- `data/groups/mutations.ts` — 分组 mutations

## 主流程

### 1. 创建项目（POST /api/projects）

```
POST /api/projects { name, workingDirectory, agentType?, defaultModel?, devServers? }
→ validateWorkingDirectory(workingDirectory) → 检查目录存在
→ createProject(opts):
    1. 生成 ID: proj_{ts}_{rand}
    2. 获取 sort_order（max + 1）
    3. resolveModelForAgent(agentType, defaultModel) → 解析模型
    4. INSERT INTO projects
    5. 如有 devServers → 逐个 INSERT INTO project_dev_servers
→ 返回 ProjectWithRepositories { ..., devServers, repositories }
```

### 2. 获取项目列表（GET /api/projects）

```
GET /api/projects
→ getAllProjectsWithDevServers():
    1. SELECT * FROM projects ORDER BY is_uncategorized ASC, sort_order ASC
    2. 对每个 project:
       - SELECT * FROM project_dev_servers WHERE project_id=?
       - SELECT * FROM project_repositories WHERE project_id=?
    3. 转换 is_primary/expanded 为 boolean
→ 返回 ProjectWithRepositories[]
```

### 3. 更新项目

```
updateProject(id, updates):
→ 检查非 uncategorized 项目
→ resolveModelForAgent → 更新模型
→ UPDATE projects SET name=?, working_directory=?, agent_type=?, default_model=?, initial_prompt=?
```

### 4. 删除项目

```
deleteProject(id):
→ 检查非 uncategorized
→ 所有 sessions → UPDATE project_id="uncategorized"
→ DELETE FROM dev_servers WHERE project_id=?
→ DELETE FROM project_dev_servers WHERE project_id=?
→ DELETE FROM projects WHERE id=?
```

### 5. 检测可用 dev server

```
detectDevServers(workingDir):
→ detectNpmScripts(dir):
    1. 读取 package.json
    2. 检查 scripts: dev/start/serve/develop/preview/start:dev
    3. 提取端口和端口环境变量
→ detectDockerServices(dir):
    1. 检查 docker-compose.yml / compose.yml / compose.yaml
    2. docker compose config --services
→ 合并返回 DetectedDevServer[]
```

### 6. 仓库管理

```
addProjectRepository(projectId, { name, path, isPrimary }):
→ 如果 isPrimary 或第一个仓库:
    - 清除其他仓库的 is_primary
→ INSERT INTO project_repositories
→ 返回 ProjectRepository

updateProjectRepository(id, updates):
→ 如果设为 primary → 清除其他 primary
→ UPDATE project_repositories

deleteProjectRepository(id):
→ DELETE FROM project_repositories
```

### 7. 会话关联项目

```
创建会话时（POST /api/sessions）:
→ projectId 参数（默认 "uncategorized"）
→ getProject(projectId) → 获取项目设置
→ 项目 default_model 优先于参数
→ 项目 initial_prompt 合并到会话 prompt
→ INSERT INTO sessions (project_id=?)

移动会话到项目:
→ moveSessionToProject(sessionId, projectId)
→ UPDATE sessions SET project_id=?
```

## 数据模型

### projects 表

| 字段              | 类型    | 说明                                            |
| ----------------- | ------- | ----------------------------------------------- |
| id                | TEXT PK | `proj_{ts}_{rand}`，固定 "uncategorized" 为默认 |
| name              | TEXT    | 项目名称                                        |
| working_directory | TEXT    | 工作目录                                        |
| agent_type        | TEXT    | 默认代理类型                                    |
| default_model     | TEXT    | 默认模型                                        |
| initial_prompt    | TEXT    | 初始提示词                                      |
| expanded          | INTEGER | UI 展开状态                                     |
| sort_order        | INTEGER | 排序                                            |
| is_uncategorized  | INTEGER | 是否为默认分类                                  |
| created_at        | TEXT    | 创建时间                                        |
| updated_at        | TEXT    | 更新时间                                        |

### project_dev_servers 表

| 字段         | 类型    | 说明              |
| ------------ | ------- | ----------------- |
| id           | TEXT PK | `pds_{ts}_{rand}` |
| project_id   | TEXT FK | 所属项目          |
| name         | TEXT    | 配置名称          |
| type         | TEXT    | node / docker     |
| command      | TEXT    | 启动命令          |
| port         | INTEGER | 端口              |
| port_env_var | TEXT    | 端口环境变量名    |
| sort_order   | INTEGER | 排序              |

### project_repositories 表

| 字段       | 类型    | 说明               |
| ---------- | ------- | ------------------ |
| id         | TEXT PK | `repo_{ts}_{rand}` |
| project_id | TEXT FK | 所属项目           |
| name       | TEXT    | 仓库名称           |
| path       | TEXT    | 仓库路径           |
| is_primary | INTEGER | 是否为主仓库       |
| sort_order | INTEGER | 排序               |

### groups 表（旧版，向后兼容）

| 字段       | 类型    | 说明        |
| ---------- | ------- | ----------- |
| path       | TEXT PK | 分组路径    |
| name       | TEXT    | 分组名称    |
| expanded   | INTEGER | UI 展开状态 |
| sort_order | INTEGER | 排序        |

## 排查路径

1. **项目列表为空** → 检查 DB 是否有 "uncategorized" 默认项目 → 检查 migration #9 是否应用
2. **会话不属于项目** → 检查 sessions.project_id → 默认应为 "uncategorized"
3. **模型解析错误** → 检查 `resolveModelForAgent()` 逻辑 → 检查 `lib/providers/registry.ts` 中的模型映射
4. **dev server 配置丢失** → 检查 project_dev_servers 表 → 检查外键级联删除
5. **多仓库状态不正确** → 检查 project_repositories 路径 → 检查 is_primary 标记
6. **分组不显示** → groups 表为旧版 → 新版使用 projects → 检查 migration #9 迁移
7. **目录检测不到** → 检查 package.json 存在 → 检查 docker-compose 文件名
