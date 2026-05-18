# dev server 管理

## 概述

AgentOS 提供 dev server 的生命周期管理。支持 Node.js 进程和 Docker Compose 服务两种类型。可以启动、停止、重启服务器，查看日志，自动检测可用服务。dev server 关联到项目（project），每个项目可配置多个 dev server 模板（project_dev_servers）。

## 核心代码路径

### API 路由

- `app/api/dev-servers/route.ts` — 列表和启动
- `app/api/dev-servers/[id]/route.ts` — 单服务器操作
- `app/api/dev-servers/[id]/stop/route.ts` — 停止
- `app/api/dev-servers/[id]/restart/route.ts` — 重启
- `app/api/dev-servers/[id]/logs/route.ts` — 日志查看
- `app/api/dev-servers/detect/route.ts` — 自动检测
- `app/api/projects/[id]/dev-servers/route.ts` — 项目级列表/创建
- `app/api/projects/[id]/dev-servers/[dsId]/route.ts` — 项目级 CRUD

### 核心库

- `lib/dev-servers.ts` — 服务器生命周期管理（启动、停止、重启、状态检测、日志）

### 数据层

- `data/dev-servers/queries.ts` — React Query hooks
- `data/dev-servers/keys.ts` — Query key 定义

## 主流程

### 1. 启动 Node.js 服务器

```
POST /api/dev-servers { projectId, type: "node", name, command, workingDirectory, ports }
→ 生成 ID: ds_{timestamp}_{random}
→ INSERT INTO dev_servers (status="starting")
→ spawnNodeServer(id, command, workingDirectory, ports):
    1. 打开日志文件: ~/.agent-os/logs/{id}.log
    2. 展开 ~ → 绝对路径
    3. 构建最小化 env（PATH, HOME, USER, SHELL, PORT）
    4. spawn(`cd "{cwd}" && {command}`, { shell: true, detached: true, stdio: [ignore, logFd, logFd] })
    5. child.unref() → 父进程不等待
    6. 关闭 fd → 等待 500ms
→ UPDATE dev_servers SET status="running", pid={child.pid}
→ 返回 { server: DevServer }
```

### 2. 启动 Docker Compose 服务

```
POST /api/dev-servers { type: "docker", command: "service-name", workingDirectory }
→ INSERT INTO dev_servers (status="starting")
→ spawnDockerService(command, workingDirectory):
    1. docker compose up -d {command}
    2. docker compose ps -q {command} → containerId
→ UPDATE dev_servers SET status="running", container_id={containerId}
```

### 3. 停止服务器

```
POST /api/dev-servers/[id]/stop
→ getServer(id) → 检查类型
→ Node.js:
    1. process.kill(pid, "SIGTERM")
    2. 等待 1s → 检查 → process.kill(pid, "SIGKILL")
    3. 遍历 ports → getPidOnPort → kill
→ Docker:
    1. docker stop {container_id}
→ UPDATE dev_servers SET status="stopped"
```

### 4. 重启服务器

```
POST /api/dev-servers/[id]/restart
→ stopServer(id)
→ 根据类型重新启动（保留相同配置）
→ UPDATE dev_servers SET status="running", pid/container_id
```

### 5. 获取日志

```
GET /api/dev-servers/[id]/logs?lines=100
→ Node.js: 读取 ~/.agent-os/logs/{id}.log → 截取最后 N 行
→ Docker: docker logs --tail N {container_id}
→ 返回 string[]
```

### 6. 状态检测

```
getServerStatus(server):
→ Node.js:
    1. isPidRunning(pid) → process.kill(pid, 0)
    2. 遍历 ports → isPortInUse(port) → lsof
    3. 更新 DB 中的 pid
→ Docker:
    1. docker inspect -f '{{.State.Status}}' {container_id}
→ 返回: stopped | starting | running | failed
```

### 7. 自动检测可用服务

```
GET /api/dev-servers/detect?path={dir}
→ detectNodeServer(dir):
    1. 读取 package.json
    2. 检查 scripts: dev/start/serve/develop
    3. 提取端口（正则匹配 port/PORT=N）
→ detectDockerServices(dir):
    1. 检查 docker-compose.yml / compose.yml
    2. docker compose config --services
→ 返回 DetectedServer[]
```

### 8. 启动时清理孤儿进程

```
cleanupOrphanedServers():
→ getAllDevServers
→ 对每个 server 检查 liveStatus
→ 如果 DB 记录 running 但实际 stopped → 更新为 stopped
```

## 状态转换

```
             ┌───────────┐
             │  stopped   │◄──────────────────────────┐
             └─────┬──────┘                            │
                   │ start                             │
                   ▼                                   │
             ┌───────────┐    spawn 成功               │
             │  starting  │──────────────┐              │
             └───────────┘              │              │
                   │                    ▼              │
                   │ spawn 失败   ┌───────────┐        │
                   └────────────▶│   failed   │        │
                                 └───────────┘        │
                                          │            │
                                    ┌─────┴──────┐     │
                                    │  running    │─────┤
                                    └─────┬──────┘     │
                                          │ stop/restart│
                                          │             │
                                    ┌─────┴──────┐     │
                                    │  starting   │─────┘
                                    │ (restart)    │
                                    └──────────────┘
```

## 数据模型

### dev_servers 表

| 字段              | 类型    | 说明                            |
| ----------------- | ------- | ------------------------------- |
| id                | TEXT PK | `ds_{ts}_{rand}`                |
| project_id        | TEXT FK | 所属项目                        |
| type              | TEXT    | "node" \| "docker"              |
| name              | TEXT    | 服务器名称                      |
| command           | TEXT    | 启动命令                        |
| status            | TEXT    | stopped/starting/running/failed |
| pid               | INTEGER | 进程 ID（Node.js）              |
| container_id      | TEXT    | 容器 ID（Docker）               |
| ports             | TEXT    | JSON 数组 `[3000, 3001]`        |
| working_directory | TEXT    | 工作目录                        |
| created_at        | TEXT    | 创建时间                        |
| updated_at        | TEXT    | 更新时间                        |

### project_dev_servers 表（配置模板）

| 字段         | 类型    | 说明               |
| ------------ | ------- | ------------------ |
| id           | TEXT PK | `pds_{ts}_{rand}`  |
| project_id   | TEXT FK | 所属项目           |
| name         | TEXT    | 配置名称           |
| type         | TEXT    | "node" \| "docker" |
| command      | TEXT    | 启动命令           |
| port         | INTEGER | 端口号             |
| port_env_var | TEXT    | 端口环境变量名     |
| sort_order   | INTEGER | 排序               |

## 排查路径

1. **服务器启动失败** → 检查日志文件 `~/.agent-os/logs/{id}.log` → 检查命令路径 → 检查端口冲突
2. **状态不同步** → `cleanupOrphanedServers()` 在启动时执行 → 手动检查 `lsof -i :{port}`
3. **Docker 服务不可用** → 检查 `docker compose` 命令 → 检查 compose 文件格式
4. **进程泄漏** → 检查 detached 进程 → `ps aux | grep {command}` → 检查端口占用
5. **日志过大** → 检查 `~/.agent-os/logs/` → 清理旧日志文件
6. **检测不到服务** → 检查 package.json scripts → 检查 docker-compose.yml 位置
