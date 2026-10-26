# check-patches.ps1 —— 在「干净的官方源码」上逐个 git apply --check
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools\check-patches.ps1 -Upstream "<官方 vX.Y.Z 源码目录>"
#
# -Upstream 必须是从官方 tarball 解出来的原始目录（没有打过任何我们自己的补丁）。
# 退出码：0 = 全部通过；1 = 有补丁打不上或参数不对。
param(
    [Parameter(Mandatory = $true)][string]$Upstream
)

$ErrorActionPreference = 'Continue'
$here   = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$patches = Join-Path $here 'patches'
$fail = 0

if (-not (Test-Path $Upstream)) { Write-Host "× 找不到官方源码目录：$Upstream" -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $Upstream 'components'))) {
    Write-Host "× 这不像 WeChatAgent 的源码根（缺 components\）：$Upstream" -ForegroundColor Red
    exit 1
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("wca-patchcheck-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
Copy-Item $Upstream $tmp -Recurse -Force
Push-Location $tmp
try {
    git init -q
    git add -A
    git -c user.name=check -c user.email=check@local commit -qm base
    Write-Host "基线：$Upstream （副本在 $tmp）" -ForegroundColor Cyan

    $list = Get-ChildItem $patches -Filter '*.patch' | Sort-Object Name
    if (-not $list) { Write-Host '× patches\ 下没有补丁文件' -ForegroundColor Red; $fail++ }
    foreach ($p in $list) {
        $null = git apply --check $p.FullName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ $($p.Name)" -ForegroundColor Green
        } else {
            Write-Host "✗ $($p.Name) —— 在官方源码上打不上" -ForegroundColor Red
            $fail++
        }
    }
} finally {
    Pop-Location
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($fail -eq 0) { Write-Host '所有补丁都能干净应用到官方源码。' -ForegroundColor Green; exit 0 }
Write-Host "有 $fail 个补丁没过。" -ForegroundColor Red
exit 1
