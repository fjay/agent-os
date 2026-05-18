# 终端交互

## 概述

AgentOS 通过 WebSocket + xterm.js 提供 Web 终端能力。每个会话对应一个 tmux session，前端通过 WebSocket 与服务端 node-pty 通信，node-pty 通过 tmux 协议操作实际终端。支持多代理提供者（9 种）在终端中运行。

## 核心代码路径

### 服务端

- `server.ts` — WebSocket 服务器（`/ws/terminal`），node-pty 进程管理
- `app/api/sessions/[id]/send-keys/route.ts` — 通过 tmux buffer 发送文本
- `app/api/exec/route.ts` — 通用命令执行 API
- `lib/providers.ts` — 代理提供者注册表
- `lib/providers/registry.ts` — 提供者定义注册中心
- `lib/status-detector.ts` — 基于 tmux 内容的状态检测
- `lib/banner.ts` — 终端 Banner 显示
- `lib/terminal-themes.ts` — 终端主题配置

### 前端

- `contexts/PaneContext.tsx` — 分屏上下文
- `lib/panes.ts` — 分屏布局（水平/垂直分割，最多 4 个面板）
- `components/TmuxSessions.tsx` — tmux session 列表管理
- `components/PaneLayout.tsx` — 分屏布局渲染

## 主流程

### 1. WebSocket 终端连接（`/ws/terminal`）

```
客户端 ws.connect("/ws/terminal")
→ 服务端 pty.spawn(shell, [], { name: "xterm-256color", cols: 80, rows: 24 })
→ activePtys.add(ptyProcess)
→ pty.onData → ws.send({ type: "output", data })
→ pty.onExit → ws.send({ type: "exit", code }) → ws.close()
→ ws.on("message") 处理:
    - { type: "input", data } → pty.write(data)          // 用户输入
    - { type: "resize", cols, rows } → pty.resize()       // 调整大小
    - { type: "command", data } → pty.write(data + "\r")  // 执行命令
→ ws.on("close") → activePtys.delete(pty) → pty.kill()
```

### 2. 附加到 tmux session

```
前端创建 xterm Terminal 实例
→ 建立 WebSocket 连接
→ 在 pty 中执行: tmux attach -t "{tmux_name}"
→ 或创建新 tmux:
    tmux set -g mouse on
    tmux new-session -d -s "{agentType}-{uuid}" -c "{cwd}" "{agentCommand}"
→ 后续: 前端可附加已有 tmux session
```

### 3. 向会话发送文本（send-keys）

```
POST /api/sessions/[id]/send-keys { text, pressEnter }
→ 从 DB 获取 session → 构建 tmux session 名
→ tmux has-session 验证存在
→ 写入临时文件 /tmp/agent-os-send-{id}.txt
→ tmux load-buffer -b "send-{id}" {tempFile}
→ tmux paste-buffer -b "send-{id}" -t {tmuxSession}
→ tmux delete-buffer -b "send-{id}"
→ 如 pressEnter: tmux send-keys -t {tmuxSession} Enter
→ 清理临时文件
```

关键设计: 使用 tmux 命名缓冲区（named buffer）避免并发竞态条件。

### 4. 通用命令执行（`/api/exec`）

```
POST /api/exec { command }
→ execAsync(command, { timeout: 10000, shell: "/bin/zsh" })
→ 返回 { success, output, duration }
```

### 5. 分屏管理

```
前端 PaneState 结构:
  layout: PaneLayout (树形：leaf | split)
  focusedPaneId: 当前焦点面板
  panes: { [id]: { tabs: TabData[], activeTabId } }

操作:
  splitPane(state, paneId, direction) → 水平/垂直分割（最多 4 个）
  closePane(state, paneId) → 关闭面板（至少保留 1 个）
  savePaneState() → localStorage 持久化
  loadPaneState() → 恢复上次布局
```

### 6. 代理提供者系统

支持 9 种代理，每种定义 `command`（CLI 命令名）、`buildFlags()`（构建 CLI 参数）、`waitingPatterns`/`runningPatterns`/`idlePatterns`（状态正则）。

| 提供者      | command        | 支持 Resume | 支持 Fork |
| ----------- | -------------- | ----------- | --------- |
| Claude Code | `claude`       | 是          | 是        |
| Codex       | `codex`        | 否          | 否        |
| OpenCode    | `opencode`     | 否          | 否        |
| Gemini CLI  | `gemini`       | 否          | 否        |
| Aider       | `aider`        | 否          | 否        |
| Cursor CLI  | `cursor-agent` | 否          | 否        |
| Amp         | `amp`          | 否          | 否        |
| Pi          | `pi`           | 否          | 否        |
| Oh My Pi    | `omp`          | 否          | 否        |
| Shell       | （空）         | 否          | 否        |

## 状态转换

```
终端连接生命周期:

[Disconnected] → ws.connect → [Connecting] → pty.spawn → [Connected]
                                                    ↓
                                              pty.onData → 持续输出
                                              ws.message → input/resize/command
                                                    ↓
                                              ws.close / pty.onExit → [Closed]

服务端关闭流程（SIGTERM/SIGINT）:
  terminalWss.clients.forEach(client.close)
  activePtys.forEach(pty.kill)
  server.close → process.exit
```

## 排查路径

1. **终端空白/无输出** → 检查 WebSocket 连接状态 → 检查 tmux session 是否存在 → `tmux capture-pane -t {name} -p` 查看内容
2. **无法输入** → 检查 send-keys 路由 → 查看 `/tmp/agent-os-send-keys.log` → 检查 tmux buffer 操作
3. **终端大小错乱** → 检查 resize 消息是否发送 → 检查 pty.resize() 调用
4. **代理未启动** → 检查 agent command 是否安装（`which claude`）→ 检查 `lib/providers/registry.ts` 配置
5. **并发发送冲突** → 检查 tmux named buffer 名称唯一性（`send-{id}`）
6. **WebSocket 断开** → 检查 server.ts 中的 error/close handler → 检查 activePtys 清理
