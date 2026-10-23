# 03 · 运维

所有命令都接受 `--root <安装根>`；设了 `WCA_ROOT` 就可以省略。

## 看状态

```powershell
node tools\wca.mjs status
node tools\wca.mjs diag      # 三个服务 + 日志尾巴 + 补丁是否生效
```

## 起停

```powershell
node tools\wca.mjs start
node tools\wca.mjs stop
node tools\wca.mjs restart
```

原理：读 `runtime.json` → `GET /api/info` 拿 token → `GET /api/config` 拿 revision → `POST /api/jobs {action, revision}` → 轮询 `/api/job?id=`。**直接 kill 进程会留下脏状态**，能让它自己重启就让它自己重启。

## 三件套重启顺序（改代码/改配置之后）

事件不同，要重启的东西不同：

| 改了什么 | 重启顺序 |
|---|---|
| 业务配置（白名单、限额、模型名） | `wca.mjs restart` |
| 插件代码（`data\workspace\packages\dsh-social-bridge-plugin\`） | ① 杀掉 DSH 进程 ② `wca.mjs restart` ③ 让链路把 DSH 重新拉起来 |
| 读取服务（`reader-api.py`，比如打了本仓库补丁） | `wca.mjs restart` |

**DSH 是最容易被忘的一环**：它的进程命令行里带着 `WeChatAgent\data\dsh`，插件代码改了不杀它，跑的还是旧代码。

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*WeChatAgent\data\dsh*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 换模型

模型的有效点在**插件**，不是业务配置：

```
data\workspace\packages\dsh-social-bridge-plugin\cordis.patch.yml
```

`/health` 从这里读，所以「改了 `config\wechatagent.json` 的 dsh.model 却没变」是预期行为。改完按上表的三件套重启。

## 调限额

```powershell
node tools\wca.mjs limits --ctx 80000 --search 5,120,3 --social 20,60,800,3000
```

四个位置分别是：上下文 token 上限；搜索结果数/片段长/每轮次数；每分钟条数/每十分钟条数/批间隔/最小间隔。改完 `restart`。

## 让进程活得久一点

工具调用结束常常把子进程一起带走。要常驻（分身、hook、DSH），用计划任务而不是 `Start-Process`：

```powershell
schtasks /Create /TN wca_app  /TR "\"<安装根>\WeChatAgent.exe\"" /SC ONCE /ST 00:00 /F
schtasks /Run /TN wca_app
```

> 有些环境里 `schtasks` / `Get-CimInstance Win32_Process` 会被沙箱拦，报「访问被拒绝」。那时只能在管理员终端里手动执行，或者接受进程随会话结束。

## 备份什么

- `data\workspace\config\`（业务配置）
- `data\workspace\state\`（令牌；换机器会失效，但留着能对照）
- `data\workspace\packages\`（你改过的插件）

都不用备份 `data\workspace\state\logs\`。
