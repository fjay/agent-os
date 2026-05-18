# 实体关系

## 关系总览

AgentOS 的数据模型以 `sessions` 为核心，`projects` 为组织容器，通过外键和级联删除维护数据完整性。

## ASCII 关系图

```
projects (1)
  ├── sessions (N)             [project_id -> projects.id]
  ├── dev_servers (N)          [project_id -> projects.id, ON DELETE CASCADE]
  ├── project_dev_servers (N)  [project_id -> projects.id, ON DELETE CASCADE]
  └── project_repositories (N) [project_id -> projects.id, ON DELETE CASCADE]

sessions (1)
  ├── sessions (N)             [parent_session_id -> sessions.id]     -- fork 树
  ├── sessions (N)             [conductor_session_id -> sessions.id]  -- conductor/worker 编排
  ├── messages (N)             [session_id -> sessions.id, ON DELETE CASCADE]
  └── tool_calls (N)           [session_id -> sessions.id, ON DELETE CASCADE]

messages (1)
  └── tool_calls (N)           [message_id -> messages.id, ON DELETE CASCADE]

groups (1)  [已弃用]
  └── sessions (N)             [group_path -> groups.path, 旧版关联]
```

## 关系详细说明

### projects -> sessions

- **外键**: `sessions.project_id` -> `projects.id`
- **级联**: 无 CASCADE，删除 project 时需手动迁移 sessions 到 `uncategorized`
- **代码路径**: `lib/projects.ts:279-282`（手动迁移逻辑）
- **默认值**: 新 session 默认关联 `uncategorized` 项目

### projects -> dev_servers

- **外键**: `dev_servers.project_id` -> `projects.id`
- **级联**: ON DELETE CASCADE，删除 project 时自动清理关联的开发服务器实例
- **索引**: `idx_dev_servers_project`

### projects -> project_dev_servers

- **外键**: `project_dev_servers.project_id` -> `projects.id`
- **级联**: ON DELETE CASCADE，删除 project 时自动清理配置模板
- **索引**: `idx_project_dev_servers_project`

### projects -> project_repositories

- **外键**: `project_repositories.project_id` -> `projects.id`
- **级联**: ON DELETE CASCADE，删除 project 时自动清理仓库记录
- **索引**: `idx_project_repositories_project`

### sessions -> sessions（自引用：fork）

- **外键**: `sessions.parent_session_id` -> `sessions.id`
- **级联**: 无 CASCADE，删除父 session 不会级联删除子 session
- **索引**: `idx_sessions_parent`
- **说明**: 支持 fork 操作，子会话继承父会话的消息历史

### sessions -> sessions（自引用：编排）

- **外键**: `sessions.conductor_session_id` -> `sessions.id`
- **级联**: 无 CASCADE，删除 conductor 需手动处理 workers
- **索引**: `idx_sessions_conductor`
- **说明**: conductor/worker 编排模式，一个 conductor 可管理多个 worker session

### sessions -> messages

- **外键**: `messages.session_id` -> `sessions.id`
- **级联**: ON DELETE CASCADE，删除 session 自动清理消息
- **索引**: `idx_messages_session`

### sessions -> tool_calls

- **外键**: `tool_calls.session_id` -> `sessions.id`
- **级联**: ON DELETE CASCADE，删除 session 自动清理工具调用
- **索引**: `idx_tool_calls_session`
- **说明**: 此为冗余外键，主要用于加速按 session 查询工具调用

### messages -> tool_calls

- **外键**: `tool_calls.message_id` -> `messages.id`
- **级联**: ON DELETE CASCADE，删除 message 自动清理关联工具调用
- **索引**: `idx_tool_calls_message`

### groups -> sessions（已弃用）

- **外键**: `sessions.group_path` -> `groups.path`
- **级联**: 无 CASCADE
- **索引**: `idx_sessions_group`
- **说明**: 旧版分组系统，已被 `projects` 替代，保留兼容

## CASCADE 行为汇总

| 操作         | 自动清理的关联数据                                     | 需手动处理的数据                     |
| ------------ | ------------------------------------------------------ | ------------------------------------ |
| 删除 project | dev_servers、project_dev_servers、project_repositories | sessions（需迁移到 uncategorized）   |
| 删除 session | messages、tool_calls                                   | 子 sessions（fork）、worker sessions |
| 删除 message | 关联的 tool_calls                                      | --                                   |

## 外键约束注意

- SQLite 默认不启用外键强制检查（`PRAGMA foreign_keys`），AgentOS 未显式启用此 pragma
- CASCADE 行为依赖外键定义中的 `ON DELETE CASCADE` 声明，在 foreign_keys 未启用时实际不生效
- 实际清理逻辑主要依赖应用层代码手动执行 DELETE
