# 文件管理

## 概述

AgentOS 提供 Web 端的文件浏览器和编辑器功能。用户可以浏览项目目录结构、查看文件内容、编辑文件并保存、上传文件到临时目录。支持排除模式（node_modules、.git 等）、递归目录扫描、二进制文件检测。文件操作直接访问文件系统，不使用独立数据表。

## 核心代码路径

### API 路由

- `app/api/files/route.ts` — 目录浏览
- `app/api/files/content/route.ts` — 文件读写
- `app/api/files/upload-temp/route.ts` — 文件上传

### 核心库

- `lib/files.ts` — 服务端文件系统操作（listDirectory, readFileContent, writeFileContent）
- `lib/file-utils.ts` — 客户端安全类型和工具函数（FileNode 类型、语言检测）
- `lib/file-upload.ts` — 客户端上传辅助函数

### 数据层

- `data/files/queries.ts` — React Query hooks
- `data/files/keys.ts` — Query key 定义

## 主流程

### 1. 浏览目录（GET /api/files）

```
GET /api/files?path={dir}&recursive={bool}
→ 展开 ~ → $HOME
→ listDirectory(expandedPath, { recursive, maxDepth })
  1. readdirSync(dirPath)
  2. 对每个 entry:
     - shouldExclude(entry, DEFAULT_EXCLUDES)? → 跳过
     - statSync → 判断 file/directory
     - 文件: 记录 size, extension
     - 目录 + recursive + 未达 maxDepth: 递归加载 children
  3. 排序: 目录优先 → 字母序
→ 返回 { files: FileNode[], path }
```

### 2. 读取文件（GET /api/files/content）

```
GET /api/files/content?path={file}
→ 展开 ~ → $HOME
→ readFileContent(expandedPath):
  1. statSync → 检查文件大小（> 1MB → 返回 "too large"）
  2. readFileSync → Buffer
  3. 二进制检测: buffer.includes(0) → null byte 检测
  4. 二进制 → 返回 "Binary file (X.XXKB)"
  5. 文本 → toString("utf-8")
→ 返回 { content, isBinary, size, path }
```

### 3. 写入文件（POST /api/files/content）

```
POST /api/files/content { path, content }
→ 展开 ~ → $HOME
→ writeFileContent(expandedPath, content):
  1. Buffer.from(content) → 检查大小（> 1MB → 拒绝）
  2. writeFileSync(filePath, content, "utf-8")
→ 返回 { success, size, path }
```

### 4. 上传文件到临时目录（POST /api/files/upload-temp）

```
POST /api/files/upload-temp { filename, base64, mimeType }
→ 创建临时目录: /tmp/agent-os-screenshots/
→ 生成唯一文件名: {timestamp}-{safeName}.{ext}
→ Buffer.from(base64, "base64") → writeFileSync
→ 返回 { path: /tmp/agent-os-screenshots/{filename} }

客户端上传流程（lib/file-upload.ts）:
uploadFileToTemp(file)
→ file.arrayBuffer() → Uint8Array → btoa (base64 编码)
→ fetch("/api/files/upload-temp", { filename, base64, mimeType })
→ 返回临时文件路径
```

## 数据结构

### FileNode

| 字段      | 类型                  | 说明                       |
| --------- | --------------------- | -------------------------- |
| name      | string                | 文件/目录名                |
| path      | string                | 完整路径                   |
| type      | "file" \| "directory" | 类型                       |
| size      | number                | 文件大小（字节）           |
| extension | string                | 文件扩展名（无点）         |
| children  | FileNode[]            | 子节点（仅目录，递归模式） |

### 默认排除模式

```
node_modules, .git, .next, dist, build, out, coverage, .cache,
.vercel, .turbo, __pycache__, .pytest_cache, .mypy_cache,
.venv, venv, .DS_Store, *.log, .env, .env.local, .env.*.local,
*.db, *.db-wal, *.db-shm
```

## 排查路径

1. **目录为空** → 检查排除模式是否过度匹配 → 检查目录权限
2. **文件读取失败** → 检查路径展开（~ → $HOME）→ 检查文件大小限制（1MB）→ 检查编码
3. **文件保存失败** → 检查写入权限 → 检查内容大小限制（1MB）
4. **上传失败** → 检查 base64 编码 → 检查 `/tmp/agent-os-screenshots/` 目录权限
5. **二进制文件误判** → null byte 检测可能误判 UTF-16 等编码
6. **递归深度过大** → maxDepth 默认 3（非递归）/ 2（递归）→ 可能需要调整
