# 领域术语表

## 核心实体

| 术语            | 英文      | 定义                                                       | 数据表       | 代码位置                   |
| --------------- | --------- | ---------------------------------------------------------- | ------------ | -------------------------- |
| 会话（session） | Session   | AgentOS 的核心实体，对应一个 tmux 终端中运行的 AI 编码代理 | `sessions`   | `lib/db/types.ts` Session  |
| 消息            | Message   | 会话中的对话消息（用户/助手）                              | `messages`   | `lib/db/types.ts` Message  |
| 工具调用        | Tool Call | AI 代理执行的工具调用记录                                  | `tool_calls` | `lib/db/types.ts` ToolCall |
| 项目            | Project   | 组织会话的顶层容器，包含工作目录和默认设置                 | `projects`   | `lib/db/types.ts` Project  |
| 分组            | Group     | 旧版会话组织方式，已被项目替代                             | `groups`     | `lib/db/types.ts` Group    |

## 代理系统

| 术语         | 英文              | 定义                                                                        | 代码位置                         |
| ------------ | ----------------- | --------------------------------------------------------------------------- | -------------------------------- |
| 代理提供者   | Agent Provider    | AI 编码 CLI 的抽象（命令、参数、状态模式）                                  | `lib/providers.ts` AgentProvider |
| 代理类型     | Agent Type        | 提供者标识符，如 claude/codex/opencode/gemini/aider/cursor/amp/pi/omp/shell | `lib/providers.ts` AgentType     |
| 提供者注册表 | Provider Registry | 所有提供者定义的集中注册中心                                                | `lib/providers/registry.ts`      |
| 自动批准     | Auto Approve      | 跳过代理权限确认（--dangerously-skip-permissions）                          | sessions.auto_approve            |
| 模型         | Model             | 代理使用的 AI 模型（如 sonnet/opus/haiku）                                  | `lib/model-catalog.ts`           |

## 终端和会话管理

| 术语           | 英文              | 定义                                          | 代码位置                           |
| -------------- | ----------------- | --------------------------------------------- | ---------------------------------- |
| tmux 会话名    | tmux name         | 格式 `{agentType}-{uuid}`，标识 tmux 中的会话 | sessions.tmux_name                 |
| Claude 会话 ID | Claude Session ID | Claude CLI 的内部会话标识，用于 resume/fork   | sessions.claude_session_id         |
| 附加           | Attach            | 连接到已有的 tmux session                     | 前端 WebSocket 操作                |
| 分叉           | Fork              | 基于父会话创建新会话，继承上下文              | `app/api/sessions/[id]/fork/`      |
| 摘要恢复       | Summarize         | 压缩当前会话上下文，创建新会话继续            | `app/api/sessions/[id]/summarize/` |
| 发送按键       | Send Keys         | 通过 tmux buffer 向终端发送文本               | `app/api/sessions/[id]/send-keys/` |
| 面板           | Pane              | 终端分屏面板                                  | `lib/panes.ts` PaneData            |
| 标签页         | Tab               | 面板中的标签页                                | `lib/panes.ts` TabData             |

## 状态系统

| 术语     | 英文            | 定义                                  | 代码位置                                 |
| -------- | --------------- | ------------------------------------- | ---------------------------------------- |
| 运行中   | running         | 代理正在执行任务（绿色）              | `lib/status-detector.ts`                 |
| 等待中   | waiting         | 代理需要用户确认（黄色）              | `lib/status-detector.ts`                 |
| 空闲     | idle            | 代理空闲，已确认                      | `lib/status-detector.ts`                 |
| 死亡     | dead            | tmux session 不存在                   | `lib/status-detector.ts`                 |
| 尖峰检测 | Spike Detection | 2 秒内 2 次 activity 变更确认持续活动 | `lib/status-detector.ts`                 |
| 冷却期   | Cooldown        | 活动停止后 2 秒宽限期                 | `lib/status-detector.ts`                 |
| 确认     | Acknowledge     | 用户已查看待定状态                    | `statusDetector.acknowledge()`           |
| 忙碌指标 | Busy Indicators | 终端中表明代理工作中的文本模式        | `lib/status-detector.ts` BUSY_INDICATORS |

## Git 和代码管理

| 术语       | 英文               | 定义                                        | 代码位置                             |
| ---------- | ------------------ | ------------------------------------------- | ------------------------------------ |
| 工作树     | Worktree           | Git worktree，隔离的代码副本                | `lib/worktrees.ts`                   |
| 工作树路径 | Worktree Path      | `~/.agent-os/worktrees/{project}-{feature}` | sessions.worktree_path               |
| 多仓库     | Multi-repo         | 一个项目关联多个 Git 仓库                   | `lib/multi-repo-git.ts`              |
| 主仓库     | Primary Repository | 项目中的主要 Git 仓库                       | project_repositories.is_primary      |
| PR         | Pull Request       | GitHub Pull Request                         | sessions.pr_url/pr_number/pr_status  |
| 暂存       | Staged             | git add 后的文件状态                        | `lib/git-status.ts` GitFile.staged   |
| 取消暂存   | Unstaged           | git reset 后的文件状态                      | `lib/git-status.ts`                  |
| 未跟踪     | Untracked          | git 未跟踪的新文件                          | `lib/git-status.ts`                  |
| 丢弃更改   | Discard            | 撤销文件修改                                | `lib/git-status.ts` discardChanges() |

## 开发服务器

| 术语                 | 英文               | 定义                                                 | 代码位置                           |
| -------------------- | ------------------ | ---------------------------------------------------- | ---------------------------------- |
| dev server           | Dev Server         | 运行中的开发服务器实例                               | `lib/dev-servers.ts` DevServer     |
| 服务器类型           | Server Type        | node（进程）或 docker（容器）                        | DevServerType                      |
| 服务器状态           | Server Status      | stopped/starting/running/failed                      | DevServerStatus                    |
| 项目 dev server 配置 | Project Dev Server | 项目级开发服务器配置模板                             | `lib/db/types.ts` ProjectDevServer |
| 孤儿进程             | Orphaned Server    | DB 记录为 running 但实际已停止的服务器               | `cleanupOrphanedServers()`         |
| 服务检测             | Service Detection  | 自动发现 package.json scripts 和 docker-compose 服务 | `detectServers()`                  |

## MCP 编排

| 术语       | 英文                   | 定义                                          | 代码位置                             |
| ---------- | ---------------------- | --------------------------------------------- | ------------------------------------ |
| MCP        | Model Context Protocol | AI 模型调用外部工具的标准协议                 | `mcp/orchestration-server.ts`        |
| 编排       | Orchestration          | Conductor/Worker 多代理协同模式               | `lib/orchestration.ts`               |
| 指挥者     | Conductor              | 管理多个 worker 的主会话                      | sessions.conductor_session_id        |
| 工作者     | Worker                 | 被 conductor 创建和管理的子会话               | sessions.worker_task/status          |
| MCP 配置   | MCP Config             | .mcp.json 文件，Claude Code 自动发现 MCP 工具 | `lib/mcp-config.ts`                  |
| 生成工作者 | Spawn Worker           | 创建新的 worker 会话和 worktree               | `lib/orchestration.ts` spawnWorker() |
| 终止工作者 | Kill Worker            | 终止 worker 的 tmux session 和可选 worktree   | `lib/orchestration.ts` killWorker()  |

## 数据层

| 术语           | 英文                 | 定义                              | 代码位置                                    |
| -------------- | -------------------- | --------------------------------- | ------------------------------------------- |
| 数据层         | Data Layer           | React Query hooks 封装            | `data/*/queries.ts`                         |
| 查询键         | Query Key            | React Query 缓存键                | `data/*/keys.ts`                            |
| 后台操作       | Background Operation | 非阻塞的异步任务                  | `lib/async-operations.ts` runInBackground() |
| 迁移           | Migration            | 数据库 schema 版本控制            | `lib/db/migrations.ts`                      |
| 预编译语句缓存 | Statement Cache      | better-sqlite3 预编译 SQL 缓存    | `lib/db/queries.ts` stmtCache               |
| WAL 模式       | WAL Mode             | Write-Ahead Logging，支持并发读写 | `lib/db/index.ts`                           |

## 基础设施

| 术语       | 英文                  | 定义                                | 代码位置                            |
| ---------- | --------------------- | ----------------------------------- | ----------------------------------- |
| 服务入口   | Server Entry          | server.ts，HTTP + WebSocket 服务器  | `server.ts`                         |
| PTY        | Pseudo-Terminal       | node-pty 创建的伪终端进程           | `server.ts` activePtys              |
| 端口分配   | Port Allocation       | 为 worktree dev server 分配唯一端口 | `lib/ports.ts`                      |
| 环境初始化 | Environment Setup     | worktree 创建后的依赖安装和配置复制 | `lib/env-setup.ts`                  |
| Banner     | Banner                | 终端中显示的 AgentOS 标识           | `lib/banner.ts`                     |
| 终端主题   | Terminal Theme        | xterm.js 颜色配置                   | `lib/terminal-themes.ts`            |
| 未分类项目 | Uncategorized Project | 默认项目，不可删除                  | projects.is_uncategorized=1         |
| 工作目录   | Working Directory     | 会话/项目的文件系统路径             | sessions/projects.working_directory |
| 滚回捕获   | Scrollback Capture    | tmux capture-pane 获取终端历史      | `tmux capture-pane -S -N`           |
