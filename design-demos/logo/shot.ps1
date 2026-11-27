# Headless Edge screenshot for logo boards
$dir = $PSScriptRoot
$base = "file:///F:/010%20projects/%E8%8B%B1%E9%9B%84%E8%81%94%E7%9B%9F%E5%8A%A9%E6%89%8B/design-demos/logo/"
$art = "C:\Users\Sea\.gemini\antigravity\brain\33b67195-fed2-4923-a784-355fc6c23cc7"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$jobs = @(
  @("thumbs.html", "logo-thumbs.png", "1280,740"),
  @("dir-1.html",  "logo-dir-1.png",  "1200,760"),
  @("dir-2.html",  "logo-dir-2.png",  "1200,760"),
  @("dir-3.html",  "logo-dir-3.png",  "1200,760")
)
foreach ($j in $jobs) {
  $tmp = "C:\Users\Sea\AppData\Local\Temp\hd-logo-" + [guid]::NewGuid().ToString("N") + ".png"
  & $edge --headless=new --disable-gpu --hide-scrollbars --user-data-dir=C:\Users\Sea\AppData\Local\Temp\hd-edge --window-size=$($j[2]) --virtual-time-budget=2000 --screenshot=$tmp ($base + $j[0]) 2>$null | Out-Null
  Copy-Item $tmp (Join-Path $dir $j[1]) -Force
  Copy-Item $tmp (Join-Path $art $j[1]) -Force
  Remove-Item $tmp
  Write-Output "shot $($j[1])"
}
