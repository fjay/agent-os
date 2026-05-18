# AgentOS 业务能力概述

## 系统定位

AgentOS 是一个 Web 端的 AI 编码会话管理平台。它将多种 AI 编码代理（Claude Code、Codex、OpenCode、Gemini CLI、Aider、Cursor CLI、Amp、Pi、Oh My Pi）统一到同一 Web UI 中，提供会话生命周期管理、终端交互、代码搜索、Git 操作、文件管理、开发服务器管理、MCP 编排等能力。

## 技术栈

- **前端**: Next.js (App Router) + React + TypeScript + Tailwind CSS + xterm.js
- **后端**: Next.js API Routes + Node.js (`server.ts`)
- **数据库**: SQLite (better-sqlite3, WAL 模式)
- **终端**: node-pty + tmux + WebSocket
- **搜索**: ripgrep (rg)
- **Git**: git CLI + gh CLI
- **MCP**: @modelcontextprotocol/sdk (stdio transport)

## 核心业务能力

### 1. 会话生命周期管理

创建、恢复、分叉、摘要恢复、终止 AI 编码会话。每个会话关联一个 tmux 终端。支持 9 种 AI 代理提供者、Git worktree 隔离开发、实时状态检测（running/waiting/idle/dead）、分叉会话继承上下文、摘要恢复（压缩上下文窗口）、多面板分屏布局。

核心文件: `app/api/sessions/`, `lib/status-detector.ts`, `lib/providers.ts`, `lib/worktrees.ts`

### 2. 终端交互

通过 WebSocket + xterm.js 提供 Web 终端，直接操作 tmux session 中的 AI 代理。node-pty 进程管理、tmux 命名缓冲区发送文本（避免竞态）、分屏布局（最多 4 个面板）、代理提供者自动识别和参数构建。

核心文件: `server.ts`, `lib/panes.ts`, `contexts/PaneContext.tsx`

### 3. 代码搜索

基于 ripgrep 的全文代码搜索，支持大小写、上下文行数、结果数量等参数控制。

核心文件: `lib/code-search.ts`, `app/api/code-search/`

### 4. Git 操作

完整的 Git 工作流：状态查看、diff、暂存、提交、推送、历史、PR 创建。支持多仓库聚合状态和 worktree 隔离开发。PR 自动生成使用 Claude CLI + 启发式回退。

核心文件: `lib/git-status.ts`, `lib/git.ts`, `lib/git-history.ts`, `lib/multi-repo-git.ts`, `lib/pr.ts`, `lib/pr-generation.ts`

### 5. 文件管理

Web 端文件浏览器和编辑器。目录浏览、文件读写、文件上传，支持排除模式和二进制文件检测。

核心文件: `lib/files.ts`, `lib/file-upload.ts`, `app/api/files/`

### 6. 开发服务器管理

Node.js 进程和 Docker Compose 服务的生命周期管理。自动检测 package.json scripts 和 docker-compose.yml、实时状态检测（PID/端口/容器状态）、日志查看、孤儿进程清理。

核心文件: `lib/dev-servers.ts`, `app/api/dev-servers/`

### 7. MCP 编排

Conductor/Worker 模式的多代理编排。通过 MCP Server 暴露工具给 Claude Code，实现自动化任务分配。Worker 自动获得独立 Git worktree，支持 spawn/list/output/send/complete/kill 操作。

核心文件: `lib/orchestration.ts`, `mcp/orchestration-server.ts`, `lib/mcp-config.ts`

### 8. 项目和仓库管理

项目作为顶层组织容器，管理会话、开发服务器配置、代码仓库。支持多仓库配置和联合 Git 状态、开发服务器配置模板、自动检测可用服务。

核心文件: `lib/projects.ts`, `app/api/projects/`

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                      Web Browser (前端)                       │
│  Next.js App Router + React + xterm.js + Tailwind CSS       │
│  hooks/           contexts/        components/               │
│  data/ (React Query)  stores/ (Zustand)                      │
└──────────┬──────────────────────────────────────┬────────────┘
           │ HTTP (REST API)                       │ WebSocket
           ▼                                       ▼
┌──────────────────────────────┐    ┌─────────────────────────┐
│   Next.js API Routes         │    │   server.ts             │
│   app/api/                   │    │   WebSocket Server      │
│   sessions/ git/ files/      │    │   /ws/terminal          │
│   code-search/ dev-servers/  │    │   node-pty → tmux       │
│   orchestrate/ projects/     │    └─────────────────────────┘
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐    ┌─────────────────────────┐
│   lib/ (业务逻辑)            │    │   SQLite (WAL)          │
│   orchestration.ts           │    │   agent-os.db           │
│   dev-servers.ts             │    │   sessions, messages,   │
│   git-status.ts, git.ts      │    │   projects, dev_servers,│
│   code-search.ts, files.ts   │    │   groups, tool_calls    │
│   projects.ts, worktrees.ts  │    └─────────────────────────┘
│   status-detector.ts         │
│   providers.ts, panes.ts     │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│                    外部工具/CLI                               │
│  tmux, git, gh, claude, codex, opencode, gemini, aider,     │
│  cursor-agent, amp, pi, omp, rg (ripgrep), docker           │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│              MCP 编排层                                       │
│  mcp/orchestration-server.ts (stdio)                         │
│  ← Claude Code 通过 .mcp.json 自动发现                       │
│  → 调用 /api/orchestrate/* 生成和管理 Workers                │
└──────────────────────────────────────────────────────────────┘
```

## 数据模型关系

```
projects (1) ──< (N) sessions
projects (1) ──< (N) project_dev_servers (配置模板)
projects (1) ──< (N) project_repositories
projects (1) ──< (N) dev_servers (运行实例)
sessions (1) ──< (N) messages
messages (1) ──< (N) tool_calls
sessions (parent) ──< sessions (fork: parent_session_id)
sessions (conductor) ──< sessions (worker: conductor_session_id)
groups ──< sessions (group_path, 旧版)
```

## 关键设计决策

1. **tmux 作为终端后端**: 所有会话通过 tmux session 管理，支持 detach/reattach，崩溃恢复
2. **SQLite WAL 模式**: 支持多 worker 并发写入
3. **后台异步操作**: worktree 环境初始化、清理等耗时操作通过 `runInBackground()` 非阻塞执行（`lib/async-operations.ts`）
4. **命名缓冲区**: send-keys 使用 tmux named buffer 避免并发冲突
5. **状态检测基于内容分析**: 通过 tmux capture-pane 内容匹配判断代理状态（`lib/status-detector.ts`）
6. **MCP 工具注入**: 通过 .mcp.json 自动注入编排能力，Claude 无需额外配置（`lib/mcp-config.ts`）
7. **Provider 抽象**: 统一接口支持 9 种 AI 代理，新增代理只需实现 AgentProvider 接口（`lib/providers.ts`）
