# AgentOS 测试结构

> 最后更新：2026-05-18

---

## 一、当前状态：测试完全缺失

AgentOS 项目当前没有任何测试文件和测试框架配置。具体表现为：

### 1.1 测试文件

| 测试文件模式               | 存在情况                       |
| -------------------------- | ------------------------------ |
| `*.test.ts` / `*.test.tsx` | 无（仅存在于 `node_modules/`） |
| `*.spec.ts` / `*.spec.tsx` | 无                             |
| `__tests__/` 目录          | 无（仅存在于 `node_modules/`） |

### 1.2 测试框架配置

| 配置文件                              | 存在情况 |
| ------------------------------------- | -------- |
| `jest.config.*`                       | 无       |
| `vitest.config.*`                     | 无       |
| `package.json` 中的 test 命令         | 无       |
| 测试运行器依赖（jest、vitest、mocha） | 无       |

---

## 二、未覆盖的关键模块

以下模块为项目核心逻辑，当前完全缺乏自动化测试：

### 2.1 服务端

| 模块            | 代码路径                                                | 建议测试类型 |
| --------------- | ------------------------------------------------------- | ------------ |
| 会话 CRUD       | `app/api/sessions/`                                     | API 集成测试 |
| Git 操作        | `lib/git.ts`、`lib/git-status.ts`、`lib/git-history.ts` | 单元测试     |
| Worktree 管理   | `lib/worktrees.ts`                                      | 单元测试     |
| 编排系统        | `lib/orchestration.ts`                                  | 集成测试     |
| Claude 进程管理 | `lib/claude/process-manager.ts`                         | 单元测试     |
| 流解析器        | `lib/claude/stream-parser.ts`                           | 单元测试     |
| 数据库迁移      | `lib/db/migrations.ts`                                  | 集成测试     |
| 文件操作        | `lib/files.ts`                                          | 单元测试     |
| Dev Server 管理 | `lib/dev-servers.ts`                                    | 单元测试     |
| 代码搜索        | `lib/code-search.ts`                                    | 单元测试     |
| 状态检测        | `lib/status-detector.ts`                                | 单元测试     |

### 2.2 前端

| 模块               | 代码路径                                                  | 建议测试类型 |
| ------------------ | --------------------------------------------------------- | ------------ |
| React Query 数据层 | `data/*/queries.ts`、`data/*/mutations.ts`                | 单元测试     |
| WebSocket 连接管理 | `components/Terminal/hooks/websocket-connection.ts`       | 单元测试     |
| 会话列表操作       | `components/SessionList/hooks/useSessionListMutations.ts` | 单元测试     |
| Pane 布局          | `contexts/PaneContext.tsx`                                | 组件测试     |
| 文件编辑器         | `hooks/useFileEditor.ts`                                  | 单元测试     |

### 2.3 WebSocket 协议

| 通道                  | 代码路径                        | 建议测试类型 |
| --------------------- | ------------------------------- | ------------ |
| 终端 WebSocket        | `server.ts:33-124`              | 端到端测试   |
| Claude Chat WebSocket | `lib/claude/process-manager.ts` | 集成测试     |

---

## 三、建立测试体系的建议

1. **选择测试框架**：推荐 Vitest（与 TypeScript/ESM 兼容性好，配置简单）或 Jest
2. **优先级**：先覆盖纯函数模块（`lib/git-status.ts`、`lib/status-detector.ts`、`lib/claude/stream-parser.ts`），再覆盖 API 路由
3. **数据库测试**：使用内存 SQLite（`:memory:`）避免污染生产数据
4. **tmux/git 测试**：需要 mock `child_process` 调用或使用测试容器
5. **添加 `test` 脚本到 package.json**：`"test": "vitest run"` 或 `"test": "jest"`
6. **pre-commit 集成**：在 `.husky/pre-commit` 中添加测试运行
