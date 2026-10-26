# patches/

每个文件都是一个针对**上游源码**的 unified diff，路径相对仓库根。

| 补丁 | 上游基线 | 作用 | 状态 |
|---|---|---|---|
| `0001-reader-api-quiet-disconnects.patch` | v0.3.8 | 读取服务不再把「客户端提前断开」当异常刷 stderr | 已用 `git apply --check` 验证，干净 |
| `0002-song-request-ack.patch` | v0.3.8 | 点歌命中后先回一句文字回执（并入库），不再静默 `return` | 已用 `git apply` 正反向各验一次，干净 |
| `0003-bing-cn-fallback.patch` | v0.3.8 | 联网搜索先走 `cn.bing.com`，失败再退 `www.bing.com`；`redirect: error` 改成 `follow`（原来在国内直连必 fetch failed） | 本地实例已生效（10 条 / 296ms） |
| `0004-search-fallback-and-language-filter.patch` | v0.3.8 | 原生 `web_search` 返回 `native_*` 错误时回退到 bing，结果标 `provider:bridge-bing`；顺手加语种前缀过滤，避免中文提问拿到日文资料 | 本地实例已生效 |
| `0005-stale-dispatch-and-song-dedupe.patch` | v0.3.8 | 派发前丢弃 15 分钟前的旧消息（直接 @ 例外），修「一直回旧话题」；点歌按 message_id 去重 + 5 分钟时效，重放上一首的正则收窄 | 本地实例已生效（日志 `song_request_intercepted` / `SKIP_BUSY`） |
| `0006-strip-emo-tags.patch` | v0.3.8 | 出口剥掉 `[EMO xxx]` 标签，免得给立绘用的标签漏进微信群 | 本地实例已生效 |

## 用法

```powershell
# 源码副本（有 .git）
git apply --check patches\0001-reader-api-quiet-disconnects.patch
git apply --check patches\0002-song-request-ack.patch
git apply         patches\0001-reader-api-quiet-disconnects.patch
git apply         patches\0002-song-request-ack.patch
git apply --check patches\0003-bing-cn-fallback.patch
git apply --check patches\0004-search-fallback-and-language-filter.patch
git apply --check patches\0005-stale-dispatch-and-song-dedupe.patch
git apply --check patches\0006-strip-emo-tags.patch

# 安装包形态（没有 .git）
powershell -ExecutionPolicy Bypass -File tools\apply-patch.ps1 -Root "<安装根>"
```

## 打完怎么确认

```powershell
py tests\test_reader_disconnect.py "<安装根>\data\workspace\scripts\reader-api.py"
# 期望：原版 2 处 traceback，修后 0 处
```

然后重启读取服务（`node tools\wca.mjs restart`），看 `state\logs\reader.stderr.log` 不再增长。

## 上游升级后

`git apply --check` 报冲突就先别打，按 `docs\05-upstream-diff.md` 重做补丁。
