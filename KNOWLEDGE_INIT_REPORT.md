# 知识库初始化报告

## 摘要

本次初始化为 AgentOS (`@saadnvd1/agent-os` v0.2.1) 生成项目知识库。AgentOS 是一个移动端优先的自托管 Web UI，用于管理 AI 编码会话。

## 已生成文件

### 导航入口

- ACTIONDOCK.md — 项目知识库导航入口

### 代码结构（docs/code/）

- docs/code/index.md — 代码文档索引
- docs/code/modules.md — 模块描述（40+ lib 模块、9 data 模块、18 组件目录）
- docs/code/architecture.md — 六层架构 + 组件关系 + 调用链
- docs/code/symbols.md — ~90 个关键符号索引

### 业务领域（docs/domain/）

- docs/domain/business.md — 8 大业务能力概述
- docs/domain/glossary.md — 领域术语表
- docs/domain/flows/index.md — 流程索引
- docs/domain/flows/session-lifecycle.md — 会话生命周期
- docs/domain/flows/terminal-interaction.md — 终端 WebSocket + tmux 交互
- docs/domain/flows/code-search.md — ripgrep 代码搜索
- docs/domain/flows/git-operations.md — Git 全流程
- docs/domain/flows/file-management.md — 文件管理
- docs/domain/flows/dev-servers.md — Node.js + Docker 开发服务器
- docs/domain/flows/mcp-orchestration.md — Conductor/Worker 编排
- docs/domain/flows/project-management.md — 项目管理

### 数据模型（docs/data/）

- docs/data/index.md — 数据文档索引
- docs/data/schema.md — 整体 schema（9 表 13 迁移）
- docs/data/relationships.md — 实体关系图
- docs/data/tables/sessions.md — 核心表（24 字段）
- docs/data/tables/messages.md — 消息表
- docs/data/tables/tool_calls.md — 工具调用表
- docs/data/tables/projects.md — 项目表
- docs/data/tables/dev_servers.md — 开发服务器表
- docs/data/tables/groups.md — 旧版分组表（已弃用）
- docs/data/tables/project_dev_servers.md — 服务器配置模板
- docs/data/tables/project_repositories.md — 多仓库关联
- docs/data/transactions.md — 事务分析（4 个风险点）
- docs/data/consistency.md — 一致性规则
- docs/data/cache.md — 四层缓存策略

### 诊断（docs/diagnosis/）

- docs/diagnosis/logs.md — 日志模式（130+ 处 console 调用）
- docs/diagnosis/exceptions.md — 错误类层次和 WebSocket 消息类型
- docs/diagnosis/runbook.md — 告警关键词和排查步骤

### API（docs/api/）

- docs/api/http.md — 74 个 HTTP 端点参考

### 运维（docs/ops/）

- docs/ops/dependencies.md — 50 生产 + 17 开发 + 5 Rust 依赖
- docs/ops/config/index.md — 配置文件索引 + 15 个环境变量

### 开发（docs/dev/）

- docs/dev/local-dev.md — 环境要求 + 搭建步骤
- docs/dev/test.md — 测试现状（完全缺失）

### 安全（docs/security/）

- docs/security/permissions.md — 权限模型（当前无认证）
- docs/security/sensitive-operations.md — 18 项风险清单

### Agent 指南（docs/agent/）

- docs/agent/alert-diagnosis.md — 告警诊断工作流
- docs/agent/code-search.md — 搜索优先级规则
- docs/agent/knowledge-update.md — 知识更新规则
- docs/agent/shell-policy.md — 安全 shell 命令策略

## 使用证据

| 数据源                      | 提供的信息                                     |
| --------------------------- | ---------------------------------------------- |
| package.json                | 依赖列表、版本、脚本、项目元信息               |
| server.ts                   | HTTP 服务器入口、WebSocket 终端协议、PTY 管理  |
| app/api/                    | 55+ API 路由的完整端点定义                     |
| lib/db/schema.ts            | 9 张表的 DDL 定义和初始数据                    |
| lib/db/queries.ts           | ~60 个预编译 SQL 语句和 PreparedStatement 缓存 |
| lib/db/migrations.ts        | 13 个数据库迁移记录                            |
| lib/providers/registry.ts   | 10 种 AI Agent Provider 定义                   |
| lib/orchestration.ts        | Conductor/Worker 编排逻辑                      |
| lib/status-detector.ts      | tmux 终端内容状态检测算法                      |
| components/Terminal/        | WebSocket 连接管理、重连机制、触摸滚动         |
| mcp/orchestration-server.ts | MCP 编排服务器和 7 个工具定义                  |
| src-tauri/                  | Tauri 桌面端配置和 Rust 入口                   |
| scripts/                    | CLI 命令定义和安装脚本                         |

## 检测到的项目事实

| 维度       | 值                                                                           |
| ---------- | ---------------------------------------------------------------------------- |
| 语言       | TypeScript ^5.9.3                                                            |
| 框架       | Next.js 16 + React 19                                                        |
| 桌面端     | Tauri v2（96 行 Rust 壳）                                                    |
| 数据库     | SQLite（better-sqlite3），9 张表，13 个迁移                                  |
| 终端       | xterm.js 6 + node-pty + tmux                                                 |
| 状态管理   | Valtio + React Query                                                         |
| UI 组件    | Tailwind CSS + Radix UI + shadcn                                             |
| 通信       | WebSocket（ws 库），2 个通道                                                 |
| MCP        | @modelcontextprotocol/sdk，7 个编排工具                                      |
| PWA        | Serwist Service Worker                                                       |
| 缓存       | PreparedStatement + React Query + tmux 时间戳 + Provider 注册表              |
| API 端点   | 74 个（10 个功能域）                                                         |
| 支持 Agent | 10 种（Claude、Codex、OpenCode、Gemini、Aider、Cursor、Amp、Pi、OMP、Shell） |
| 测试框架   | 无                                                                           |
| CI/CD      | 无                                                                           |
| 认证       | 无                                                                           |

## 不确定区域

| 区域                                           | 不确定原因                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Claude Chat WebSocket（/ws/claude/:sessionId） | 前端有客户端代码、后端有 ProcessManager，但 server.ts 未注册路由，功能状态不明 |
| 部分迁移行为                                   | 迁移中 `duplicate column` 错误被静默忽略，可能掩盖了并发迁移问题               |
| Docker 容器管理                                | dev_servers 的 Docker 集成仅在 lib/dev-servers.ts 中有代码，未测试实际行为     |

## 缺失证据

| 期望找到                            | 未找到                                       |
| ----------------------------------- | -------------------------------------------- |
| 测试文件（_.test.ts、_.spec.ts）    | 完全缺失                                     |
| ESLint 配置文件（eslint.config.\*） | package.json 声明了依赖但无配置文件          |
| CI/CD 配置（.github/、Jenkinsfile） | 不存在                                       |
| 生产 Docker 部署文件                | 不存在（Dockerfile.linux 仅用于 Tauri 构建） |
| 日志框架（Winston、Pino）           | 全部使用原生 console                         |
| 错误码体系                          | 无数字错误码，使用描述性字符串               |
| traceId/requestId                   | 无结构化日志或追踪 ID                        |
| 应用层认证                          | 无 Token、Cookie、Session 验证               |

## 需要人工审查

| 项目                 | 原因                                               |
| -------------------- | -------------------------------------------------- |
| 安全风险（5 项严重） | 无认证 + 任意命令执行 + 路径遍历，需要决策是否修复 |
| 无测试覆盖           | 整个项目没有任何测试，建议建立测试体系             |
| 无事务包装           | 4 个多步操作场景存在数据不一致风险                 |
| 30+ 处命令注入       | exec + 字符串拼接，需要替换为参数数组形式          |
| ESLint 配置缺失      | 声明了依赖但无 flat config 文件（ESLint 9.x 要求） |
| npm/Tauri 版本不同步 | npm 0.2.1 vs Tauri 0.1.0                           |

## 未生成

以下内容没有生成，因为缺少代码证据：

| 文件                          | 原因                     |
| ----------------------------- | ------------------------ |
| docs/api/events.md            | 无消息队列或事件系统代码 |
| docs/diagnosis/alerts/        | 无告警系统               |
| docs/ops/config/middleware.md | 无中间件层               |
