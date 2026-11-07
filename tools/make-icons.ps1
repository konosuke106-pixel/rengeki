# tools/icon.html を Edge で描いて、ホーム画面用の PNG を作る
$root = Split-Path $PSScriptRoot -Parent
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$big = Join-Path $env:TEMP 'rengeki-icon-1024.png'
if (Test-Path $big) { Remove-Item $big }
$url = 'file:///' + ((Join-Path $PSScriptRoot 'icon.html') -replace '\\', '/')
$profile = Join-Path $env:TEMP 'rengeki-icon-profile'
$p = Start-Process $edge -PassThru -Wait -ArgumentList @(
  '--headless=new', '--disable-gpu', '--hide-scrollbars', "--user-data-dir=$profile",
  '--force-device-scale-factor=1', '--window-size=1024,1024', '--virtual-time-budget=6000',
  "--screenshot=$big", $url
)
if (-not (Test-Path $big)) { throw 'スクリーンショットを作れませんでした' }

Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($big)
"元絵: $($src.Width)x$($src.Height)"
foreach ($size in 180, 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $bmp.Save((Join-Path $root "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
$src.Dispose()
Get-ChildItem $root -Filter 'icon-*.png' | ForEach-Object { "$($_.Name) $($_.Length) bytes" }
