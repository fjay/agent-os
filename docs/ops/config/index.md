# AgentOS 配置文件索引与环境变量

> 最后更新：2026-05-18

---

## 一、配置文件索引

### 1.1 框架配置

| 文件                 | 用途                | 关键配置项                                                            |
| -------------------- | ------------------- | --------------------------------------------------------------------- |
| `next.config.ts`     | Next.js 框架配置    | devIndicators=false、Turbopack、PWA 集成（Serwist）、局域网 IP 白名单 |
| `tsconfig.json`      | TypeScript 编译配置 | strict=true、noEmit=true、ES2017 target、路径别名 `@/*`               |
| `postcss.config.mjs` | PostCSS 配置        | 仅 `@tailwindcss/postcss` 插件                                        |
| `.prettierrc`        | Prettier 格式化配置 | 双引号、80 字符行宽、2 空格缩进、LF 换行、Tailwind 类名排序插件       |
| `package.json`       | 项目元数据与脚本    | 包名 `@saadnvd1/agent-os`、版本 `0.2.1`、Node >= 20                   |

### 1.2 服务器配置

| 文件        | 用途                         | 关键配置项                                                            |
| ----------- | ---------------------------- | --------------------------------------------------------------------- | --- | ---------------------------------------- |
| `server.ts` | 自定义 HTTP/WebSocket 服务器 | 监听 `0.0.0.0:3011`、WebSocket 路径 `/ws/terminal`、PTY Shell `$SHELL |     | /bin/zsh`、PTY 终端类型 `xterm-256color` |

### 1.3 桌面端配置

| 文件                         | 用途                 | 关键配置项                                                          |
| ---------------------------- | -------------------- | ------------------------------------------------------------------- |
| `src-tauri/tauri.conf.json`  | Tauri 桌面端配置     | 产品名 AgentOS、窗口 1400x900（最小 900x600）、CSP 禁用、自定义协议 |
| `src-tauri/Cargo.toml`       | Rust 包配置          | Tauri 2、Rust 2021 edition、custom-protocol feature                 |
| `src-tauri/Dockerfile.linux` | Tauri Linux 构建镜像 | 基于 `rust:latest`，安装 webkit2gtk 等依赖                          |

### 1.4 Git 配置

| 文件                | 用途                                                       |
| ------------------- | ---------------------------------------------------------- |
| `.husky/pre-commit` | Git pre-commit 钩子：Prettier 格式化 + TypeScript 类型检查 |
| `.gitignore`        | 排除 node_modules、dist、.next、out、.env、.env.local 等   |

### 1.5 安装脚本

| 文件                           | 用途                  |
| ------------------------------ | --------------------- |
| `scripts/agent-os`             | CLI 入口脚本          |
| `scripts/install.sh`           | 一键安装（curl 触发） |
| `scripts/setup.sh`             | 开发环境设置          |
| `scripts/lib/commands.sh`      | CLI 命令实现          |
| `scripts/lib/prerequisites.sh` | 系统依赖自动安装      |
| `scripts/lib/ai-clis.sh`       | AI CLI 检测安装       |
| `scripts/lib/common.sh`        | 公共函数库            |

---

## 二、环境变量列表

### 2.1 应用级环境变量（可配置）

| 变量名                 | 用途                                | 默认值                      | 引用位置                                                 |
| ---------------------- | ----------------------------------- | --------------------------- | -------------------------------------------------------- |
| `PORT`                 | 服务监听端口                        | `3011`                      | `server.ts:13`                                           |
| `NODE_ENV`             | 运行环境（development/production）  | 无（未设置时为开发模式）    | `server.ts:7`                                            |
| `DB_PATH`              | SQLite 数据库文件路径               | `./agent-os.db`（当前目录） | `lib/db/index.ts:11`                                     |
| `AGENTOS_URL`          | AgentOS 自身 URL（供 MCP 服务使用） | `http://localhost:3011`     | `lib/mcp-config.ts:11`、`mcp/orchestration-server.ts:32` |
| `CONDUCTOR_SESSION_ID` | 默认编排器会话 ID                   | `""`（空字符串）            | `mcp/orchestration-server.ts:35`                         |
| `CLAUDE_CONFIG_DIR`    | Claude 配置目录路径                 | `~/.claude`（默认）         | `app/api/sessions/status/route.ts:73`                    |

### 2.2 运维脚本环境变量

| 变量名              | 用途                  | 默认值                | 引用位置              |
| ------------------- | --------------------- | --------------------- | --------------------- |
| `AGENT_OS_HOME`     | AgentOS 安装根目录    | `$HOME/.agent-os`     | `scripts/agent-os:10` |
| `AGENT_OS_PORT`     | 服务端口（覆盖 PORT） | `3011`                | `scripts/agent-os:11` |
| `AGENT_OS_REPO_DIR` | 仓库代码目录          | `$AGENT_OS_HOME/repo` | `scripts/agent-os:15` |

### 2.3 系统级环境变量（运行时读取）

| 变量名  | 用途                   | 引用位置                                                                      |
| ------- | ---------------------- | ----------------------------------------------------------------------------- |
| `HOME`  | 用户主目录（`~` 替换） | `server.ts`、`lib/git.ts`、`lib/projects.ts`、`lib/claude/process-manager.ts` |
| `PATH`  | 可执行文件搜索路径     | `server.ts:55`、`lib/claude/process-manager.ts:155`、`lib/dev-servers.ts:188` |
| `USER`  | 当前用户名             | `server.ts:57`、`lib/dev-servers.ts:190`                                      |
| `SHELL` | 用户默认 Shell         | `server.ts:51`、`lib/dev-servers.ts:191`                                      |
| `TERM`  | 终端类型               | `server.ts:59`、`lib/dev-servers.ts:192`                                      |
| `LANG`  | 语言环境设置           | `server.ts:61`、`lib/dev-servers.ts:193`                                      |

---

## 三、环境变量配置模板

`.env.example` 内容（`scripts/setup.sh` 在 `.env` 不存在时自动复制）：

```
# Server Configuration
PORT=3011

# Database
DB_PATH=./agent-os.db
```

---

## 四、数据存储路径

| 项目          | 路径                              | 说明                                 |
| ------------- | --------------------------------- | ------------------------------------ |
| SQLite 数据库 | `DB_PATH`（默认 `./agent-os.db`） | 应用主数据库                         |
| 日志目录      | `~/.agent-os/logs/`               | 开发服务器日志                       |
| 安装目录      | `~/.agent-os/repo/`               | 克隆的仓库代码                       |
| PID 文件      | `~/.agent-os/agent-os.pid`        | 服务器进程 ID                        |
| 运行日志      | `~/.agent-os/agent-os.log`        | 服务器运行日志（超过 10MB 自动轮转） |

---

## 五、进程管理

| 项目              | 说明                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| 启动方式          | `nohup npm start >> $LOG_FILE 2>&1 &`                                                                   |
| PID 文件          | `$AGENT_OS_HOME/agent-os.pid`                                                                           |
| 日志轮转          | 超过 10MB 自动轮转为 `.log.old`                                                                         |
| 关闭流程          | SIGTERM -> 等待 10s -> SIGKILL 强制终止                                                                 |
| 开机自启（macOS） | launchd plist: `$HOME/Library/LaunchAgents/com.agent-os.plist`                                          |
| 开机自启（Linux） | systemd user service: `$HOME/.config/systemd/user/agent-os.service`，Restart=on-failure，RestartSec=10s |
