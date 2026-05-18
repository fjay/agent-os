# AgentOS 项目知识库

## 项目

AgentOS 是一个移动端优先的自托管 Web UI，用于管理 AI 编码会话（Claude Code、Codex、Gemini 等）。支持多面板终端、Git Worktree 隔离、MCP 编排和多仓库管理。

## 服务映射

- serviceName: agent-os
- repositoryId: saadnvd1/agent-os
- language: TypeScript ^5.9.3
- framework: Next.js 16 + React 19 + Tauri 2
- entryPath: ACTIONDOCK.md

## 知识范围

本知识库描述当前系统现状，包括代码结构、业务流程、数据模型、日志诊断、配置依赖和安全边界。

不记录完整历史变更、迁移流水账或已废弃方案。

## 主要任务

### 生产告警诊断

阅读：

- docs/agent/alert-diagnosis.md
- docs/diagnosis/logs.md
- docs/diagnosis/exceptions.md
- docs/diagnosis/runbook.md
- docs/code/architecture.md
- docs/data/index.md
- docs/ops/dependencies.md

### 代码定位

阅读：

- docs/agent/code-search.md
- docs/code/index.md
- docs/code/modules.md
- docs/code/symbols.md

### 业务流程理解

阅读：

- docs/domain/business.md
- docs/domain/flows/index.md

### 数据问题排查

阅读：

- docs/data/schema.md
- docs/data/relationships.md
- docs/data/transactions.md
- docs/data/consistency.md
- docs/data/tables/

### 配置和依赖排查

阅读：

- docs/ops/dependencies.md
- docs/ops/config/index.md

## 代码结构

```
agent-os/
  server.ts              -- 自定义 HTTP + WebSocket + PTY 服务器
  app/
    api/                 -- 55+ Next.js API 路由（10 个功能域）
    layout.tsx           -- 根布局（字体、主题、PWA）
    page.tsx             -- 主页面（客户端状态管理）
  components/            -- 18+ UI 组件目录（Terminal 为最复杂）
  lib/                   -- 40+ 核心业务逻辑模块
  data/                  -- 9 个 TanStack Query 数据层模块
  hooks/                 -- 17 个 React hooks
  stores/                -- Valtio 全局状态
  contexts/              -- PaneContext 多面板布局
  mcp/                   -- MCP 编排服务器（7 工具）
  src-tauri/             -- Tauri 桌面端壳（96 行 Rust）
  scripts/               -- CLI 和安装脚本
```

## 诊断规则

- 优先使用当前代码和当前文档。
- 不把历史设计当作当前行为。
- 生产告警诊断优先提取：exception、errorCode、traceId、path、className、lineNumber、config key、table name。
- 输出结论时必须包含证据和不确定性。
- 默认只读，不执行写操作。
- shell 命令必须遵守 docs/agent/shell-policy.md。
