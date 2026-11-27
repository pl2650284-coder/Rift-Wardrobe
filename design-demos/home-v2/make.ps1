param([string]$Shots = "")
# Build all src/*.html, then take screenshots. Shots: "page.html|out.png|980,700;page2.html|out2.png|375,812"
$dir = $PSScriptRoot
node (Join-Path $dir "build.mjs")
foreach ($s in ($Shots -split ";" | Where-Object { $_ })) {
  $p = $s.Split("|")
  & (Join-Path $dir "shot.ps1") -Page $p[0] -Out $p[1] -Size $p[2]
}
