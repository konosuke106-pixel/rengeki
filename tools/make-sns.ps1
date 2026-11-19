# tools/sns.html を Edge で描いて、X（SNS）用の画像を promo/ に作る
# 例：pwsh tools/make-sns.ps1          → promo/x-profile.png（400x400）と promo/x-header.png（1500x500）
#     pwsh tools/make-sns.ps1 -Round   → 丸く切り抜いた見え方の確認用も作る（promo/x-profile-round.png）
param([switch]$Round)
$root = Split-Path $PSScriptRoot -Parent
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$out = Join-Path $root 'promo'
New-Item -ItemType Directory -Force $out | Out-Null
$env:PORT = '5199'
$server = Start-Process node -ArgumentList @((Join-Path $PSScriptRoot 'serve.mjs')) -PassThru -WindowStyle Hidden
function Shot($query, $w, $h, $file) {
  $profile = Join-Path $env:TEMP 'rengeki-sns-profile'
  Start-Process $edge -Wait -ArgumentList @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars', "--user-data-dir=$profile",
    '--force-device-scale-factor=1', "--window-size=$w,$h", '--virtual-time-budget=8000',
    "--screenshot=$file", "http://localhost:5199/tools/sns.html?$query"
  )
  if (-not (Test-Path $file)) { throw "作れませんでした: $file" }
}
try {
  Start-Sleep -Milliseconds 800
  $big = Join-Path $env:TEMP 'rengeki-x-profile-1000.png'
  Shot 'kind=profile' 1000 1000 $big
  Shot 'kind=header' 1500 500 (Join-Path $out 'x-header.png')
  if ($Round) { Shot 'kind=profile&round' 1000 1000 (Join-Path $out 'x-profile-round.png') }
} finally {
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
# プロフィール画像は 400x400 に縮める
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($big)
$bmp = New-Object System.Drawing.Bitmap 400, 400
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($src, 0, 0, 400, 400)
$bmp.Save((Join-Path $out 'x-profile.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Get-ChildItem $out -Filter 'x-*.png' | ForEach-Object { "$($_.Name) $($_.Length) bytes" }
