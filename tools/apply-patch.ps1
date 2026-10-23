# apply-patch.ps1 —— 给已安装的 WeChatAgent 打 reader-api 断连静音补丁
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools\apply-patch.ps1 -Root "C:\Users\<你>\AppData\Local\Programs\WeChatAgent"
#   powershell -ExecutionPolicy Bypass -File tools\apply-patch.ps1 -Root "<源码副本>"     # 源码副本也行
#
# 行为：
#   1. 定位 scripts\reader-api.py（安装包形态在 data\workspace\scripts\ 下）
#   2. 已经打过就跳过（幂等）
#   3. 备份成 *.bak-<时间戳>
#   4. 按锚点插入 ReaderHTTPServer，并替换 create_reader_server 的默认工厂
#   5. py_compile 自检
param(
    [Parameter(Mandatory = $true)][string]$Root
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

$candidates = @(
    (Join-Path $Root 'scripts\reader-api.py'),
    (Join-Path $Root 'data\workspace\scripts\reader-api.py')
)
$target = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $target) { Fail "找不到 reader-api.py。试过：`n  $($candidates -join "`n  ")" }

Write-Host "目标文件：$target"
$text = [IO.File]::ReadAllText($target)

if ($text -match 'class ReaderHTTPServer') {
    Write-Host "✓ 已经打过补丁，跳过。" -ForegroundColor Green
    exit 0
}

$anchor = "def create_reader_server(port, handler, server_factory=None):"
if (-not $text.Contains($anchor)) { Fail "锚点没找到（$anchor）。这个版本的 reader-api.py 结构不一样，请手工打补丁。" }
$hits = ([regex]::Matches($text, [regex]::Escape($anchor))).Count
if ($hits -ne 1) { Fail "锚点出现 $hits 次，不唯一，停下以免改错。" }

$backup = "$target.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $target -Destination $backup -Force
Write-Host "已备份：$backup"

$class = @'
class ReaderHTTPServer(ThreadingHTTPServer):
    """Client disconnects are normal traffic for this server, not crashes.

    BaseHTTPRequestHandler lets ConnectionResetError escape into socketserver, which prints the
    full traceback to stderr. Health polls, console polling and closed tabs all trigger it, so the
    log fills with noise that buries real failures. Client-side disconnects are dropped here;
    every other error still goes through the default reporting.
    """
    daemon_threads = True

    def handle_error(self, request, client_address):
        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


'@

$text = $text.Replace($anchor, ($class + $anchor))
$text = $text.Replace('(server_factory or ThreadingHTTPServer)', '(server_factory or ReaderHTTPServer)')

if (-not $text.Contains('(server_factory or ReaderHTTPServer)')) {
    Fail "默认工厂那一行没替换成功（这版可能写法不同），已停下。备份在 $backup"
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($target, $text, $utf8)

# 自检
$py = Get-Command py -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python -ErrorAction SilentlyContinue }
if ($py) {
    & $py.Source -m py_compile $target
    if ($LASTEXITCODE -ne 0) { Fail "py_compile 失败，回滚：Copy-Item '$backup' '$target' -Force" }
    Write-Host "✓ py_compile 通过"
} else {
    Write-Host "! 没找到 python，跳过语法自检" -ForegroundColor Yellow
}

Write-Host "✓ 补丁已应用。重启读取服务后生效：node tools\wca.mjs restart" -ForegroundColor Green
