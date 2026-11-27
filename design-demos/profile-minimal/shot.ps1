param([string]$Out = "preview-dark.png", [string]$Query = "", [string]$Size = "1280,820")
$dir = $PSScriptRoot
$root = Split-Path (Split-Path $dir -Parent) -Parent
$cacheDir = Join-Path $root ".cache\hd-edge-profile"
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
$url = "file:///F:/010%20projects/%E8%8B%B1%E9%9B%84%E8%81%94%E7%9B%9F%E5%8A%A9%E6%89%8B/design-demos/profile-minimal/index.html" + $Query
$outPath = Join-Path $dir $Out
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --user-data-dir=$cacheDir --window-size=$Size --virtual-time-budget=2500 --screenshot=$outPath $url 2>$null | Out-Null
Write-Output "shot $Out ($Size)"
