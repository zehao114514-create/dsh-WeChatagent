# PUBLISH · 发布清单

> 状态：**已发布**（2026-10-24）→ <https://github.com/zehao114514-create/dsh-WeChatagent>（public）
> 上游作者已知悉并同意公开；补丁准备回提 PR（见文末「回提 PR」一节）。

## 发之前的三道确认

1. **作者回话**：补丁要不要以 PR 形式回上游、文档里提目录结构他是否介意。
2. **仓库形态**：建议先 private，确认后再转 public。
3. **再扫一遍**：确认没有凭证 / 真实路径 / 昵称 / 手机号。

```powershell
# 敏感信息扫描（在仓库根跑）
Get-ChildItem -Recurse -File -Include *.md,*.ps1,*.mjs,*.py,*.patch,*.txt |
  Select-String -Pattern 'sk-[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9]{16,}|SESSDATA|bili_jct|wxid_|AppData\\Local|1[3-9]\d{9}'
# 期望：无输出
```

## 发布（用 PAT，别用 cookie）

```powershell
# 0) 建仓库（classic PAT，scope=repo）
curl.exe -sS -X POST https://api.github.com/user/repos ^
  -H "Authorization: token <PAT>" ^
  -H "Accept: application/vnd.github+json" ^
  -d "{\"name\":\"dsh-wechat-agent-kit\",\"private\":true,\"description\":\"WeChatAgent 的运维工具 + 修复补丁 + 文档（不含上游源码）\"}"

# 1) 挂远端（token 只出现在这一条命令里）
git remote add origin https://<你的用户名>:<PAT>@github.com/<你的用户名>/dsh-wechat-agent-kit.git
git -c http.proxy= push -u origin master

# 2) 立刻把 token 从 remote 里摘掉
git remote set-url origin https://github.com/<你的用户名>/dsh-wechat-agent-kit.git
git remote -v        # 确认 URL 里没有 token

# 3) 去 GitHub 页面 revoke 那个 PAT
```

## 发完之后

- 仓库描述里写上「不是 WeChatAgent 的分支，只含补丁与自有工具」；
- 在 README 顶部把上游链接、基线版本（v0.3.8）再确认一遍；
- 如果作者同意收 PR：把 `patches/0001-…patch` 转成 PR，正文里贴「修前 2 处 traceback / 修后 0 处」的验证结论；
- 如果作者不希望公开：仓库转回 private 或删掉即可，本地这份不受影响。

## 不要做的事

- 不要把 PAT、cookie、`cred.json`、`bili_credential.json` 之类放进仓库；
- 不要把本地人格提示词（牧瀬紅莉栖那套）放进仓库；
- 不要把 `C:\Users\<名字>\…` 这类真实路径写进文档。

---

## 回提 PR（**暂不进行**，2026-10-24 决定）

> 决定：不往上游提 PR。补丁在本仓库 `patches/` 里公开可用，需要的人自己打。
> 下面这段留着，万一以后要提，命令和正文都是现成的。

补丁只改一个文件：`scripts/reader-api.py`（+20 行左右，不动任何现有逻辑）。

### 步骤

```powershell
# 1) 在网页上 fork sourcepro5/WeChatAgent
gh repo fork sourcepro5/WeChatAgent --clone=false    # 或网页点 Fork

# 2) 拉自己的 fork，建分支，打补丁
git clone https://github.com/<你>/WeChatAgent.git
cd WeChatAgent
git checkout -b fix/reader-api-quiet-disconnects

# 3) 打补丁（用本仓库的补丁文件）
git apply --check "D:\gpt\dsh\projects\wechat-agent-kit\patches\0001-reader-api-quiet-disconnects.patch"
git apply       "D:\gpt\dsh\projects\wechat-agent-kit\patches\0001-reader-api-quiet-disconnects.patch"

# 4) 提交并推
git -c user.name='<你>' -c user.email='<你@邮箱>' commit -am "fix(reader-api): quiet client disconnect tracebacks"
git -c http.proxy=http://127.0.0.1:7994 push -u origin fix/reader-api-quiet-disconnects

# 5) 去 GitHub 点 Compare & pull request，正文用下面这段
```

### PR 标题

```
fix(reader-api): stop logging full tracebacks for client disconnects
```

### PR 正文

```markdown
## 问题

`scripts/reader-api.py` 直接用 `ThreadingHTTPServer`，客户端提前断开（浏览器/健康检查/桥接进程重启）时，
`BaseHTTPRequestHandler` 抛出的 `ConnectionResetError` 会冒到 `socketserver` 的默认 `handle_error`，
把整条 traceback 打进 stderr：

```
ConnectionResetError: [WinError 10054] 远程主机强迫关闭了一个现有的连接。
  File "socketserver.py", line 697, in __init__
  File "http\server.py", line 453, in handle_one_request
  ...
```

`reader.stderr.log` 几分钟就能涨到几百 KB，真正的错误被埋掉，排障时基本没法读。

## 修法

- 新增 `ReaderHTTPServer(ThreadingHTTPServer)`：`daemon_threads = True`，
  覆写 `handle_error()`，只吞连接类异常（`ConnectionResetError` / `ConnectionAbortedError` / `BrokenPipeError` / `TimeoutError`），其他异常仍走 `super()`。
- `create_reader_server()` 的默认工厂从 `ThreadingHTTPServer` 换成 `ReaderHTTPServer`（保留 `server_factory` 参数，行为不变）。

## 验证

同一段代码，客户端用 `SO_LINGER=0` 强制 RST：

| | stderr 里的 ConnectionResetError |
|---|---|
| 修前 | 2264 字节 / 2 处 traceback |
| 修后 | 0 字节 / 0 处 |

测试脚本（ast 从真实 `reader-api.py` 切出该类，起两个服务器做对比）：
<https://github.com/zehao114514-create/dsh-WeChatagent/blob/main/tests/test_reader_disconnect.py>

