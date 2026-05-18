# AgentOS 本地开发环境搭建

> 最后更新：2026-05-18

---

## 一、环境要求

| 依赖            | 最低版本     | 用途                                         | 检查位置                                |
| --------------- | ------------ | -------------------------------------------- | --------------------------------------- |
| Node.js         | >= 20        | 运行时                                       | `package.json` engines 字段             |
| tmux            | 任意         | 终端会话管理                                 | `scripts/setup.sh` 检查                 |
| ripgrep (rg)    | 任意         | 代码搜索                                     | `scripts/lib/prerequisites.sh` 自动安装 |
| git             | 任意         | 版本控制                                     | `scripts/install.sh` 检查               |
| 至少一个 AI CLI | -            | AI 编码（Claude Code / Codex / OpenCode 等） | `README.md`                             |
| jq              | 任意（可选） | session ID 解析                              | `scripts/setup.sh` 标记为可选           |

**系统支持：** macOS、Linux（Debian/RedHat 系）

---

## 二、安装方式

### 2.1 快速安装（npm）

来源：`README.md`

```bash
npm install -g @saadnvd1/agent-os
agent-os install
agent-os start
```

### 2.2 一键安装（curl）

来源：`scripts/install.sh`

```bash
curl -fsSL https://raw.githubusercontent.com/saadnvd1/agent-os/main/scripts/install.sh | bash
```

脚本流程：检查 git -> 克隆仓库到 `~/.agent-os/repo` -> 执行 `agent-os install`。

### 2.3 手动开发安装

来源：`README.md` 和 `scripts/setup.sh`

```bash
git clone https://github.com/saadnvd1/agent-os
cd agent-os
npm install
npm run dev    # http://localhost:3011
```

---

## 三、开发命令

所有命令定义于 `package.json` 的 `scripts` 字段。

| 命令                  | 用途                | 完整命令                                     |
| --------------------- | ------------------- | -------------------------------------------- |
| `npm run dev`         | 启动开发服务器      | `tsx server.ts`（端口 3011，监听 `0.0.0.0`） |
| `npm run build`       | 生产构建            | `next build`                                 |
| `npm start`           | 启动生产服务器      | `NODE_ENV=production tsx server.ts`          |
| `npm run lint`        | ESLint 检查         | `eslint .`                                   |
| `npm run format`      | Prettier 格式化     | `prettier --write .`                         |
| `npm run typecheck`   | TypeScript 类型检查 | `tsc --noEmit`                               |
| `npm run setup`       | 运行安装脚本        | `bash scripts/setup.sh`                      |
| `npm run tauri:dev`   | Tauri 桌面开发      | `tauri dev`                                  |
| `npm run tauri:build` | Tauri 桌面构建      | `tauri build`                                |

---

## 四、setup.sh 详细流程

文件：`scripts/setup.sh`

1. 检查 Node.js 是否安装且版本 >= 20
2. 检查 tmux 是否安装
3. 检查 Claude Code CLI 是否安装
4. 检查 jq（可选，缺失仅警告）
5. 如果 `.env` 不存在且 `.env.example` 存在，则复制 `.env.example` 为 `.env`
6. 执行 `npm install`
7. 提示运行 `npm run dev`

---

## 五、agent-os install 完整流程

文件：`scripts/lib/commands.sh` + `scripts/lib/prerequisites.sh`

1. 检查并自动安装缺失的系统依赖（Node.js、git、tmux、ripgrep）
2. 支持 macOS（Homebrew/fnm）和 Linux（apt/yum）自动安装
3. macOS 非管理员用户使用 fnm（用户空间安装 Node.js）和预编译二进制（ripgrep）
4. 提示安装 AI CLI 工具
5. 克隆或更新仓库到 `~/.agent-os/repo`
6. 执行 `npm install --legacy-peer-deps`
7. 执行 `npm run build`
8. 创建 CLI 符号链接到 `~/.local/bin/agent-os`
9. 将 `~/.local/bin` 添加到 PATH

---

## 六、CLI 命令

安装后通过 `agent-os <command>` 调用：

| 命令                         | 用途                                            |
| ---------------------------- | ----------------------------------------------- |
| `agent-os install [--local]` | 安装 AgentOS（可选从本地源）                    |
| `agent-os start`             | 后台启动服务器                                  |
| `agent-os stop`              | 停止服务器                                      |
| `agent-os restart`           | 重启服务器                                      |
| `agent-os run`               | 启动并打开浏览器                                |
| `agent-os status`            | 查看运行状态和访问 URL                          |
| `agent-os logs`              | 实时查看日志                                    |
| `agent-os update`            | 更新到最新版本                                  |
| `agent-os enable`            | 设置开机自启（macOS: launchd / Linux: systemd） |
| `agent-os disable`           | 取消开机自启                                    |
| `agent-os uninstall`         | 完全卸载                                        |

---

## 七、代码质量工具

### 7.1 Git pre-commit hook

文件：`.husky/pre-commit`

1. 对暂存的 `.js/.jsx/.ts/.tsx/.json/.css/.md` 文件执行 Prettier 格式化
2. 重新暂存格式化后的文件
3. 执行 `npm run typecheck`（`tsc --noEmit`）类型检查

### 7.2 TypeScript

文件：`tsconfig.json`

- strict 模式（所有严格类型检查）
- noEmit（不输出文件，构建由 Next.js 处理）
- 路径别名 `@/*` 映射到项目根目录
- 排除 `node_modules`、`public/sw.js`、`app/sw.ts`

### 7.3 Prettier

文件：`.prettierrc`

双引号、80 字符行宽、2 空格缩进、LF 换行、Tailwind 类名自动排序。

### 7.4 ESLint

**配置缺失**：`package.json` 声明了 `eslint` ^9.39.2 和 `eslint-config-next` ^16.0.8 依赖，以及 `lint` 脚本，但项目中不存在 `eslint.config.*` 文件。ESLint 9.x 需要 flat config 格式，当前 `npm run lint` 可能使用默认行为或报错。

---

## 八、技术栈总览

| 层级       | 技术                          |
| ---------- | ----------------------------- |
| 框架       | Next.js 16（React 19）        |
| 语言       | TypeScript 5.9（strict 模式） |
| 样式       | Tailwind CSS v4 + PostCSS     |
| 状态管理   | Valtio + TanStack React Query |
| 终端       | node-pty + xterm.js           |
| WebSocket  | ws                            |
| 数据库     | better-sqlite3                |
| 代码编辑器 | Monaco Editor + CodeMirror    |
| UI 组件    | Radix UI + Lucide Icons       |
| 构建工具   | Next.js Turbopack + esbuild   |
| 运行时工具 | tsx（TypeScript 执行器）      |
| PWA        | Serwist                       |
| 桌面应用   | Tauri 2.x                     |
| 包管理     | npm                           |
