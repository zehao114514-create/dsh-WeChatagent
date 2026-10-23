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
3. **插件**：`plugin ok=false`，或者模型一直输出 `SILENT`。
4. **模型**：额度耗尽、超时。看 `bridge.stdout.log`。

---

## 装了新版，插件行为没变

**判**：`npm test` 绿，但线上仍旧。

**原因**：`data\workspace\packages\` 是**派生副本**，升级后可能要重新部署；而且 DSH 进程还在跑旧代码。

**动**：比对 `app\resources\project\packages\...` 与 `data\workspace\packages\...` 的哈希；不一致就重新部署副本，然后三件套重启。

---

## `npm test` 中途断掉 / 自检恒红（Windows）

上游 issue #32/#33 就是这两个，v2.6 之前的版本在 Windows 上会中断。升级到修复版即可；如果必须留在旧版，跳过依赖 `node --test` 的并发用例，改用串行执行。
