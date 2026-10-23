# 02 · 安装

前提：Windows 10/11，一台你**自己**的机器、**自己**的微信（推荐分身/小号），Node ≥ 18，Python 3.10+（读取服务与素材脚本要用）。

## 两种安装形态，先认清楚

| 形态 | 长什么样 | 适合 |
|---|---|---|
| 安装包 | `%LOCALAPPDATA%\Programs\WeChatAgent`，有 `app\`、`data\`、卸载器 | 日常使用 |
| 源码副本 | 直接 clone 上游仓库，能 `npm test` | 改代码、提 PR |

本仓库的 `--root` 指的是**安装包形态**的那个根目录（含 `data\desktop\runtime.json`）。

## 步骤

1. **装上游**（二选一）
   - Releases 里的安装包：一路下一步。
   - 源码：`git clone https://github.com/sourcepro5/WeChatAgent` + `npm ci` + 按上游 README 构建。

2. **首次启动**，打开客户端，让它把 `data\workspace` 派生出来。
   - 看到控制台起来、`data\desktop\runtime.json` 出现，这一步就过了。

3. **打本仓库的补丁**（可选但建议）：

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\apply-patch.ps1 -Root "C:\Users\<你>\AppData\Local\Programs\WeChatAgent"
   ```

   脚本会：备份原文件 → 检查是否已打过（幂等）→ 打补丁 → `py_compile` 自检。**打完必须重启读取服务。**

4. **配置 DeepSeek / DSH**
   - DSH 要能起来，模型要有额度。
   - 模型路由在 `data\workspace\packages\dsh-social-bridge-plugin\cordis.patch.yml`，`docs\03-operations.md` 有改法。

5. **登录分身微信**
   - 分身跑着时，**主微信必须完全退出**，否则报 `Another desktop WeChat is running`。
   - Qt 界面上的按钮别用 `SendKeys` 硬敲，用 UIA 的 `InvokePattern`；点之前先 `SetWindowPos(HWND_TOPMOST)` + `SetForegroundWindow`。

6. **自检**

   ```powershell
   node tools\wca.mjs diag --root "..."
   ```

   三个服务都 `ready`、reader 的 stderr 里没有 `ConnectionResetError`，就是好了。

## 常见第一次就卡住的地方

| 现象 | 处理 |
|---|---|
| 控制台连不上 | 客户端没开，或 `runtime.json` 里端口变了；用 `wca.mjs status` 会明确告诉你连的哪个端口 |
| hook 401 | `state\hook\native-token.txt` 与插件侧不一致（通常发生在换了安装目录之后） |
| 插件 401 | 同上，看 `state\social-dsh-token.txt` |
| 分身登录掉 | 见 `docs\04-troubleshooting.md`「掉登录」 |
