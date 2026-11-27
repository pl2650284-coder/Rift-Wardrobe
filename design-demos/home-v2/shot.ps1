param([string]$Page, [string]$Out, [string]$Size = "980,700")
# Headless Edge screenshot. Usage: shot.ps1 thumbs.html thumbs.png 1450,760
$dir = $PSScriptRoot
$url = "file:///F:/010%20projects/%E8%8B%B1%E9%9B%84%E8%81%94%E7%9B%9F%E5%8A%A9%E6%89%8B/design-demos/home-v2/" + $Page
$tmp = "C:\Users\Sea\AppData\Local\Temp\hd-shot-" + [guid]::NewGuid().ToString("N") + ".png"
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=C:\Users\Sea\AppData\Local\Temp\hd-edge --window-size=$Size --virtual-time-budget=3000 --screenshot=$tmp $url 2>$null | Out-Null
Copy-Item $tmp (Join-Path $dir $Out) -Force
Remove-Item $tmp
Write-Output "shot $Out"
