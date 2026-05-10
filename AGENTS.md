# Agent Notes

## 发布流程

### 新机器安装

使用内置安装脚本安装 AgentOS：

```bash
curl -fsSL https://raw.githubusercontent.com/saadnvd1/agent-os/main/scripts/install.sh | bash
```

安装完成后，脚本会把仓库放到 `~/.agent-os/repo`，并把 `agent-os` 命令链接到 `~/.local/bin/agent-os`。

如果当前 shell 还找不到 `agent-os`，先重新加载 shell 配置或手动补 PATH：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 启用 user systemd 服务

Linux 上使用内置命令安装 user systemd service：

```bash
agent-os enable
```

如果是在当前 clone 仓库内操作，也可以直接运行：

```bash
./scripts/agent-os enable
```

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

更新 AgentOS：

```bash
agent-os update
```

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
