# QUICKSTART · 从零到第一次收到回复

> 这一页是**一条线走完**的清单：装上游 → 打补丁 → 连 DSH → 登录分身 → 挂白名单 → 收到第一条回复。
> 每一步都写了「做完怎么确认」，卡住就跳到右列那一节。

总时长约 30–60 分钟，其中大半在等 npm 和微信登录。

---

## 0. 先确认你要用哪种形态

| 你的情况 | 用哪个 | `--root` 指哪 |
|---|---|---|
| 只想用，不改代码 | 官方安装包 | `%LOCALAPPDATA%\Programs\WeChatAgent` |
| 想改代码、提 PR | 源码 clone | 仓库根目录 |

下面用 `$WCA` 代替这个路径，设一次省得每次敲：

```powershell
$WCA = "$env:LOCALAPPDATA\Programs\WeChatAgent"   # 安装包形态
[Environment]::SetEnvironmentVariable('WCA_ROOT', $WCA, 'User')
```

**确认**：`Test-Path "$WCA\data\desktop\runtime.json"` 或 `Test-Path "$WCA\package.json"` 至少一个为 True。

---

## 1. 装上游 + 首次启动

```powershell
# 安装包：从 Releases 下载，一路下一步，然后启动一次
# 源码：git clone https://github.com/sourcepro5/WeChatAgent && npm ci
```

第一次启动**必须让它自己跑完一次**——它要把 `data\workspace\` 派生出来。

**确认**：`$WCA\data\desktop\runtime.json` 出现，且里面有 `consolePort`。

---

## 2. 打补丁（可选，建议打）

```powershell
powershell -ExecutionPolicy Bypass -File tools\apply-patch.ps1 -Root $WCA
```

脚本会备份 → 判幂等 → 插类 → `py_compile` 自检。

**确认**：输出里同时有 `✓ py_compile 通过` 和 `✓ 补丁已应用`；第二次跑会显示 `✓ 已经打过补丁，跳过`。

> 打完**必须重启读取服务**才生效：`node tools\wca.mjs restart --root $WCA`

---

## 3. 让 DSH 能起来

WeChatAgent 自己不产模型，它把消息转给 DeepSeek Harness。所以：

1. DSH 桌面端能正常开、能对话；
2. DSH 里装了社交桥插件（`packages\dsh-social-bridge-plugin`），端口 `11230` 有响应。

**确认**：

```powershell
node tools\wca.mjs diag --root $WCA
# 看 "插件 11230" 那一行是不是 ok
```

---

## 4. 登录分身微信

- 分身跑着时，**主微信必须完全退出**（同一个 wxid 不能两边登）。
- 登录后回微信主界面，别关窗口。

**确认**：`diag` 里 hook 段 `30001 ... ok`，且 `$WCA\data\workspace\state\hook\native-token.txt` 存在。

---

## 5. 配模型（最容易白忙的一步）

模型路由**不在** `config\wechatagent.json`，而在：

```
$WCA\data\workspace\packages\dsh-social-bridge-plugin\cordis.patch.yml
```

`/health` 从这里读。改完要**按顺序重启三件套**（细节见 `docs\03-operations.md`）：

```powershell
node tools\wca.mjs restart --root $WCA
# 若改的是插件代码：先彻底退出 DSH 进程，再起 DSH，最后 restart 链路
```

**确认**：`diag` 输出里 `provider=... model=...` 就是你要的那个。

---

## 6. 挂白名单（不挂就只有你自己能收到）

在 `data\workspace\config\wechatagent.json`（或控制台里）把要放行的群/联系人加进去，否则消息进来会被限流层直接丢掉。

**确认**：给群里发一句，`diag` 的 stats 里 `received` 加 1。

---

## 7. 第一次端到端

在**白名单里**的群或私聊里发一句「在吗」。

期望链路：微信 → hook:30001 → bridge:8766 → DSH 插件:11230 → 模型 → 原路回。

**确认三件事**：

1. 群里真的回了；
2. `$WCA\data\workspace\state\logs\bridge.stdout.log` 尾部有这轮的请求记录；
3. `reader.stderr.log` **没有**新增 `ConnectionResetError`（打了补丁的话）。

---

## 8. 想让它常驻

工具调用结束会把子进程带走，要常驻就用计划任务：

```powershell
schtasks /Create /TN wca_app  /TR "\"$WCA\WeChatAgent.exe\"" /SC ONCE /F
schtasks /Run /TN wca_app
```

---

## 卡住了先跑这个

```powershell
node tools\wca.mjs diag --root $WCA
```

它会一次性打印：三个服务端口、stats、DSH 的 provider/model、hook 健康、插件健康、`bridge.stdout.log` 尾 16 行、**`reader.stderr.log` 里的 traceback 计数**。按输出的 `!` 行往下查 `docs\04-troubleshooting.md`。
