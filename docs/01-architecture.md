# 01 · 架构：一条消息要经过哪几段

```
微信客户端（分身）
   │  写进本机数据库；原生 hook 监听
   ▼
hook:30001            WeChatAgent 的原生层，读数据库、抓消息、注入发送
   │  HTTP（Bearer = data\workspace\state\hook\native-token.txt）
   ▼
bridge:8766           桥接层：过滤、限流、拼上下文、调 DSH、发回去
   │                        │
   │                        ├─ reader-api:5031   读取服务：图片/引用/素材
   │                        └─ 状态、日志：data\workspace\state\
   ▼
DSH 插件:11230        dsh-social-bridge-plugin：把 bridge 的请求变成一次 DSH 会话
   │  Bearer = data\workspace\state\social-dsh-token.txt
   ▼
DSH → 模型            真正的「思考」发生在这里，人格与规则也在这一层
```

控制台（桌面客户端的 UI 背后）端口不固定，写在 `data\desktop\runtime.json` 的 `port` 字段；所有控制台请求要带 `X-Console-Token`，它的值先 `GET /api/info` 拿到。

## 目录语义

| 路径 | 是什么 | 能不能改 |
|---|---|---|
| `data\desktop\runtime.json` | 控制台的端口、版本等运行时信息 | 只读 |
| `data\workspace\config\wechatagent.json` | 业务配置：哪些群、白名单、模型、限额 | 通过控制台 API 改，别手编 |
| `data\workspace\packages\dsh-social-bridge-plugin\` | 插件（**含模型路由**） | 改完要重启 DSH |
| `data\workspace\state\` | 令牌、日志、运行态 | 只读 |
| `app\resources\project\` | 源码模板，工作区从这里派生 | 升级时才动 |

## 谁决定「回不回」

三层依次收窄：

1. **bridge**：白名单 + 限流（每分钟/每十分钟条数、批间隔、最小间隔）。
2. **插件**：把上下文、可用工具、人格与规则塞进 DSH 会话，并要求模型只输出 `SILENT` 或 `RESPOND: <一句话>`。
3. **模型**：真正判断。规则里写明「群聊可以沉默，私聊自然简短回应」。

所以「机器人不说话」的排查顺序是：白名单 → 限流 → 插件 → 模型。反过来从模型查，通常白查。

## 为什么 log 会骗人

`state\logs\reader.stderr.log` 里大量 `ConnectionResetError: [WinError 10054]` **不是故障**——健康检查、控制台轮询、关掉的面板都会让客户端提前断开，这是正常流量。补丁 `0001` 把这类异常收掉，就是为了让真正的错误不再被埋。
