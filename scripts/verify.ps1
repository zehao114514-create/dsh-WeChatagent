# verify.ps1 —— 一次跑完本仓库的自检
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -Root "<安装根或源码副本>"
#
# 检查项：
#   1. tools\wca.mjs 语法
#   2. tests\test_reader_disconnect.py 行为（修前有 traceback、修后干净）
#   3. 目标 reader-api.py 里补丁是否已生效（有 ReaderHTTPServer 且默认工厂已换）
#   4. 安装根的三服务状态（只有安装包形态才有）
param(
    [Parameter(Mandatory = $false)][string]$Root = $env:WCA_ROOT
)

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$fail = 0

function Step($name) { Write-Host "`n=== $name ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "✓ $m" -ForegroundColor Green }
function Bad($m)  { Write-Host "✗ $m" -ForegroundColor Red; $script:fail++ }

Step '1. CLI 语法'
node --check (Join-Path $here 'tools\wca.mjs')
if ($LASTEXITCODE -eq 0) { Ok 'wca.mjs 语法通过' } else { Bad 'wca.mjs 语法错误' }

Step '2. 读取服务断连行为'
$reader = $null
if ($Root) {
    foreach ($p in @((Join-Path $Root 'scripts\reader-api.py'), (Join-Path $Root 'data\workspace\scripts\reader-api.py'))) {
        if (Test-Path $p) { $reader = $p; break }
    }
}
if ($reader) {
    py (Join-Path $here 'tests\test_reader_disconnect.py') $reader
    if ($LASTEXITCODE -eq 0) { Ok '断连不再刷屏' } else { Bad '补丁未生效或未应用' }
} else {
    Write-Host "! 没给 -Root 或没找到 reader-api.py，跳过" -ForegroundColor Yellow
}

Step '3. 补丁是否已落地'
if ($reader) {
    $text = [IO.File]::ReadAllText($reader)
    if ($text -match 'class ReaderHTTPServer') { Ok 'ReaderHTTPServer 已存在' } else { Bad '没有 ReaderHTTPServer，补丁没打' }
    if ($text -match 'server_factory or ReaderHTTPServer') { Ok '默认工厂已切换' } else { Bad '默认工厂仍是 ThreadingHTTPServer' }
} else {
    Write-Host '! 跳过' -ForegroundColor Yellow
}

Step '4. 链路状态'
if ($Root -and (Test-Path (Join-Path $Root 'data\desktop\runtime.json'))) {
    node (Join-Path $here 'tools\wca.mjs') diag --root $Root
    if ($LASTEXITCODE -eq 0) { Ok '链路正常' } else { Bad '链路检查未通过（见上面的 diag 输出）' }
} else {
    Write-Host '! 这不是安装包形态的根目录，跳过在线检查' -ForegroundColor Yellow
}

Write-Host ''
if ($fail -eq 0) { Write-Host '全部通过。' -ForegroundColor Green; exit 0 }
Write-Host "有 $fail 项没过。" -ForegroundColor Red
exit 1
