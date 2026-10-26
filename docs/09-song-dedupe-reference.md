# 参考实现 · 点歌去重与重放收窄

这两个改动（`0005-stale-dispatch-and-song-dedupe` 的后半段）同样**不能直接打到官方 v0.3.8**：它们依赖运行时扩展 `lastSongByKey`、`persistLastSong`、`spawnAutoSing`。官方源码里没有这套点歌链路，`git apply --check` 会失败。

## 改动要点（对着自己的实现改）

1. **按消息去重**：拿到 `message.message_id` 后先查一个已处理集合（持久化到 `out\handled-songs.json`），命中就 `return`，避免重启后把缓冲里的旧点歌再执行一遍。
2. **5 分钟时效**：`ageSec = Date.now()/1000 - message.timestamp`，超过 300 秒打 `song_request_stale_ignored` 并跳过。
3. **重放正则收窄**：原来 `/^(?:直接)?唱|^(?:来|唱)(?:一)?段|高潮|副歌|完整|整首|全曲|从头/` 太宽（普通聊天里提到「唱」「副歌」就触发重放），改成只认 `/^(?:再来|再唱|重唱|重来|再放|再播|重新唱)|(?:完整|整首|全曲|从头)/`。

## 验证

点歌两次：第一次应看到 `song_request_intercepted` + `VERDICT delivered`；第二次同一句话应只出现 `SKIP_BUSY 前一个还在跑 pid=...` 或被 `stale` 拦下，不会再起第二个进程。