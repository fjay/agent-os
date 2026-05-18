# 缓存策略

## 概述

AgentOS 的缓存分为服务端和客户端两层。服务端使用 PreparedStatement 缓存和 tmux 活动时间戳缓存，客户端使用 TanStack React Query 进行数据缓存和乐观更新。未使用 LRU 缓存、Redis 或其他外部缓存系统。

## 服务端缓存

### PreparedStatement 缓存

- **路径**: `lib/db/queries.ts:4-14`
- **机制**: `Map<string, Database.Statement>` -- 以 SQL 字符串为 key 缓存 prepared statement
- **生命周期**: 进程级单例（模块顶层变量），永不失效
- **效果**: 避免 repeat parse/compile 开销

```typescript
const stmtCache = new Map<string, Database.Statement>();
function prepare(sql: string): Database.Statement {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}
```

### tmux 活动时间戳缓存

- **路径**: `lib/status-detector.ts:161, 195`
- **机制**: `SessionCache` -- `Map<string, number>` (session_name -> activity_timestamp) + updatedAt
- **缓存有效期**: 2000ms（`CONFIG.CACHE_VALIDITY_MS`）
- **刷新策略**: 过期后重新执行 `tmux list-sessions` 命令
- **用途**: 减少 tmux 命令调用频率，避免频繁的系统进程调用

### 会话状态追踪缓存

- **路径**: `lib/status-detector.ts:194`
- **机制**: `Map<string, StateTracker>` -- 按 session 存储状态追踪器
- **生命周期**: 进程级，定期 cleanup（删除 dead session 的 tracker）
- **用途**: 追踪 tmux 终端内容变化，用于 spike detection 判断会话活跃度

### Provider 注册表缓存

- **路径**: `lib/providers/registry.ts:179`
- **机制**: `Map<ProviderId, ProviderDefinition>` -- 静态 Provider 定义
- **生命周期**: 进程级，静态数据，永不变化
- **用途**: Agent 类型到 Provider 定义的映射

## 客户端缓存

### TanStack React Query 全局配置

- **路径**: `lib/query-client.ts`
- **配置**:

| 参数                 | 值       | 说明                   |
| -------------------- | -------- | ---------------------- |
| staleTime            | 10000ms  | 全局数据过期时间 10 秒 |
| gcTime               | 300000ms | GC 时间 5 分钟         |
| refetchOnWindowFocus | false    | 窗口获焦不自动刷新     |
| retry                | 2        | 失败重试次数           |

### 各模块缓存配置

| 模块             | staleTime | refetchInterval                 | 说明                         |
| ---------------- | --------- | ------------------------------- | ---------------------------- |
| sessions list    | 5000ms    | 10000ms                         | 会话列表 5 秒过期，10 秒轮询 |
| session statuses | 2000ms    | 5000ms（活跃）/ 30000ms（空闲） | 状态 2 秒过期，动态轮询间隔  |
| projects list    | 30000ms   | --                              | 项目列表 30 秒过期，无轮询   |

### 客户端 Session 注册表

- **路径**: `lib/client/session-registry.ts`
- **机制**: 内存 `Map<string, SessionEntry>`，保存终端滚动位置等临时状态
- **用途**: 跨导航保持终端状态
- **生命周期**: 页面级（刷新后丢失）

### 待发送 Prompt 缓存

- **路径**: `stores/initialPrompt.ts`
- **机制**: 内存 `Map<string, string>`，按 sessionId 存储
- **用途**: 终端就绪后发送初始 prompt
- **生命周期**: 页面级

## 乐观更新

AgentOS 在部分 mutation 中使用乐观更新模式（onMutate 立即更新 query cache，onError 回滚）：

### 已实现的乐观更新

| 操作          | 路径                                            | 策略                              |
| ------------- | ----------------------------------------------- | --------------------------------- |
| 会话重命名    | `data/sessions/queries.ts` `useRenameSession()` | onMutate 更新 cache，onError 回滚 |
| 项目展开/折叠 | `data/projects/queries.ts` `useToggleProject()` | onMutate 更新 cache，onError 回滚 |

### 未实现乐观更新的操作

其他 mutation（删除、创建、移动）均使用 `onSuccess` 后 `invalidateQueries`，不做乐观更新。这意味着：

- 创建/删除操作需要等待服务端响应后才能看到 UI 变化
- 网络延迟可能导致用户感知的响应滞后

## 缺失的缓存机制

| 缺失内容       | 说明                                                       |
| -------------- | ---------------------------------------------------------- |
| LRU 缓存       | 未使用 LRU 或其他淘汰策略缓存                              |
| 外部缓存       | 无 Redis 或类似外部缓存层                                  |
| 服务端应用缓存 | 无 API 响应缓存（如 sessions 列表查询无缓存，每次都查 DB） |
| 分布式缓存     | 无跨进程/跨实例的缓存共享机制                              |
