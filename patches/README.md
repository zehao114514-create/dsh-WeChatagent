# patches/

每个文件都是一个针对**上游源码**的 unified diff，路径相对仓库根。

| 补丁 | 上游基线 | 作用 | 状态 |
|---|---|---|---|
| `0001-reader-api-quiet-disconnects.patch` | v0.3.8 | 读取服务不再把「客户端提前断开」当异常刷 stderr | 已用 `git apply --check` 验证，干净 |

## 用法

```powershell
# 源码副本（有 .git）
git apply --check patches\0001-reader-api-quiet-disconnects.patch
git apply         patches\0001-reader-api-quiet-disconnects.patch

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
