# Git 操作

## 概述

AgentOS 提供完整的 Git 操作 UI：查看仓库状态（staged/unstaged/untracked）、查看文件 diff、暂存/取消暂存、丢弃更改、提交、推送、查看历史、创建 PR。支持多仓库聚合状态和 worktree 隔离开发。Git 操作直接调用 git CLI，不使用独立数据表。

## 核心代码路径

### API 路由

- `app/api/git/status/route.ts` — 状态和 diff 查询
- `app/api/git/stage/route.ts` — 暂存文件
- `app/api/git/unstage/route.ts` — 取消暂存
- `app/api/git/discard/route.ts` — 丢弃更改
- `app/api/git/commit/route.ts` — 提交
- `app/api/git/push/route.ts` — 推送
- `app/api/git/history/route.ts` — 提交历史
- `app/api/git/history/[hash]/route.ts` — 提交详情
- `app/api/git/history/[hash]/diff/route.ts` — 提交 diff
- `app/api/git/pr/route.ts` — PR 操作
- `app/api/git/multi-status/route.ts` — 多仓库聚合状态
- `app/api/git/check/route.ts` — Git 仓库检查
- `app/api/git/clone/route.ts` — 克隆仓库
- `app/api/git/file-content/route.ts` — Git 中文件内容

### 核心库

- `lib/git-status.ts` — Git 状态解析（基于 `git status --porcelain=v1`）、diff、stage、unstage、discard、commit、push
- `lib/git.ts` — Git 工具函数（分支管理、worktree 相关、远程操作）
- `lib/git-history.ts` — 提交历史和详情解析
- `lib/multi-repo-git.ts` — 多仓库 Git 状态聚合
- `lib/diff-parser.ts` — Diff 输出解析
- `lib/pr.ts` — PR 操作（gh CLI 封装）
- `lib/pr-generation.ts` — PR 标题/描述自动生成（Claude CLI + 启发式）
- `lib/worktrees.ts` — Git worktree 创建/删除/列表

### 数据层

- `data/git/queries.ts` — React Query hooks
- `data/git/keys.ts` — Query key 定义

## 主流程

### 1. 查看 Git 状态（GET /api/git/status）

```
GET /api/git/status?path={dir}
→ expandPath(path)
→ isGitRepo(path) 验证
→ getGitStatus(path):
    1. git branch --show-current → 当前分支
    2. git rev-list --left-right --count @{upstream}...HEAD → ahead/behind
    3. git status --porcelain=v1 → 解析文件列表
       - "?? file" → untracked
       - index char != " " → staged
       - worktree char != " " → unstaged
       - "R  old -> new" → renamed (oldPath)
→ 返回 { branch, ahead, behind, staged[], unstaged[], untracked[] }
```

### 2. 查看文件 diff

```
GET /api/git/status?path={dir}&file={path}&staged={bool}&untracked={bool}
→ tracked file: git diff [--staged] -- "{file}"
→ untracked file: git diff --no-index /dev/null "{file}"
→ 返回 { diff: string }
```

### 3. 提交流程（POST /api/git/commit）

```
POST /api/git/commit { path, message, branchName? }
→ expandPath(path) → isGitRepo 验证
→ getGitStatus(path) 检查 staged 文件
→ 如在 main/master 且提供了 branchName:
    → git checkout -b "{branchName}"
→ git commit -m "{message}"
→ 返回 { success, output, newBranch?, branchName? }
```

### 4. 推送流程（POST /api/git/push）

```
POST /api/git/push { path }
→ expandPath → isGitRepo 验证
→ getRemoteUrl(path) 检查远程配置
→ getGitStatus(path) 检查 ahead 数量
→ hasUpstream(path) 检查是否需要 -u
→ git push [-u origin "{branch}"]
→ 返回 { success, output, pushed, setUpstream }
```

### 5. PR 创建流程（POST /api/git/pr）

```
POST /api/git/pr { path, title, description, baseBranch? }
→ 验证 gh CLI 可用（checkGhCli）
→ getCurrentBranch → 检查不是 main/master
→ getPRForBranch → 检查 PR 不已存在
→ createPR(path, branch, base, title, description)
→ 返回 { pr }

PR 内容生成（GET /api/git/pr?generate=true）:
→ 获取 diff、commits、changed files
→ 尝试 Claude CLI 生成（claude --print "Generate PR..."）
→ 回退到启发式生成
→ 返回 { suggestedTitle, suggestedBody }
```

### 6. 多仓库状态聚合

```
GET /api/git/multi-status?projectId={id}
→ getProjectRepositories(projectId)
→ getMultiRepoGitStatus(repositories, fallbackPath):
    - 对每个仓库执行 getGitStatus()
    - 为文件添加 repoId/repoName/repoPath 前缀
    - 聚合所有 staged/unstaged/untracked
→ 返回 { repositories[], staged[], unstaged[], untracked[] }
```

### 7. Worktree 管理

```
createWorktree({ projectPath, featureName, baseBranch }):
→ 验证 Git 仓库 → 生成分支名 feature/{slug}
→ 检查分支不存在
→ 生成 worktree 路径: ~/.agent-os/worktrees/{project}-{feature}
→ git worktree add -b "{branch}" "{worktreePath}" "{ref}"
   ref 尝试顺序: origin/{base} → refs/heads/{base} → {base}
→ 返回 { worktreePath, branchName, baseBranch, projectPath }

deleteWorktree(worktreePath, projectPath, deleteBranch):
→ 获取当前分支名（用于可选删除）
→ git worktree remove --force
→ 如失败 → rm -rf + git worktree prune
→ 可选: git branch -D "{branch}"
```

## 状态转换

### 文件状态

```
untracked ──git add──▶ staged ──git commit──▶ committed
                           │
                     git reset
                           │
                           ▼
                        unstaged ──git checkout──▶ clean
```

### PR 状态

```
none ──gh pr create──▶ open ──merge──▶ merged
                            │
                          close
                            ▼
                         closed
```

### PR 缓存字段（sessions 表）

| 字段                   | 说明               |
| ---------------------- | ------------------ |
| sessions.pr_url        | PR URL             |
| sessions.pr_number     | PR 编号            |
| sessions.pr_status     | open/merged/closed |
| sessions.worktree_path | Worktree 路径      |
| sessions.branch_name   | Git 分支名         |
| sessions.base_branch   | 基础分支           |

## 排查路径

1. **状态不更新** → 检查 `git status --porcelain=v1` 输出 → 检查路径展开
2. **无法暂存** → 检查文件路径中的特殊字符 → 检查 git add 权限
3. **提交失败** → 检查是否有 staged 文件 → 检查 commit message 转义
4. **推送失败** → 检查远程配置 → 检查 upstream 设置 → 检查 `gh auth status`
5. **PR 创建失败** → 检查 `gh` CLI 安装和认证 → 检查是否在 main 分支
6. **Worktree 冲突** → 检查 `~/.agent-os/worktrees/` → `git worktree list` → `git worktree prune`
7. **多仓库状态不完整** → 检查 `project_repositories` 配置 → 检查各仓库路径有效性
