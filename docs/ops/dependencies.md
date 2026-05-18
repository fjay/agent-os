# AgentOS 外部依赖清单

> 最后更新：2026-05-18

---

## 一、生产依赖 (dependencies)

| 包名                             | 版本          | 用途                                           |
| -------------------------------- | ------------- | ---------------------------------------------- |
| `next`                           | ^16.1.1       | Next.js 框架，SSR/SSG 页面渲染                 |
| `react`                          | ^19.2.1       | React 核心库                                   |
| `react-dom`                      | ^19.2.1       | React DOM 渲染                                 |
| `@xterm/xterm`                   | ^6.0.0        | xterm.js 终端模拟器核心                        |
| `@xterm/addon-canvas`            | ^0.7.0        | xterm Canvas 渲染插件                          |
| `@xterm/addon-fit`               | ^0.11.0       | xterm 自适应尺寸插件                           |
| `@xterm/addon-search`            | ^0.16.0       | xterm 搜索功能插件                             |
| `@xterm/addon-web-links`         | ^0.12.0       | xterm 网页链接识别插件                         |
| `@codemirror/lang-css`           | ^6.3.1        | CodeMirror CSS 语法高亮                        |
| `@codemirror/lang-html`          | ^6.4.11       | CodeMirror HTML 语法高亮                       |
| `@codemirror/lang-javascript`    | ^6.2.4        | CodeMirror JavaScript 语法高亮                 |
| `@codemirror/lang-json`          | ^6.0.2        | CodeMirror JSON 语法高亮                       |
| `@codemirror/lang-markdown`      | ^6.5.0        | CodeMirror Markdown 语法高亮                   |
| `@codemirror/lang-python`        | ^6.2.1        | CodeMirror Python 语法高亮                     |
| `@codemirror/language`           | ^6.12.3       | CodeMirror 语言基础设施                        |
| `@codemirror/state`              | ^6.6.0        | CodeMirror 状态管理                            |
| `@codemirror/view`               | ^6.41.0       | CodeMirror 视图层                              |
| `@lezer/highlight`               | ^1.2.3        | Lezer 语法高亮引擎                             |
| `@uiw/react-codemirror`          | ^4.25.4       | CodeMirror React 封装组件                      |
| `@monaco-editor/react`           | ^4.7.0        | Monaco Editor React 封装（VS Code 编辑器内核） |
| `monaco-editor`                  | ^0.55.1       | Monaco Editor 核心                             |
| `@radix-ui/react-context-menu`   | ^2.2.16       | 右键上下文菜单组件                             |
| `@radix-ui/react-dialog`         | ^1.1.15       | 对话框组件                                     |
| `@radix-ui/react-dropdown-menu`  | ^2.1.16       | 下拉菜单组件                                   |
| `@radix-ui/react-scroll-area`    | ^1.2.10       | 自定义滚动区域组件                             |
| `@radix-ui/react-select`         | ^2.2.6        | 选择器组件                                     |
| `@radix-ui/react-slot`           | ^1.2.4        | Slot 组件（组合模式）                          |
| `@radix-ui/react-switch`         | ^2.2.6        | 开关组件                                       |
| `@radix-ui/react-tooltip`        | ^1.2.8        | 提示框组件                                     |
| `@tanstack/react-query`          | ^5.90.16      | 服务端状态管理/数据请求缓存                    |
| `@tanstack/react-query-devtools` | ^5.91.2       | React Query 开发者工具                         |
| `@modelcontextprotocol/sdk`      | ^1.25.2       | MCP（模型上下文协议）SDK                       |
| `@serwist/turbopack`             | ^9.5.7        | Serwist PWA 插件（Turbopack 版）               |
| `@tailwindcss/typography`        | ^0.5.19       | Tailwind 排版插件                              |
| `better-sqlite3`                 | ^11.10.0      | SQLite3 嵌入式数据库驱动                       |
| `class-variance-authority`       | ^0.7.1        | CSS 变体工具（组件样式变体）                   |
| `clsx`                           | ^2.1.1        | CSS 类名拼接工具                               |
| `esbuild`                        | ^0.28.0       | JavaScript 打包/构建工具                       |
| `highlight.js`                   | ^11.11.1      | 代码语法高亮库                                 |
| `lucide-react`                   | ^0.556.0      | Lucide 图标库 React 版                         |
| `next-themes`                    | ^0.4.6        | Next.js 主题切换（暗色/亮色）                  |
| `node-pty`                       | ^1.2.0-beta.6 | Node.js 伪终端（PTY）绑定                      |
| `react-markdown`                 | ^10.1.0       | Markdown 渲染组件                              |
| `react-resizable-panels`         | ^4.3.0        | 可调整大小的面板组件                           |
| `react-syntax-highlighter`       | ^16.1.0       | React 代码语法高亮组件                         |
| `remark-gfm`                     | ^4.0.1        | GitHub Flavored Markdown 解析插件              |
| `serwist`                        | ^9.5.7        | Service Worker / PWA 框架                      |
| `sonner`                         | ^2.0.7        | Toast 通知组件                                 |
| `tailwind-merge`                 | ^3.4.0        | Tailwind CSS 类名合并去重                      |
| `valtio`                         | ^2.3.0        | 响应式状态管理库                               |
| `ws`                             | ^8.19.0       | WebSocket 服务端/客户端库                      |

---

## 二、开发依赖 (devDependencies)

| 包名                          | 版本      | 用途                              |
| ----------------------------- | --------- | --------------------------------- |
| `@tailwindcss/postcss`        | ^4.1.18   | Tailwind CSS PostCSS 插件         |
| `@tauri-apps/api`             | ^2.9.1    | Tauri 桌面端 API 客户端           |
| `@tauri-apps/cli`             | ^2.9.6    | Tauri CLI 构建工具                |
| `@types/better-sqlite3`       | ^7.6.13   | better-sqlite3 类型定义           |
| `@types/node`                 | ^20.19.27 | Node.js 类型定义                  |
| `@types/react`                | ^19.2.7   | React 类型定义                    |
| `@types/react-dom`            | ^19.2.3   | ReactDOM 类型定义                 |
| `@types/ws`                   | ^8.18.1   | ws 类型定义                       |
| `eslint`                      | ^9.39.2   | JavaScript/TypeScript 代码检查    |
| `eslint-config-next`          | ^16.0.8   | Next.js ESLint 配置预设           |
| `husky`                       | ^9.1.7    | Git hooks 管理工具                |
| `prettier`                    | ^3.7.4    | 代码格式化工具                    |
| `prettier-plugin-tailwindcss` | ^0.7.2    | Prettier Tailwind 类名排序插件    |
| `tailwindcss`                 | ^4.1.18   | Tailwind CSS 框架                 |
| `tsx`                         | ^4.21.0   | TypeScript 执行器（替代 ts-node） |
| `tw-animate-css`              | ^1.4.0    | Tailwind CSS 动画扩展             |
| `typescript`                  | ^5.9.3    | TypeScript 编译器                 |

---

## 三、Rust 依赖 (src-tauri/Cargo.toml)

| 包名                 | 版本                 | 用途                               |
| -------------------- | -------------------- | ---------------------------------- |
| `tauri`              | 2                    | Tauri 桌面端框架核心               |
| `tauri-build`        | 2                    | Tauri 构建工具（build-dependency） |
| `tauri-plugin-shell` | 2                    | Tauri Shell 插件（打开外部链接等） |
| `serde`              | 1 (features: derive) | Rust 序列化/反序列化框架           |
| `serde_json`         | 1                    | JSON 序列化库                      |

---

## 四、系统级依赖

| 依赖         | 最低版本     | 用途            | 检查位置                       |
| ------------ | ------------ | --------------- | ------------------------------ |
| Node.js      | >= 20        | 运行时环境      | `scripts/lib/prerequisites.sh` |
| git          | 任意         | 代码管理        | `scripts/lib/prerequisites.sh` |
| tmux         | 任意         | 终端会话管理    | `scripts/lib/prerequisites.sh` |
| ripgrep (rg) | 任意         | 代码搜索        | `scripts/lib/prerequisites.sh` |
| jq           | 任意（可选） | session ID 解析 | `scripts/setup.sh`             |
