# Agent Notes

## 发布流程

1. 在仓库根目录运行构建：

   ```bash
   npm run build
   ```

2. 构建成功后重启系统级 systemd 服务：

   ```bash
   systemctl restart agent-os.service
   ```

3. 验证服务状态和 HTTP 响应：

   ```bash
   systemctl status agent-os.service --no-pager -l
   curl -I --max-time 5 http://localhost:3011/
   ```

服务单元位于 `/etc/systemd/system/agent-os.service`，工作目录应指向 `/root/code/agent-os`。
