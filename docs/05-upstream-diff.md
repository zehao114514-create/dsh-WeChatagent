# 05 · 我们和上游差在哪

上游：<https://github.com/sourcepro5/WeChatAgent>（MIT，`Copyright (c) 2026 Derpyu520 and qq-bridge / QSH contributors`）。

本仓库的补丁都基于上游 **v0.3.8** 的文件内容生成。

## 差异清单

| 文件 | 改动 | 为什么 | 会不会冲突 |
|---|---|---|---|
| `scripts/reader-api.py` | 新增 `ReaderHTTPServer(ThreadingHTTPServer)`：`daemon_threads = True`，覆写 `handle_error()`，只吞 `ConnectionResetError` / `ConnectionAbortedError` / `BrokenPipeError` / `TimeoutError`；`create_reader_server()` 的默认工厂换成它 | 客户端提前断开是常态，裸 `ThreadingHTTPServer` 会把异常栈打进 stderr，日志失效 | 上游改到 `create_reader_server` 附近时会冲突，冲突了按下面的方法重做 |
| `components/qq-bridge/src/core/social-engine.js` | 点歌分支（`SONG_REQUEST_RE` 命中处）在 `spawnAutoSing()` 之后补一段文字回执：`this.send(message, ack, { deliveryId })`，成功后把回执 `append(..., { outgoing: true })` 入库，日志打 `song_request_acked`；失败只记 `song_ack_failed`，不影响点歌本身 | 原来命中点歌就 `return`，**不回一个字也不入库**——语音条要几分钟才生成，聊天记录里看着像机器人死了（真实工单：「微信怎么不回了」） | 上游改点歌分支、或 `SocialEngine.send/append` 签名变化时会冲突 |

**不包含**在补丁里、只在本地做过的改动（有意不进开源）：

- 人格提示词（`cordis.patch.yml` 里把默认人格换成自定义角色）——属于个人配置，仓库只给模板，见 `docs/06-extending.md`。
- 路径、账号、模型名、令牌——全部本地化，仓库里不出现。

## 补丁长什么样

```diff
+class ReaderHTTPServer(ThreadingHTTPServer):
+    """Client disconnects are normal traffic for this server, not crashes."""
+    daemon_threads = True
+
+    def handle_error(self, request, client_address):
+        error = sys.exc_info()[1]
+        if isinstance(error, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError)):
+            return
+        super().handle_error(request, client_address)
```

```diff
         spawnAutoSing(song, message.conversation_name ?? '', /完整|整首|全曲|全长|唱完|从头/.test(bare) ? 'full' : (/高潮|副歌/.test(bare) ? 'chorus' : ''));
+        // 点歌不再静默：语音条要几分钟才到，先回一句文字，否则在聊天记录里看着像"没回"。
+        const ack = String(this.songAck?.(song) ?? `《${song}》是吧。等着，换声加录音要几分钟，别催。`);
+        Promise.resolve().then(() => this.send(message, ack, { deliveryId: ackId })) /* …入库/记日志… */;
         return;
```

## 怎么应用

```powershell
# 在 WeChatAgent 源码副本里
git apply --check ..\..\patches\0001-reader-api-quiet-disconnects.patch   # 先检查
git apply --check ..\..\patches\0002-song-request-ack.patch
git apply           ..\..\patches\0001-reader-api-quiet-disconnects.patch
git apply           ..\..\patches\0002-song-request-ack.patch
```

对**安装包形态**（没有 .git）用 `tools\apply-patch.ps1`：它会先备份、再按锚点插入、最后自检。

## 上游升级之后怎么办

1. 先看 `git apply --check` 还干不干净。干净 → 直接打。
2. 冲突 → 用 `--reject` 只看被拒的片段；通常在 `create_reader_server` 附近，手工改一行（`server_factory or ReaderHTTPServer`）即可。
3. 重做补丁：

   ```powershell
   # 在上游 checkout 里改完文件后
   git diff -- scripts/reader-api.py > ..\..\patches\0001-....patch
   ```

4. 跑 `tests\test_reader_disconnect.py` 验证行为（下面）。

## 行为验证（不依赖测试框架）

`tests/test_reader_disconnect.py` 从**真实源码**里用 `ast` 切出 `ReaderHTTPServer` 并 `exec`，然后起两个服务器（原生 vs 修后），用 `SO_LINGER=0` 强制 RST，比较 stderr 里 `ConnectionResetError` 的次数。

```powershell
py tests\test_reader_disconnect.py "<安装根或源码>\scripts\reader-api.py"
```

期望：原版有 traceback，修后 0 条。
