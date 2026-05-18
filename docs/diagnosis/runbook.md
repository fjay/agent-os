# AgentOS 告警与排查手册

> 最后更新：2026-05-18

---

## 一、告警关键词与严重等级

### 1.1 严重（P0）— 核心子系统不可用

| 告警关键词              | 场景              | 排查方向                                                                     |
| ----------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `"Failed to spawn pty"` | 终端子系统不可用  | 检查 `node-pty` 编译状态、系统 PTY 资源限制                                  |
| `"Claude spawn error"`  | Claude CLI 不可用 | 确认 Claude CLI 已安装且在 PATH 中；检查 `lib/claude/process-manager.ts:185` |

### 1.2 高（P1）— 核心功能故障

| 告警关键词                         | 场景                 | 排查方向                                                             |
| ---------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `"WebSocket error"`                | WebSocket 连接异常   | 检查网络稳定性、浏览器兼容性；查看 `server.ts:120` 上下文            |
| `"Failed to start worker session"` | 编排系统核心功能故障 | 检查 tmux 可用性、worktree 创建权限；查看 `lib/orchestration.ts:255` |
| `"Migration"` + `"failed"`         | 数据库迁移失败       | 检查 SQLite 文件权限、磁盘空间；查看 `lib/db/migrations.ts:236`      |

### 1.3 中（P2）— 请求异常

| 告警关键词                    | 场景                | 排查方向                                                                             |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `"Error occurred handling"`   | HTTP 请求未处理异常 | 查看 `server.ts:26` 上下文，检查请求 URL 和参数                                      |
| `"Failed to create worktree"` | Worktree 创建失败   | 检查 Git 仓库状态、磁盘空间；查看 `lib/orchestration.ts:129`、`lib/worktrees.ts:122` |
| `"Claude process error"`      | Claude 进程运行错误 | 查看 `lib/claude/process-manager.ts:209` 上下文                                      |

---

## 二、排查步骤

### 2.1 服务无法启动

1. 确认 Node.js >= 20：`node --version`
2. 确认端口 3011 未被占用：`lsof -i :3011`
3. 查看启动日志是否出现 `"Agent-OS ready on http://..."`
4. 若未出现，查看 `console.error` 输出定位具体错误
5. 检查 `npm install` 是否完成，`node-pty` 是否编译成功

### 2.2 终端无法连接

1. 搜索日志中 `"Failed to spawn pty"` 关键词
2. 确认 `node-pty` 模块已正确编译（`npm rebuild node-pty`）
3. 检查系统 PTY 资源限制：`cat /proc/sys/kernel/pty/max`（Linux）
4. 搜索 `"WebSocket error"` 确认 WebSocket 通道是否正常
5. 前端浏览器控制台搜索 `"Failed to capture tmux history"` 确认 tmux 交互

### 2.3 Claude 会话异常

1. 搜索日志中 `"Claude stderr"` 或 `"Claude spawn error"` 关键词
2. 确认 Claude CLI 可执行：`which claude`
3. 检查 Claude 进程是否启动：`"Spawning Claude for session"` 日志是否出现
4. 检查流解析是否正常：搜索 `"Failed to parse stream line"`
5. 检查进程退出原因：搜索 `"Claude process exited"` 查看退出码

### 2.4 编排 Worker 启动失败

1. 搜索 `"[orchestration]"` 前缀的所有日志
2. 确认 tmux 可用：`which tmux`
3. 确认 Git 仓库状态正常：在目标目录执行 `git status`
4. 搜索 `"Failed to create worktree"` 确认 worktree 创建是否成功
5. 搜索 `"Failed to start worker session"` 确认最终失败原因

### 2.5 数据库迁移失败

1. 搜索 `"Migration"` + `"failed"` 关键词
2. 检查 SQLite 文件权限：`ls -la agent-os.db`
3. 检查磁盘空间：`df -h`
4. 查看 `lib/db/migrations.ts:236` 附近的具体错误信息

### 2.6 Dev Server 启动失败

1. 搜索 `"Failed to start Docker service"` 关键词
2. 检查 Docker 是否运行：`docker ps`
3. 检查日志文件：`~/.agent-os/logs/{serverId}.log`

---

## 三、已知问题模式

### 3.1 静默错误吞噬

大量 `catch {}` 或 `catch { /* ignore */ }` 模式存在于以下模块，可能导致错误被忽略：

- tmux 操作（`lib/orchestration.ts`、`lib/worktrees.ts`）
- Docker 状态检查（`lib/dev-servers.ts`）
- Git 操作（`lib/git.ts`、`lib/git-status.ts`）
- WebSocket 清理（`components/Terminal/hooks/websocket-connection.ts`）

### 3.2 无错误分类

所有 API 500 错误使用统一消息 `"Failed to <操作>"`，无法区分可恢复错误与系统故障。

### 3.3 前端错误无集中上报

组件层错误仅写入浏览器控制台（`console.error`），无集中错误上报机制。

### 3.4 日志文件覆盖有限

仅 `send-keys` 模块写入文件日志（`/tmp/agent-os-send-keys.log`），其他模块全部依赖 console 输出。服务以 `nohup` 后台启动时，console 输出会写入 `~/.agent-os/agent-os.log`。

---

## 四、tmux 会话状态检测

`lib/status-detector.ts` 使用 tmux 会话活动时间戳和面板内容检测会话状态：

- 状态值：`"running" | "waiting" | "idle" | "dead"`
- 活跃指示器关键词：`"esc to interrupt"`、spinner 字符、whimsical words + `"tokens"`
- 等待模式正则（共 11 个）：`/[Y\/n]/i`、`/Allow\?/i`、`/waiting for input/i` 等
- 缓存有效期：2 秒（`CONFIG.CACHE_VALIDITY_MS`）
- 尖峰检测：1 秒内 2 次变化确认为持续活动

---

## 五、WebSocket 重连机制

配置参数（定义于 `components/Terminal/constants.ts`）：

| 参数                      | 值      | 含义         |
| ------------------------- | ------- | ------------ |
| `WS_RECONNECT_BASE_DELAY` | 1000ms  | 初始重连延迟 |
| `WS_RECONNECT_MAX_DELAY`  | 30000ms | 最大重连延迟 |

重连策略：

- 指数退避：每次重连延迟翻倍，上限 30 秒
- 连接状态：`"connecting" | "connected" | "disconnected" | "reconnecting"`
- 浏览器休眠检测：页面隐藏超过 5 秒或时钟跳变超过 30 秒时强制重连
- 事件监听：`visibilitychange`、`pageshow`、`focus`、`online` 均触发重连检查
- 代码路径：`components/Terminal/hooks/websocket-connection.ts`
