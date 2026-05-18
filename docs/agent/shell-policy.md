# Agent 安全 Shell 命令策略

> 更新日期: 2026-05-18
> 适用项目: AgentOS（`/root/code/agent-os`）
> 基于安全分析的实际发现生成，非通用模板

---

## 一、概述

AgentOS 的核心功能是管理 AI 编码会话（Claude Code、Codex 等），这些会话本身就是具有完全 shell 访问权限的 agent。Agent 运行在服务器上的 tmux 会话中，通过 node-pty 交互。

当前安全模型假设：

- Agent 本身是可信的（由用户显式启动）
- 服务器运行在可信环境中（本地或私有网络）
- 用户通过浏览器直接操作

**关键事实**: 当前所有 API 端点无认证（`server.ts`、全部 `app/api/*/route.ts`），所有操作均无条件允许。

---

## 二、允许的命令类别（只读操作）

以下操作不修改系统状态，可安全执行：

### 2.1 系统信息查询

| 命令                   | 用途           | 代码路径                              |
| ---------------------- | -------------- | ------------------------------------- |
| `git status`           | 查看 Git 状态  | `lib/git.ts:221`, `lib/git-status.ts` |
| `git log` / `git diff` | 查看历史和差异 | `lib/git-history.ts`                  |
| `git branch --list`    | 列出分支       | `lib/git.ts:82`                       |
| `git rev-parse`        | 查询仓库信息   | `lib/git.ts:18,33,47,101`             |
| `git ls-remote`        | 查询远程分支   | `lib/git.ts:147`                      |

### 2.2 文件系统只读

| 命令            | 用途         | 代码路径                                              |
| --------------- | ------------ | ----------------------------------------------------- |
| `ls` / 目录列表 | 浏览文件结构 | `app/api/files/route.ts`                              |
| 文件内容读取    | 查看文件内容 | `app/api/files/content/route.ts`（GET）               |
| `rg` (ripgrep)  | 代码搜索     | `lib/code-search.ts:66`（安全：spawnSync + 参数数组） |

### 2.3 进程和会话查询

| 命令                 | 用途            | 代码路径                                                 |
| -------------------- | --------------- | -------------------------------------------------------- |
| `tmux list-sessions` | 查看 tmux 会话  | `lib/status-detector.ts`                                 |
| `tmux capture-pane`  | 获取终端输出    | `lib/orchestration.ts:331`, `lib/status-detector.ts:227` |
| 会话状态查询         | 获取 Agent 状态 | `app/api/sessions/status/route.ts`                       |
| Worker 列表查询      | 查看编排状态    | `app/api/orchestrate/workers/route.ts`                   |

### 2.4 数据库查询

| 命令          | 用途         | 代码路径                                         |
| ------------- | ------------ | ------------------------------------------------ |
| SQLite SELECT | 所有查询操作 | `lib/db/queries.ts`（prepared statements，安全） |

---

## 三、禁止的命令类别（写操作）

以下操作具有破坏性或安全风险，Agent 不应自主执行：

### 3.1 直接 PTY 写入

| 操作                                   | 风险                               | 代码路径           |
| -------------------------------------- | ---------------------------------- | ------------------ |
| `ptyProcess.write()`                   | 直接写入 PTY 终端，可执行任意命令  | `server.ts:99-106` |
| WebSocket `"input"` / `"command"` 消息 | 通过 WebSocket 向 PTY 发送任意输入 | `server.ts:99,105` |

### 3.2 任意命令执行

| 操作                                | 风险                    | 代码路径                   |
| ----------------------------------- | ----------------------- | -------------------------- |
| `POST /api/exec`                    | 直接执行任意 shell 命令 | `app/api/exec/route.ts:25` |
| `child_process.exec()` + 字符串拼接 | 命令注入风险（30+ 处）  | 见第五节完整列表           |

### 3.3 Git 写操作

| 操作                       | 风险               | 代码路径                                             |
| -------------------------- | ------------------ | ---------------------------------------------------- |
| `git push`                 | 推送代码到远程仓库 | `app/api/git/push/route.ts`, `lib/git-status.ts:338` |
| `git commit` + 消息拼接    | 命令注入风险       | `lib/git-status.ts:321`                              |
| `git clone` + URL 拼接     | URL 注入风险       | `app/api/git/clone/route.ts:68`                      |
| `git push origin --delete` | 删除远程分支       | `lib/git.ts:195`                                     |

### 3.4 文件系统写操作

| 操作         | 风险                               | 代码路径                                 |
| ------------ | ---------------------------------- | ---------------------------------------- |
| 写入任意文件 | 可覆写系统文件                     | `app/api/files/content/route.ts`（POST） |
| 删除文件     | `discardChanges` 中的 `unlinkSync` | `lib/git-status.ts:252`                  |
| 文件上传     | 无大小限制、无类型验证             | `app/api/files/upload-temp/route.ts`     |

### 3.5 Docker 操作

| 操作                           | 风险         | 代码路径                 |
| ------------------------------ | ------------ | ------------------------ |
| `docker compose up` + 参数拼接 | 命令注入风险 | `lib/dev-servers.ts:229` |
| `docker stop` + ID 拼接        | 命令注入风险 | `lib/dev-servers.ts:304` |

### 3.6 tmux 会话操作

| 操作                             | 风险         | 代码路径                          |
| -------------------------------- | ------------ | --------------------------------- |
| `tmux new-session` + 参数拼接    | 命令注入风险 | `lib/orchestration.ts:171`        |
| `tmux rename-session` + 参数拼接 | 命令注入风险 | `app/api/tmux/rename/route.ts:20` |
| `tmux send-keys` + 消息拼接      | 命令注入风险 | `lib/orchestration.ts:239,357`    |

### 3.7 数据库写入

| 操作          | 风险                   | 代码路径                                 |
| ------------- | ---------------------- | ---------------------------------------- |
| 动态 SQL 构建 | 列名硬编码但模式不安全 | `app/api/sessions/[id]/route.ts:128-132` |

---

## 四、需要确认的命令类别

以下操作具有修改效果但属于正常业务流程，执行前需要确认：

### 4.1 数据库写入操作

| 操作         | 确认点             | 代码路径                                   |
| ------------ | ------------------ | ------------------------------------------ |
| 创建会话     | 写入 `sessions` 表 | `lib/db/queries.ts`（prepared statements） |
| 创建项目     | 写入 `projects` 表 | `lib/db/queries.ts`                        |
| 更新会话状态 | 动态 UPDATE        | `app/api/sessions/[id]/route.ts:128-132`   |
| 数据库迁移   | DDL 操作           | `lib/db/migrations.ts`                     |

### 4.2 文件修改操作（项目范围内）

| 操作              | 确认点           | 代码路径                                                     |
| ----------------- | ---------------- | ------------------------------------------------------------ |
| 保存文件内容      | 在项目目录内写入 | `app/api/files/content/route.ts`（POST）                     |
| Git stage/unstage | 修改暂存区       | `app/api/git/stage/route.ts`, `app/api/git/unstage/route.ts` |
| Git commit        | 提交变更         | `app/api/git/commit/route.ts`                                |
| Git checkout 分支 | 切换分支         | `lib/git-status.ts:311`                                      |

### 4.3 Worktree 操作

| 操作          | 确认点                             | 代码路径                  |
| ------------- | ---------------------------------- | ------------------------- |
| 创建 Worktree | 在 `~/.agent-os/worktrees/` 下创建 | `lib/worktrees.ts:21,109` |
| 删除 Worktree | 清理 worktree 和分支               | `lib/worktrees.ts`        |

### 4.4 环境配置

| 操作            | 确认点                      | 代码路径               |
| --------------- | --------------------------- | ---------------------- |
| `.env` 文件复制 | 从项目根目录复制到 worktree | `lib/env-setup.ts:124` |
| `npm install`   | 在 worktree 中安装依赖      | `lib/env-setup.ts:209` |
| MCP 配置写入    | 写入 `.mcp.json`            | `lib/mcp-config.ts:65` |

---

## 五、命令注入风险点完整列表

基于安全分析，项目中存在 **30+ 处**使用 `exec/execSync` + 字符串拼接的位置，均存在潜在的命令注入风险。

### 5.1 Git 操作（lib/git-status.ts）

| 行号 | 拼接的命令                                    | 用户可控参数            |
| ---- | --------------------------------------------- | ----------------------- |
| 164  | `git diff ${stagedFlag} -- "${filePath}"`     | `filePath`              |
| 186  | `git diff --no-index /dev/null "${filePath}"` | `filePath`              |
| 204  | `git add -- "${filePath}"`                    | `filePath`              |
| 224  | `git reset HEAD -- "${filePath}"`             | `filePath`              |
| 246  | `git ls-files --error-unmatch "${filePath}"`  | `filePath`              |
| 252  | `git checkout -- "${filePath}"`               | `filePath`              |
| 311  | `git checkout -b "${branchName}"`             | `branchName`            |
| 321  | `git commit -m "${message...}"`               | `message`（仅转义 `"`） |
| 338  | `git push ${upstreamFlag}`                    | 间接可控                |

**注意**: 仅做了双引号包裹，没有转义反引号 `` ` ``、`$`、`\n` 等 shell 特殊字符。

### 5.2 Git 基础操作（lib/git.ts）

| 行号 | 拼接的命令                                                          | 用户可控参数                    |
| ---- | ------------------------------------------------------------------- | ------------------------------- |
| 18   | `git -C "${resolvedPath}" rev-parse --git-dir`                      | `resolvedPath`                  |
| 33   | `git -C "${resolvedPath}" rev-parse --abbrev-ref HEAD`              | `resolvedPath`                  |
| 47   | `git -C "${resolvedPath}" symbolic-ref ...`                         | `resolvedPath`                  |
| 82   | `git -C "${resolvedPath}" branch --format=...`                      | `resolvedPath`                  |
| 101  | `git -C "${resolvedPath}" rev-parse --verify "${branchName}"`       | `resolvedPath`, `branchName`    |
| 147  | `git -C "${resolvedPath}" ls-remote --heads origin "${branchName}"` | `resolvedPath`, `branchName`    |
| 172  | `git -C "${resolvedPath}" branch -m "${old}" "${new}"`              | `resolvedPath`, 分支名          |
| 189  | `git -C "${resolvedPath}" push origin "${newBranchName}" -u`        | `resolvedPath`, `newBranchName` |
| 195  | `git -C "${resolvedPath}" push origin --delete "${oldBranchName}"`  | `resolvedPath`, `oldBranchName` |
| 221  | `git -C "${resolvedPath}" status --porcelain`                       | `resolvedPath`                  |
| 246  | `git -C "${resolvedPath}" rev-list --left-right...`                 | `resolvedPath`                  |

### 5.3 编排系统（lib/orchestration.ts）

| 行号 | 拼接的命令                                     | 用户可控参数                                      |
| ---- | ---------------------------------------------- | ------------------------------------------------- |
| 171  | `tmux new-session -d -s "${name}" -c "${cwd}"` | `tmuxSessionName`, `cwd`                          |
| 207  | `tmux send-keys -t '${name}' Enter`            | `tmuxSessionName`                                 |
| 239  | `tmux send-keys -t '${name}' -l '${task}'`     | `tmuxSessionName`, `task`                         |
| 331  | `tmux capture-pane -t "${name}" -p`            | `tmuxSessionName`                                 |
| 357  | `tmux send-keys -t "${name}" "${msg}" Enter`   | `tmuxSessionName`, `message`（仅转义 `"` 和 `$`） |
| 397  | `tmux kill-session -t "${name}"`               | `tmuxSessionName`                                 |

### 5.4 其他高风险位置

| 文件                           | 行号    | 拼接的命令                                        |
| ------------------------------ | ------- | ------------------------------------------------- |
| `app/api/exec/route.ts`        | 25      | 直接执行用户命令                                  |
| `app/api/tmux/rename/route.ts` | 20      | `tmux rename-session -t "${old}" "${new}"`        |
| `app/api/git/clone/route.ts`   | 68      | `git clone "${url}" "${clonePath}"`               |
| `lib/pr.ts`                    | 163-186 | `gh pr create --title ... --body ...`             |
| `lib/pr-generation.ts`         | 163     | `claude --print "${prompt...}"`                   |
| `lib/dev-servers.ts`           | 201     | `cd "${cwd}" && ${command}`（shell: true）        |
| `lib/dev-servers.ts`           | 229     | `docker compose up -d ${command}`                 |
| `lib/dev-servers.ts`           | 304     | `docker stop ${server.container_id}`              |
| `lib/worktrees.ts`             | 109     | `git -C "${path}" worktree add -b "${branch}"...` |
| `lib/banner.ts`                | 49      | `exec ${agentCommand}`（无转义）                  |

### 5.5 安全的调用方式（参考）

以下位置使用参数数组形式，不存在命令注入风险，可作为修复参考：

| 文件                            | 行号 | 调用方式                              |
| ------------------------------- | ---- | ------------------------------------- |
| `lib/code-search.ts`            | 66   | `spawnSync("rg", args, ...)` — 安全   |
| `lib/claude/process-manager.ts` | 151  | `spawn(claudePath, args, ...)` — 安全 |

**推荐修复模式**:

```typescript
// 替换前（危险）:
execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });

// 替换后（安全）:
execFileSync("git", ["commit", "-m", message], { cwd });
```

---

## 六、特殊注意事项

### 6.1 Init Script 命令注入

`lib/banner.ts:49` 中 `agentCommand` 来自 API 请求体，通过 `exec ${agentCommand}` 直接插入 bash 脚本，**无任何转义**。这是所有注入点中最危险的——攻击者无需构造特殊字符，直接传入恶意命令即可。

### 6.2 tmux send-keys 的双重转义缺陷

`lib/orchestration.ts:355-357` 仅转义了 `"` 和 `$`：

```typescript
const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, "\\$");
```

未转义的反引号 `` ` ``、`!`、`\` 等字符仍可用于注入。

### 6.3 文件路径参数无验证

文件操作 API（`app/api/files/route.ts`、`app/api/files/content/route.ts`）的路径参数直接传递给文件系统操作，没有：

- 路径白名单验证
- 路径遍历（`../`）检测
- 符号链接解析
- 权限检查

`lib/files.ts` 中的目录排除列表（`.env`、`.git`、`node_modules`）仅影响目录浏览，不影响直接路径访问。

### 6.4 Git discard 操作可删除任意文件

`lib/git-status.ts:252` 的 `discardChanges` 函数使用 `unlinkSync(join(workingDir, filePath))` 删除文件。`filePath` 来自用户输入，如果 `filePath` 包含 `../`，可能删除工作目录之外的文件。

### 6.5 后台异步操作的风险

`lib/async-operations.ts` 的 `runInBackground()` 使用 fire-and-forget 模式执行异步任务。这些任务包括：

- Worktree 清理（`lib/worktrees.ts`）
- npm install（`lib/env-setup.ts`）
- 环境配置（`.env` 复制）

错误仅记录到 console，不影响 API 响应。如果这些操作中包含注入命令，错误可能被静默吞噬。
