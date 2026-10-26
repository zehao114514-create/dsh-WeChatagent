# 04 · 排障手册

按「症状 → 怎么判 → 怎么动」写。每条都是在本机真实遇到过的。

---

## 日志被 `ConnectionResetError: [WinError 10054]` 刷屏

**判**：`state\logs\reader.stderr.log` 里满屏 traceback，栈是 `socketserver.py:697 → http/server.py:453`。

**原因**：这是**正常流量**——健康检查、控制台轮询、关掉的面板都会让客户端提前断开。裸 `ThreadingHTTPServer` 会把它当异常打进 stderr，把真错误埋掉。

**动**：打补丁 `patches/0001-reader-api-quiet-disconnects.patch`，然后重启读取服务。

```powershell
powershell -ExecutionPolicy Bypass -File tools\apply-patch.ps1 -Root "<安装根>"
node tools\wca.mjs restart
```

验证：`node tools\wca.mjs diag` 里 `reader stderr ... ConnectionResetError x0`。

---

## hook 返回 401 / `HOOK_LOGIN_REQUIRED`

**判**：`GET http://127.0.0.1:30001/WeChatAgent/health` 带 `Authorization: Bearer <native-token>` 不是 200。

**动**：
1. 确认 token 文件在：`data\workspace\state\hook\native-token.txt`。
2. 令牌对不上时，重启链路让它重新签发（`wca.mjs restart`）。
3. 还不行就看 `state\logs\bridge.stdout.log` 的最后几十行，通常会写着 `HOOK_LOGIN_REQUIRED` 的真实原因（多数是分身没登录）。

---

## `READER_SETUP_TIMEOUT`

**判**：插件报读取服务没准备好。

**动**：先单独把读取服务拉起来看它自己报什么：

```powershell
py "<安装根>\data\workspace\scripts\reader-api.py" --port 5031
```

端口被占（EADDRINUSE）最常见；其次是依赖没装（Pillow 之类）。

---

## 分身微信掉登录

**判**：`/WeChatAgent/health` 的 `startupState` 不是已登录态，或日志里出现登录流程重建。

**动**：
- 主微信必须**完全退出**（不是最小化），否则两个微信抢同一个窗口类。
- 用 UIA 点按钮，别 `SendKeys`；点之前先置顶窗口。
- 掉登录是分身方案的老毛病，准备一份「重新登录」的操作记录，掉一次按记录走一遍。

---

## 改了模型，`/health` 还是旧模型

**判**：`wca.mjs status` 显示 provider/model 没变。

**原因**：模型路由在插件里的 `cordis.patch.yml`，`/health` 从那读；业务配置里的 `dsh.model` 不是生效点。

**动**：改 `data\workspace\packages\dsh-social-bridge-plugin\cordis.patch.yml` → 杀 DSH → `wca.mjs restart`。

---

## 机器人完全不说话

按「越靠前越可能」的顺序查：

1. **白名单**：这个群/这个人不在名单里，bridge 直接丢。
2. **限流**：`social` 的每分钟/每十分钟额度用完了。看 `wca.mjs limits` 当前值。
3. **某条分支自己 `return` 了**：最典型是点歌——命中后调后台脚本然后直接 `return`，一个字都不回（见 `docs/08-song-request-ack-reference.md`）。查 `bridge.stdout.log` 有没有该条目的日志、`social-messages.json` 里它有没有入库；**没入库 = 被吃掉了，不是模型不说话**。
4. **插件**：`plugin ok=false`，或者模型一直输出 `SILENT`。
5. **模型**：额度耗尽、超时。看 `bridge.stdout.log`。

> 判定口诀：先看 `/api/status` 的 `ready`（链路），再看这条消息**有没有入库**（bridge），最后才怀疑模型。

---

## 语音/文件发出去了，群里没气泡（exit=0 ≠ 送达）

**判**：发送脚本返回 0，但目标会话里没有新的语音气泡。

**原因**：这类"原生语音"是靠**虚拟声卡 + 按住说话热键**模拟录音发出的，`exit=0` 只代表按键按下并松开了，微信到底有没有发出去它不知道。常见两个坑：

1. 录制期间前台窗口被切走（用户切去别的软件），按键落到别的窗口 → 什么都没发。
2. 前台窗口标题是「微信」，但**键盘焦点不在输入框**（会话刚切换、焦点在列表上）→ 热键落空。

**动**：
- 发送前把窗口顶到前台**并点一下输入框**（本项目本地脚本加了 `-ClickInput`，默认开）。
- 发送后用读取服务回读确认，别信 exit code：
  `GET /api/v1/messages?talker=<wxid>&limit=30` → 找 `isSend=1 && localType=34 && createTime >= 发送前时间戳`。
  会话 wxid 从 `/api/v1/sessions` 的 `conversationId` / `displayName` 反查。
- 只有「会话能解析、但确实没有新语音」才重发；解析不出会话就记一笔**未验证**，绝不盲目重发（会重复发出去）。

---

## 装了新版，插件行为没变

**判**：`npm test` 绿，但线上仍旧。

**原因**：`data\workspace\packages\` 是**派生副本**，升级后可能要重新部署；而且 DSH 进程还在跑旧代码。

**动**：比对 `app\resources\project\packages\...` 与 `data\workspace\packages\...` 的哈希；不一致就重新部署副本，然后三件套重启。

---

## `npm test` 中途断掉 / 自检恒红（Windows）

上游 issue #32/#33 就是这两个，v2.6 之前的版本在 Windows 上会中断。升级到修复版即可；如果必须留在旧版，跳过依赖 `node --test` 的并发用例，改用串行执行。
