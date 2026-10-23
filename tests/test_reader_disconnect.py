# -*- coding: utf-8 -*-
r"""证明 reader-api.py 的 ReaderHTTPServer 不再把「客户端断连」打成 traceback。

做法：
  1) 用 ast 从真正的 `WeChatAgent\scripts\reader-api.py` 里切出 ReaderHTTPServer 类源码并 exec，
     这样测的就是仓库里那份代码，而不是复制品；
  2) 起两个服务器（原生 ThreadingHTTPServer / ReaderHTTPServer），让客户端发请求后
     用 SO_LINGER=0 强制 RST 断开；
  3) 对比两边 stderr。

预期：原生版有 `ConnectionResetError` traceback，Reader 版干净。

用法：py test_reader_disconnect.py
"""
import ast
import contextlib
import io
import os
import socket
import struct
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("WCA_READER_SRC", "")).strip()
if not REPO:
    raise SystemExit(
        "用法：py test_reader_disconnect.py <reader-api.py 的路径>\n"
        "  源码副本：<repo>\\scripts\\reader-api.py\n"
        "  安装包形态：<安装根>\\data\\workspace\\scripts\\reader-api.py\n"
        "  也可以用环境变量 WCA_READER_SRC。"
    )
if not os.path.exists(REPO):
    raise SystemExit(f"找不到文件：{REPO}")


def load_server_class():
    src = open(REPO, encoding="utf-8").read()
    tree = ast.parse(src)
    node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "ReaderHTTPServer")
    snippet = ast.get_source_segment(src, node)
    ns = {"ThreadingHTTPServer": ThreadingHTTPServer, "sys": sys}
    exec(compile(snippet, "<reader-api.ReaderHTTPServer>", "exec"), ns)
    return ns["ReaderHTTPServer"], snippet


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        # 回一个很慢的响应，让客户端有机会先断开
        time.sleep(0.15)
        try:
            body = b"{}"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionResetError, BrokenPipeError):
            raise


def exercise(server_cls):
    srv = server_cls(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        for _ in range(2):
            s = socket.create_connection(("127.0.0.1", port), timeout=2)
            s.sendall(b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n")
            # 强制 RST：不读响应就带着 SO_LINGER=0 关掉
            s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
            s.close()
            time.sleep(0.35)
    finally:
        srv.shutdown()
        srv.server_close()
        time.sleep(0.1)


def run(name, cls):
    buf = io.StringIO()
    with contextlib.redirect_stderr(buf):
        exercise(cls)
    text = buf.getvalue()
    resets = text.count("ConnectionResetError")
    print(f"[{name}] stderr {len(text)} 字节，ConnectionResetError traceback: {resets} 处")
    if resets:
        print("   " + " / ".join(text.strip().splitlines()[:2]))
    return resets


def main():
    ReaderHTTPServer, snippet = load_server_class()
    print("已从仓库源码切出 ReaderHTTPServer（%d 字符）" % len(snippet))
    before = run("原版 ThreadingHTTPServer", ThreadingHTTPServer)
    after = run("修后的 ReaderHTTPServer", ReaderHTTPServer)
    ok = before > 0 and after == 0
    print("结论:", "通过 —— 修前有 traceback、修后干净" if ok else f"未达预期（before={before}, after={after}）")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
