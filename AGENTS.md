# Agent Notes

## 发布流程

### 新机器安装（从源码）

先把仓库克隆到本地并安装依赖、构建，整个过程只用到仓库自身的脚本，不联网拉远程安装脚本：

```bash
git clone https://github.com/saadnvd1/agent-os.git
cd agent-os
npm install --legacy-peer-deps
npm run build
```

之后所有命令都用仓库里的 `./scripts/agent-os <command>` 调用。

如果想让 `agent-os` 命令在任意目录可用，把它软链到 `~/.local/bin`：

```bash
mkdir -p ~/.local/bin
ln -sf "$PWD/scripts/agent-os" ~/.local/bin/agent-os
export PATH="$HOME/.local/bin:$PATH"
```

> 不软链也没关系，下文统一用 `./scripts/agent-os` 形式；已软链时 `agent-os <command>` 等价。

### 启用 user systemd 服务

Linux 上在仓库内直接用源码脚本安装 user systemd service（前置条件：仓库已 `npm install` 且 `npm run build` 完成，因为 service 会通过 `tsx server.ts` 启动）：

```bash
./scripts/agent-os enable
```

> 若已把 `agent-os` 软链到 `~/.local/bin`，`agent-os enable` 等价。

这会创建：

```text
~/.config/systemd/user/agent-os.service
```

service 会自动写入当前解析到的安装目录、端口和 `AGENT_OS_HOME`，不要手写固定路径。

启用后启动服务：

```bash
systemctl --user start agent-os
```

查看服务状态：

```bash
systemctl --user status agent-os --no-pager -l
```

验证 HTTP 响应：

```bash
curl -I --max-time 5 http://localhost:3011/
```

查看 AgentOS 日志：

```bash
agent-os logs
```

常用服务命令：

```bash
systemctl --user restart agent-os
systemctl --user stop agent-os
systemctl --user disable agent-os
```

如果机器需要在用户未登录时也运行 user service，启用 linger：

```bash
loginctl enable-linger "$USER"
```

更新 AgentOS（直接在当前 clone 里拉新代码、重装依赖、重建并重启）：

```bash
git pull --ff-only
npm install --legacy-peer-deps
npm run build
systemctl --user restart agent-os
```

> `agent-os update` 内部等价于这几步（对当前 clone 执行 `git pull` + 重装 + 重建），手动执行更可控；本机直接用上面的流程即可。

### 当前机器发布

1. 在仓库根目录运行构建：

   ```bash
   npm run build
   ```

2. 构建成功后重启 user systemd 服务：

   ```bash
   XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus systemctl --user restart agent-os
   ```

3. 验证服务状态和 HTTP 响应：

   ```bash
   XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus systemctl --user status agent-os --no-pager -l
   curl -I --max-time 5 http://localhost:3011/
   ```
