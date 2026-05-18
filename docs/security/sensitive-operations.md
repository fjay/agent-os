# AgentOS 敏感操作清单

> 更新日期: 2026-05-18
> 基于代码路径 `/root/code/agent-os` 全量安全分析
> 按风险等级分类，每个条目标注端点、代码路径、攻击方式和影响

---

## 一、严重（Critical）— 可导致完全控制服务器

### 1.1 任意 Shell 命令执行

| 属性     | 值                                                                                           |
| -------- | -------------------------------------------------------------------------------------------- |
| 端点     | `POST /api/exec`                                                                             |
| 代码路径 | `app/api/exec/route.ts:25`                                                                   |
| 攻击方式 | 直接将用户输入的 `command` 字符串传递给 `child_process.exec()`，无命令白名单、无过滤、无沙箱 |
| 影响     | 完全控制服务器——数据窃取、提权、持久化、横向移动                                             |

当前实现（`app/api/exec/route.ts:25`）：

```typescript
const { stdout, stderr } = await execAsync(command, {
  timeout: TIMEOUT, // 10 秒超时，仅限制执行时间
  shell: "/bin/zsh", // 使用完整 shell
});
```

唯一的限制是 10 秒超时，不限制命令内容。

---

### 1.2 PTY 终端 WebSocket

| 属性     | 值                                            |
| -------- | --------------------------------------------- |
| 端点     | `WS /ws/terminal`                             |
| 代码路径 | `server.ts:48-124`                            |
| 攻击方式 | 建立 WebSocket 连接即获得一个完整交互式 shell |
| 影响     | 交互式远程代码执行                            |

每个 WebSocket 连接都会在服务器上创建一个新的 PTY 进程（node-pty）。客户端发送的消息类型：

- `"input"` → `ptyProcess.write(msg.data)` — 原始输入
- `"command"` → `ptyProcess.write(msg.data + "\r")` — 带回车的命令

无连接认证，无命令过滤。

---

### 1.3 文件系统完整读写 — 读取

| 属性     | 值                                                                                   |
| -------- | ------------------------------------------------------------------------------------ |
| 端点     | `GET /api/files?path=...`                                                            |
| 代码路径 | `app/api/files/route.ts`, `app/api/files/content/route.ts`                           |
| 攻击方式 | 路径参数直接传递给文件系统操作，可读取 `/etc/shadow`、`/root/.ssh/id_rsa` 等任意文件 |
| 影响     | 敏感信息泄露（密钥、密码、配置）                                                     |

路径处理（`lib/files.ts`）：

```typescript
const expandedPath = path.replace(/^~/, process.env.HOME || "");
// expandedPath 可以是任意绝对路径
```

文件大小限制为 1MB（`lib/files.ts:140`），但不构成安全防护。无路径遍历防护，无路径白名单。

---

### 1.4 文件系统完整读写 — 写入

| 属性     | 值                                                                |
| -------- | ----------------------------------------------------------------- |
| 端点     | `POST /api/files/content`                                         |
| 代码路径 | `app/api/files/content/route.ts`                                  |
| 攻击方式 | 写入任意路径文件，可覆写系统配置、植入后门                        |
| 影响     | 文件篡改/覆写——覆写 `.ssh/authorized_keys`、`.bashrc`、crontab 等 |

---

## 二、高（High）— 可导致命令执行或数据篡改

### 2.1 Git Commit 消息命令注入

| 属性     | 值                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 端点     | `POST /api/git/commit`                                                                                                                                  |
| 代码路径 | `lib/git-status.ts:320-326`                                                                                                                             |
| 攻击方式 | commit message 仅转义双引号 `"`, 未转义反引号 `` ` ``、`$`、`\n` 等 shell 特殊字符。可构造 `` `rm -rf /` `` 或 `$(malicious_command)` 的 commit message |
| 影响     | 在服务器上执行任意命令                                                                                                                                  |

当前实现（`lib/git-status.ts:321`）：

```typescript
execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });
```

**修复方案**: 使用 `execFileSync("git", ["commit", "-m", message], { cwd })`。

---

### 2.2 Init Script 命令注入

| 属性     | 值                                                                                    |
| -------- | ------------------------------------------------------------------------------------- |
| 端点     | `POST /api/sessions/init-script`                                                      |
| 代码路径 | `app/api/sessions/init-script/route.ts:55`, `lib/banner.ts:49`                        |
| 攻击方式 | `agentCommand` 来自请求体，通过 `exec ${agentCommand}` 直接插入 bash 脚本，无任何转义 |
| 影响     | 执行任意 shell 命令                                                                   |

---

### 2.3 tmux 会话名命令注入

| 属性     | 值                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| 端点     | `POST /api/tmux/rename`                                                                                     |
| 代码路径 | `app/api/tmux/rename/route.ts:20`                                                                           |
| 攻击方式 | `oldName` 和 `newName` 直接来自请求体，无清理，通过 `tmux rename-session -t "${oldName}" "${newName}"` 拼接 |
| 影响     | 注入任意 tmux/shell 命令                                                                                    |

---

### 2.4 tmux 发送按键注入

| 属性     | 值                                                     |
| -------- | ------------------------------------------------------ |
| 端点     | `POST /api/orchestrate/spawn`（间接）                  |
| 代码路径 | `lib/orchestration.ts:355-357`                         |
| 攻击方式 | 消息仅转义 `"` 和 `$`，未转义反引号和其他 shell 元字符 |
| 影响     | 通过 tmux 在 Agent 会话中注入命令                      |

当前实现（`lib/orchestration.ts:355-357`）：

```typescript
const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, "\\$");
await execAsync(
  `tmux send-keys -t "${tmuxSessionName}" "${escapedMessage}" Enter`
);
```

---

### 2.5 Git Clone URL 注入

| 属性     | 值                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------ |
| 端点     | `POST /api/git/clone`                                                                            |
| 代码路径 | `app/api/git/clone/route.ts:68`                                                                  |
| 攻击方式 | URL 参数仅做了双引号包裹，如果 URL 包含 `"` 则可逃逸出引号。`extractRepoName` 的正则匹配不够严格 |
| 影响     | 命令执行                                                                                         |

当前实现（`app/api/git/clone/route.ts:68`）：

```typescript
const { stderr } = await execAsync(`git clone "${url}" "${clonePath}"`, {
  timeout: 120000,
});
```

---

### 2.6 开发服务器命令执行

| 属性     | 值                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------- |
| 端点     | `POST /api/dev-servers`                                                                            |
| 代码路径 | `lib/dev-servers.ts:201-203`                                                                       |
| 攻击方式 | 用户指定任意 shell 命令作为开发服务器启动命令，通过 `spawn(fullCommand, [], { shell: true })` 执行 |
| 影响     | 执行任意 shell 命令                                                                                |

当前实现（`lib/dev-servers.ts:201-203`）：

```typescript
const fullCommand = `cd "${cwd}" && ${command}`;
const child = spawn(fullCommand, [], { shell: true });
```

---

### 2.7 Docker 命令注入

| 属性     | 值                                                     |
| -------- | ------------------------------------------------------ |
| 端点     | `POST /api/dev-servers`（Docker Compose 模式）         |
| 代码路径 | `lib/dev-servers.ts:229`, `lib/dev-servers.ts:304`     |
| 攻击方式 | Docker Compose 文件路径和容器 ID 直接拼接到 shell 命令 |
| 影响     | 容器逃逸、宿主机命令执行                               |

---

### 2.8 文件上传无限制

| 属性     | 值                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------- |
| 端点     | `POST /api/files/upload-temp`                                                                        |
| 代码路径 | `app/api/files/upload-temp/route.ts`                                                                 |
| 攻击方式 | 无文件类型验证（仅检查 `mimeType` 字符串，客户端可伪造）、无文件大小限制、无内容检查、无上传频率限制 |
| 影响     | 磁盘耗尽、上传恶意文件                                                                               |

上传目标为 `os.tmpdir()/agent-os-screenshots/`，文件名有基本清理（去除非字母数字字符）。

---

### 2.9 Git Push 无认证

| 属性     | 值                                                   |
| -------- | ---------------------------------------------------- |
| 端点     | `POST /api/git/push`                                 |
| 代码路径 | `app/api/git/push/route.ts`, `lib/git-status.ts:338` |
| 攻击方式 | 任何人可以触发 git push，推送恶意提交到远程仓库      |
| 影响     | 代码仓库篡改                                         |

---

### 2.10 Discard 文件路径注入

| 属性     | 值                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| 端点     | `POST /api/git/discard`                                                                                                     |
| 代码路径 | `lib/git-status.ts:243-259`                                                                                                 |
| 攻击方式 | `discardChanges` 使用用户提供的 `filePath` 构造 `git checkout -- "${filePath}"` 和 `unlinkSync(join(workingDir, filePath))` |
| 影响     | 任意文件删除                                                                                                                |

---

### 2.11 Branch Name 注入

| 属性     | 值                                          |
| -------- | ------------------------------------------- |
| 端点     | `POST /api/git/stage`（创建分支时）         |
| 代码路径 | `lib/git-status.ts:310-315`                 |
| 攻击方式 | `branchName` 来自用户输入，仅包裹在双引号中 |
| 影响     | 命令执行                                    |

---

## 三、中（Medium）— 可导致信息泄露或有限影响

### 3.1 代码搜索路径无限制

| 属性     | 值                                                                        |
| -------- | ------------------------------------------------------------------------- |
| 端点     | `GET /api/code-search?query=...&path=...`                                 |
| 代码路径 | `lib/code-search.ts:66`, `app/api/code-search/route.ts`                   |
| 攻击方式 | 搜索路径无限制，可以搜索文件系统上的任意目录（包括 `/etc`、`/root/.ssh`） |
| 影响     | 敏感信息泄露                                                              |

注意: ripgrep 使用 `spawnSync` + 参数数组调用，不存在命令注入风险。

---

### 3.2 无 CORS 策略

| 属性     | 值                                                 |
| -------- | -------------------------------------------------- |
| 端点     | 全部                                               |
| 代码路径 | `next.config.ts`（未配置 CORS）                    |
| 攻击方式 | 恶意网站可以通过用户的浏览器发起跨域请求到 AgentOS |
| 影响     | CSRF 攻击——在用户不知情的情况下执行操作            |

---

### 3.3 无请求频率限制

| 属性     | 值                        |
| -------- | ------------------------- |
| 端点     | 全部                      |
| 代码路径 | 无中间件层                |
| 攻击方式 | 快速重复调用 API          |
| 影响     | 拒绝服务（DoS），资源耗尽 |

---

### 3.4 环境配置中的命令执行

| 属性     | 值                                                                                            |
| -------- | --------------------------------------------------------------------------------------------- |
| 端点     | 间接，通过 `POST /api/sessions`（创建 worktree 时）                                           |
| 代码路径 | `lib/env-setup.ts:209`                                                                        |
| 攻击方式 | 如果攻击者能写入项目配置文件 `.agent-os/worktrees.json` 或 `.agent-os.json` 中的 `setup` 命令 |
| 影响     | 在 worktree 创建时执行任意命令                                                                |

---

### 3.5 MCP 配置文件写入

| 属性     | 值                                                                                        |
| -------- | ----------------------------------------------------------------------------------------- |
| 端点     | 间接，通过 `POST /api/sessions`                                                           |
| 代码路径 | `lib/mcp-config.ts:65`                                                                    |
| 攻击方式 | 在任意工作目录写入 `.mcp.json`，如果工作目录是 Git 仓库，该文件可能被提交并影响其他开发者 |
| 影响     | 供应链攻击                                                                                |

---

## 四、低（Low）— 理论风险，当前不可利用

### 4.1 动态 SQL 构建

| 属性     | 值                                                                                      |
| -------- | --------------------------------------------------------------------------------------- |
| 端点     | `PATCH /api/sessions/[id]`                                                              |
| 代码路径 | `app/api/sessions/[id]/route.ts:128-132`                                                |
| 攻击方式 | `updates` 数组由代码内部构建，列名硬编码，不接受用户输入                                |
| 影响     | 当前不可利用 SQL 注入。但模式不安全——如果将来有人不小心将用户输入引入列名，就会产生漏洞 |

所有其他数据库操作使用 prepared statements 和参数化查询（`lib/db/queries.ts`），不存在 SQL 注入。

---

### 4.2 环境变量泄露

| 属性     | 值                                     |
| -------- | -------------------------------------- |
| 端点     | `POST /api/exec`                       |
| 代码路径 | `app/api/exec/route.ts:29`             |
| 攻击方式 | 命令执行的返回结果中可能包含环境变量值 |
| 影响     | 信息泄露（API Key 等）                 |

---

## 五、按文件的命令注入风险点完整列表

以下为使用 `exec/execSync` + 字符串拼接的所有位置（共 30+ 处），均存在潜在的命令注入风险：

| 文件                           | 行号    | 拼接的命令                                                          |
| ------------------------------ | ------- | ------------------------------------------------------------------- |
| `app/api/exec/route.ts`        | 25      | 直接执行用户命令                                                    |
| `lib/git-status.ts`            | 164     | `git diff ${stagedFlag} -- "${filePath}"`                           |
| `lib/git-status.ts`            | 186     | `git diff --no-index /dev/null "${filePath}"`                       |
| `lib/git-status.ts`            | 204     | `git add -- "${filePath}"`                                          |
| `lib/git-status.ts`            | 224     | `git reset HEAD -- "${filePath}"`                                   |
| `lib/git-status.ts`            | 246     | `git ls-files --error-unmatch "${filePath}"`                        |
| `lib/git-status.ts`            | 252     | `git checkout -- "${filePath}"`                                     |
| `lib/git-status.ts`            | 311     | `git checkout -b "${branchName}"`                                   |
| `lib/git-status.ts`            | 321     | `git commit -m "${message...}"`                                     |
| `lib/git-status.ts`            | 338     | `git push ${upstreamFlag}`                                          |
| `lib/git.ts`                   | 18      | `git -C "${resolvedPath}" rev-parse --git-dir`                      |
| `lib/git.ts`                   | 33      | `git -C "${resolvedPath}" rev-parse --abbrev-ref HEAD`              |
| `lib/git.ts`                   | 47      | `git -C "${resolvedPath}" symbolic-ref ...`                         |
| `lib/git.ts`                   | 82      | `git -C "${resolvedPath}" branch --format=...`                      |
| `lib/git.ts`                   | 101     | `git -C "${resolvedPath}" rev-parse --verify "${branchName}"`       |
| `lib/git.ts`                   | 147     | `git -C "${resolvedPath}" ls-remote --heads origin "${branchName}"` |
| `lib/git.ts`                   | 172     | `git -C "${resolvedPath}" branch -m "${old}" "${new}"`              |
| `lib/git.ts`                   | 189     | `git -C "${resolvedPath}" push origin "${newBranchName}" -u`        |
| `lib/git.ts`                   | 195     | `git -C "${resolvedPath}" push origin --delete "${oldBranchName}"`  |
| `lib/git.ts`                   | 221     | `git -C "${resolvedPath}" status --porcelain`                       |
| `lib/git.ts`                   | 246     | `git -C "${resolvedPath}" rev-list --left-right...`                 |
| `lib/orchestration.ts`         | 171     | `tmux new-session -d -s "${name}" -c "${cwd}"`                      |
| `lib/orchestration.ts`         | 207     | `tmux send-keys -t '${name}' Enter`                                 |
| `lib/orchestration.ts`         | 239     | `tmux send-keys -t '${name}' -l '${task}'`                          |
| `lib/orchestration.ts`         | 331     | `tmux capture-pane -t "${name}" -p`                                 |
| `lib/orchestration.ts`         | 357     | `tmux send-keys -t "${name}" "${msg}" Enter`                        |
| `lib/orchestration.ts`         | 397     | `tmux kill-session -t "${name}"`                                    |
| `app/api/tmux/rename/route.ts` | 20      | `tmux rename-session -t "${old}" "${new}"`                          |
| `app/api/git/clone/route.ts`   | 68      | `git clone "${url}" "${clonePath}"`                                 |
| `lib/pr.ts`                    | 163-186 | `gh pr create --title ... --body ...`                               |
| `lib/pr-generation.ts`         | 163     | `claude --print "${prompt...}"`                                     |
| `lib/dev-servers.ts`           | 201     | `cd "${cwd}" && ${command}` (shell: true)                           |
| `lib/dev-servers.ts`           | 229     | `docker compose up -d ${command}`                                   |
| `lib/dev-servers.ts`           | 304     | `docker stop ${server.container_id}`                                |
| `lib/worktrees.ts`             | 109     | `git -C "${path}" worktree add -b "${branch}"...`                   |

安全调用（参数数组形式，无注入风险）：

- `lib/code-search.ts:66` — `spawnSync("rg", args, ...)` 安全
- `lib/claude/process-manager.ts:151` — `spawn(claudePath, args, ...)` 安全
