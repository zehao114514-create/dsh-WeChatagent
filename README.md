# dsh-wechat-agent-kit

> 给 [WeChatAgent](https://github.com/sourcepro5/WeChatAgent)（微信分身 → DSH 链路）做的**运维工具 + 修复补丁 + 使用文档**合集。
> 它不是 WeChatAgent 的分支，也不包含它的源码副本：本仓库只放**我们自己的东西**——补丁、CLI、脚本、踩坑记录。
> 上游作者已知悉并同意公开发布（2026-10-24）；补丁本身也准备回提 PR。

## 这是什么

WeChatAgent 让一个「分身微信」把群聊/私聊转给 DeepSeek Harness（DSH），由 DSH 里的模型决定回不回、回什么。装起来不难，**跑起来很磨人**：三个服务、四套令牌、模型路由写死在插件里、日志被正常断连刷屏、升级一次要重打补丁。

本仓库把这些磨人的部分收拢成三件事：

| 目录 | 内容 |
|---|---|
| `patches/` | 相对上游 v0.3.8 的补丁（目前 1 个：读取服务不再被客户端断连刷屏） |
| `tools/wca.mjs` | 一个 CLI 管全部日常操作：看状态、诊断、起停重启、读改配置、调限额 |
| `docs/` | 架构、安装、运维、排障、与上游的差异、怎么扩展 |

## 30 秒摸清链路

```
微信(分身) ──hook:30001──> bridge:8766 ──> DSH ──> 模型
                │              │              │
                │              └─状态/令牌: <安装目录>\data\workspace\state\
                └─ 读取服务 reader-api:5031（素材/图片/引用）
控制台: 端口见 data\desktop\runtime.json，请求头 X-Console-Token
DSH 插件: 127.0.0.1:11230，Bearer 见 state\social-dsh-token.txt
```

## 快速开始

> 第一次装，别从这节开始，从 **[QUICKSTART.md](QUICKSTART.md)** 走——那是一页从零到收到第一条回复的完整清单。
> 下面这三行是**已经装好之后**的日常操作。

```powershell
# 0) 先装上游（任选其一：官方安装包 / 源码副本），记下安装根目录
#    本工具用它定位 runtime.json 与 state\

# 1) 打补丁（会先备份；幂等，重复执行不会重复插入）
powershell -ExecutionPolicy Bypass -File tools\apply-patch.ps1 -Root "C:\Users\<你>\AppData\Local\Programs\WeChatAgent"

# 2) 看状态 + 诊断
node tools\wca.mjs status --root "C:\Users\<你>\AppData\Local\Programs\WeChatAgent"
node tools\wca.mjs diag   --root "..."

# 3) 重启（改完配置/补丁后必须重启才会生效）
node tools\wca.mjs restart --root "..."
```

不想给 `--root` 每次传参数？设环境变量 `WCA_ROOT` 即可：

```powershell
[Environment]::SetEnvironmentVariable('WCA_ROOT','C:\Users\<你>\AppData\Local\Programs\WeChatAgent','User')
```

## 它解决的具体问题

| 症状 | 原因 | 本仓库怎么处理 |
|---|---|---|
| `state\logs\reader.stderr.log` 被 `ConnectionResetError: [WinError 10054]` 的完整 traceback 刷屏，真错误被埋 | 读取服务用裸 `ThreadingHTTPServer`，客户端提前断开时异常冒到 `socketserver.handle_error` | `patches/0001`：只吞掉四类"客户端已断开"异常，其它异常照旧上报 |
| 改了模型不生效 | 插件的模型路由在 `packages\dsh-social-bridge-plugin\cordis.patch.yml`，`/health` 从这里读；只改 `config\wechatagent.json` 没用 | `docs\03-operations.md` 的「换模型」一节 + `wca.mjs config` |
| 重启后插件代码没更新 | DSH 进程还跑着旧代码 | `docs\03-operations.md` 的「三件套重启顺序」 |
| 分身上线后主微信报 `Another desktop WeChat is running` | 主微信与分身共存冲突 | `docs\04-troubleshooting.md` |
| 工具调用结束后常驻进程被杀 | 父进程结束带走子进程 | `docs\03-operations.md` 的 schtasks 方案 |

## 与上游的关系

- 上游：<https://github.com/sourcepro5/WeChatAgent>（MIT）。
- 本仓库的补丁基于 **v0.3.8** 的文件内容生成，已用 `git apply --check` 验证可干净应用。
- 上游升级后补丁可能不再干净，`docs\05-upstream-diff.md` 写了判断与重做方法。
- 本仓库不含上游源码、不含任何账号凭证、不含模型密钥。

## 许可

MIT。补丁与文档中的上游代码片段版权归上游作者（见 `LICENSE` 的署名段）。

## 免责

这是给你自己的机器、你自己的微信用的工具。自动回复涉及账号风控与隐私，请自行评估；仓库里所有示例都不含真实路径、手机号、token。
