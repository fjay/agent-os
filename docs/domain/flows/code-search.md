# 代码搜索

## 概述

集成 ripgrep（rg）提供代码全文搜索能力。用户在 Web UI 中输入搜索词，服务端在工作目录中执行 ripgrep 搜索，返回匹配结果（文件路径、行号、匹配文本、上下文）。搜索为无状态操作，直接调用 ripgrep CLI。

## 核心代码路径

### API 路由

- `app/api/code-search/route.ts` — 搜索入口，参数解析，调用 lib
- `app/api/code-search/available/route.ts` — ripgrep 可用性检查

### 核心库

- `lib/code-search.ts` — ripgrep 封装，搜索逻辑，结果格式化

### 数据层

- `data/code-search/queries.ts` — React Query hook
- `data/code-search/keys.ts` — Query key 定义

## 主流程

### 搜索流程（GET /api/code-search）

```
前端请求 { query, path, maxResults=100, contextLines=2 }
→ 展开路径（~ → $HOME）
→ searchCode(expandedPath, query, options):
    1. spawnSync("rg", ["--json", "--max-count", "--context=N", "--ignore-case", query, "."])
       - cwd = expandedPath
       - timeout = 10 秒
       - maxBuffer = 5MB
    2. 解析 stdout → 逐行 JSON.parse
    3. 过滤 type === "match" 的行
    4. 截断到 maxResults
→ formatSearchResults(matches):
    - file: path.text
    - line: line_number
    - column: submatches[0].start
    - matchText: submatches[0].match.text
    - lineText: lines.text
→ 返回 { results, query, path, count }
```

### 可用性检查（GET /api/code-search/available）

```
→ isRipgrepAvailable()
→ execSync("which rg") → true / false
→ 返回 { available: boolean }
```

## 数据结构

### 搜索选项（SearchOptions）

| 字段          | 类型    | 默认值 | 说明           |
| ------------- | ------- | ------ | -------------- |
| maxResults    | number  | 100    | 最大结果数     |
| contextLines  | number  | 2      | 上下文行数     |
| filePattern   | string  | "\*"   | 文件模式过滤   |
| caseSensitive | boolean | false  | 是否区分大小写 |

### 搜索结果（FormattedMatch）

| 字段      | 类型   | 说明     |
| --------- | ------ | -------- |
| file      | string | 文件路径 |
| line      | number | 行号     |
| column    | number | 列号     |
| matchText | string | 匹配文本 |
| lineText  | string | 整行内容 |

## 排查路径

1. **搜索无结果** → 检查 `which rg` → 检查工作目录路径展开 → 检查查询参数编码
2. **搜索超时** → 检查目录大小 → 调整 timeout（当前 10s）→ 考虑 `--max-depth` 限制
3. **结果不完整** → 检查 `--max-count` 参数（当前 `maxResults/10`）→ ripgrep 的 `--max-count` 限制每个文件而非总数
4. **内存溢出** → 检查 maxBuffer（当前 5MB）→ 大型代码库可能需要增加
5. **权限错误** → 检查目录读权限 → 检查 .gitignore / .rgignore 配置
