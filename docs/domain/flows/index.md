# 业务流程索引

本目录包含 AgentOS 各核心业务流程的详细文档。每个文件描述一个独立业务领域的主流程、状态转换、核心代码路径和排查路径。

## 流程列表

| 流程           | 文件                                                 | 说明                                           |
| -------------- | ---------------------------------------------------- | ---------------------------------------------- |
| 会话生命周期   | [session-lifecycle.md](./session-lifecycle.md)       | 会话的创建、恢复、分叉、摘要恢复、删除全流程   |
| 终端交互       | [terminal-interaction.md](./terminal-interaction.md) | WebSocket 终端、tmux 附加、send-keys、分屏管理 |
| 代码搜索       | [code-search.md](./code-search.md)                   | 基于 ripgrep 的全文代码搜索                    |
| Git 操作       | [git-operations.md](./git-operations.md)             | 状态查看、暂存、提交、推送、PR、worktree 管理  |
| 文件管理       | [file-management.md](./file-management.md)           | 目录浏览、文件读写、文件上传                   |
| 开发服务器管理 | [dev-servers.md](./dev-servers.md)                   | Node.js 和 Docker Compose 服务的生命周期管理   |
| MCP 编排       | [mcp-orchestration.md](./mcp-orchestration.md)       | Conductor/Worker 多代理编排                    |
| 项目管理       | [project-management.md](./project-management.md)     | 项目容器、多仓库配置、开发服务器配置模板       |

## 相关文档

- [业务能力概述](../business.md) — AgentOS 系统定位、技术栈、架构概览
- [领域术语表](../glossary.md) — 统一的领域术语定义
