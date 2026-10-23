# PUBLISH · 发布清单（还没发，先备着）

> 状态：**未发布**。仓库在本地已完成 `git init` + 提交，没有 remote。
> 什么时候发、发 private 还是 public，等作者回话（见对话记录 m03332：这是别人的作品，先问）。

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
