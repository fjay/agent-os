# AgentOS 数据文档索引

本目录包含 AgentOS 数据模型的完整文档，由数据模型分析和数据行为分析合并去重生成。

## 文档结构

### Schema 与关系

| 文件                                 | 说明                                               |
| ------------------------------------ | -------------------------------------------------- |
| [schema.md](schema.md)               | 数据库整体 schema 描述：表总览、迁移记录、架构分层 |
| [relationships.md](relationships.md) | 实体关系图与文字描述：外键、级联、自引用           |

### 表文档

| 文件                                                             | 说明                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| [tables/sessions.md](tables/sessions.md)                         | `sessions` -- AI Agent 会话实例，系统核心表           |
| [tables/messages.md](tables/messages.md)                         | `messages` -- 会话消息（用户输入/助手回复）           |
| [tables/tool_calls.md](tables/tool_calls.md)                     | `tool_calls` -- 工具调用记录                          |
| [tables/projects.md](tables/projects.md)                         | `projects` -- 项目组织单元                            |
| [tables/dev_servers.md](tables/dev_servers.md)                   | `dev_servers` -- 运行中的开发服务器实例               |
| [tables/groups.md](tables/groups.md)                             | `groups` -- 旧版会话分组（已弃用）                    |
| [tables/project_dev_servers.md](tables/project_dev_servers.md)   | `project_dev_servers` -- 项目开发服务器配置模板       |
| [tables/project_repositories.md](tables/project_repositories.md) | `project_repositories` -- 项目 Git 仓库（多仓库支持） |

### 行为分析

| 文件                               | 说明                                                            |
| ---------------------------------- | --------------------------------------------------------------- |
| [transactions.md](transactions.md) | 事务使用分析：隐式事务、风险点、迁移事务                        |
| [consistency.md](consistency.md)   | 一致性规则：级联删除、手动级联、并发安全、幂等机制              |
| [cache.md](cache.md)               | 缓存策略：PreparedStatement、tmux 时间戳、React Query、乐观更新 |

## 约定

- 所有文档描述当前系统状态，结论绑定代码路径
- 项目名称统一使用 "AgentOS"
- 表名、字段名、文件路径使用等宽字体标记
- 风险点以 "风险" 标签明确标注并附代码路径
