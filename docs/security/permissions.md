# AgentOS 权限模型与认证机制

> 更新日期: 2026-05-18
> 基于代码路径 `/root/code/agent-os` 全量分析

---

## 一、当前状态：无认证

AgentOS **没有实现任何认证或授权机制**。所有 API 端点和 WebSocket 连接均对外完全开放，无需身份验证。

### 1.1 无用户认证

- 没有登录页面、Token、Cookie、Session 等身份验证机制
- 没有 API Key 校验
- 没有 RBAC（基于角色）或 ABAC（基于属性）的权限分级
- 所有调用者拥有相同权限

### 1.2 网络暴露

服务器绑定 `0.0.0.0`，监听所有网络接口：

- 代码路径: `server.ts:8`
- 默认端口: `3011`（代码路径: `src-tauri/tauri.conf.json`）

如果该端口暴露到公网，攻击者可以直接调用所有端点。

### 1.3 实际安全边界

当前唯一的安全边界是**网络层隔离**——假设 AgentOS 运行在本地或受信任的局域网中。项目设计假设：

1. Agent 本身是可信的（由用户显式启动）
2. 服务器运行在可信环境中（本地或私有网络）
3. 用户通过浏览器直接操作

---

## 二、HTTP API 认证

**不存在**。所有 Next.js API Routes（约 55 个端点）均不执行任何认证检查。

关键的无认证端点示例：

| 端点                          | 功能           | 代码路径                             |
| ----------------------------- | -------------- | ------------------------------------ |
| `POST /api/exec`              | 任意命令执行   | `app/api/exec/route.ts`              |
| `GET /api/files?path=...`     | 文件系统浏览   | `app/api/files/route.ts`             |
| `POST /api/files/content`     | 文件读写       | `app/api/files/content/route.ts`     |
| `POST /api/git/commit`        | Git 提交       | `app/api/git/commit/route.ts`        |
| `POST /api/git/push`          | Git 推送       | `app/api/git/push/route.ts`          |
| `POST /api/sessions`          | 会话管理       | `app/api/sessions/route.ts`          |
| `POST /api/dev-servers`       | 开发服务器管理 | `app/api/dev-servers/route.ts`       |
| `POST /api/orchestrate/spawn` | Worker 编排    | `app/api/orchestrate/spawn/route.ts` |

没有中间件层拦截请求，错误处理在各路由内部通过 try-catch 完成（代码路径: 全部 `app/api/*/route.ts`）。

---

## 三、WebSocket 认证

**不存在**。终端 WebSocket (`/ws/terminal`) 在连接时直接创建新的 PTY 进程，不进行任何身份校验。

连接建立代码（代码路径: `server.ts:36-44`）：

```typescript
server.on("upgrade", (request, socket, head) => {
  const { pathname } = parse(request.url || "");
  if (pathname === "/ws/terminal") {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit("connection", ws, request);
    });
  }
});
```

任何能访问该端口的客户端都能获得一个完整交互式 shell。

---

## 四、MCP 工具认证

**不存在**。MCP orchestration server 通过 HTTP 回调 AgentOS API，使用 `localhost:3011` 的 URL，没有附带任何认证 Token。

代码路径: `mcp/orchestration-server.ts:37-47`

---

## 五、已存在的防护机制

虽然缺少认证，但项目中存在以下安全相关机制：

| 防护机制           | 描述                                           | 代码路径                                |
| ------------------ | ---------------------------------------------- | --------------------------------------- |
| 文件大小限制       | 读写文件限制为 1MB                             | `lib/files.ts:140,186`                  |
| 命令执行超时       | exec 超时 10 秒                                | `app/api/exec/route.ts:8`               |
| 二进制文件检测     | 检测 null 字节，拒绝显示二进制文件             | `lib/files.ts:156`                      |
| 目录排除列表       | 排除 `.env`、`.git`、`node_modules` 等敏感目录 | `lib/files.ts:16-40`                    |
| 参数化 SQL         | 所有数据库操作使用 prepared statements         | `lib/db/queries.ts`                     |
| PTY 环境变量最小化 | PTY 使用最小环境变量集                         | `server.ts:54-62`                       |
| tmux 会话名清理    | sanitize 函数限制字符集                        | `app/api/sessions/[id]/route.ts:14-21`  |
| 文件名清理         | 上传文件名去除非字母数字字符                   | `app/api/files/upload-temp/route.ts:22` |
| Agent 类型白名单   | `isValidAgentType` 校验 agent 类型             | `lib/providers/registry.ts`             |
| Worktree 路径限制  | worktree 创建在 `~/.agent-os/worktrees/` 下    | `lib/worktrees.ts:21`                   |
| ripgrep 安全调用   | 使用 spawnSync + 参数数组                      | `lib/code-search.ts:66`                 |

---

## 六、缺失的防护机制

| 防护机制         | 重要性 | 说明                        |
| ---------------- | ------ | --------------------------- |
| API 认证         | 严重   | 所有端点无认证              |
| 路径遍历防护     | 严重   | 文件操作未限制在安全目录内  |
| 命令参数转义     | 严重   | Git/tmux 命令参数转义不完整 |
| CORS 配置        | 高     | 无 CORS 策略                |
| 请求频率限制     | 中     | 无 rate limiting            |
| 文件上传大小限制 | 中     | 上传端点无大小限制          |
| 输入验证框架     | 中     | 无统一的输入验证层          |
| 审计日志         | 低     | 无安全事件记录              |
| CSP 头           | 低     | 无 Content-Security-Policy  |

---

## 七、建议的分层安全策略

### 第一层: 网络访问控制（必须）

在 `server.ts` 中添加认证中间件：

1. 生成随机 Token，首次启动时输出到控制台
2. 所有 API 请求需携带 `Authorization: Bearer <token>`
3. WebSocket 连接需通过 query 参数传递 token
4. 将默认绑定地址从 `0.0.0.0` 改为 `127.0.0.1`

### 第二层: 命令注入防护（必须）

替换所有使用字符串拼接的 `exec/execSync` 调用为参数数组形式的 `spawn/spawnSync`。

### 第三层: 路径限制（推荐）

为文件操作 API 添加路径白名单，阻止访问 `/etc`、`/root/.ssh`、`/proc`、`/sys` 等系统目录。

### 第四层: CORS 和安全头（推荐）

在 `next.config.ts` 或中间件中添加 CORS 策略和安全响应头。
