Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$format = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb

function Get-Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-Canvas([int]$width, [int]$height) {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, $format)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-Mark($graphics, [float]$x, [float]$y, [float]$size, [System.Drawing.Color]$color) {
  $teal = [System.Drawing.SolidBrush]::new((Get-Color '#36BFA6'))
  $violet = [System.Drawing.SolidBrush]::new((Get-Color '#9180D4'))
  $amber = [System.Drawing.SolidBrush]::new((Get-Color '#E3B35A'))
  $graphite = [System.Drawing.SolidBrush]::new((Get-Color '#171A1D'))
  $outline = [System.Drawing.Pen]::new($color, [Math]::Max(1, $size * 0.006))
  try {
    $graphics.FillRectangle($teal, $x + $size * 0.03, $y + $size * 0.03, $size * 0.27, $size * 0.59)
    $graphics.FillRectangle($violet, $x + $size * 0.03, $y + $size * 0.67, $size * 0.27, $size * 0.30)
    $left = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new($x + $size * 0.34, $y + $size * 0.08),
      [System.Drawing.PointF]::new($x + $size * 0.50, $y + $size * 0.28),
      [System.Drawing.PointF]::new($x + $size * 0.50, $y + $size * 0.64),
      [System.Drawing.PointF]::new($x + $size * 0.34, $y + $size * 0.47)
    )
    $right = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new($x + $size * 0.54, $y + $size * 0.28),
      [System.Drawing.PointF]::new($x + $size * 0.72, $y + $size * 0.08),
      [System.Drawing.PointF]::new($x + $size * 0.72, $y + $size * 0.64),
      [System.Drawing.PointF]::new($x + $size * 0.54, $y + $size * 0.64)
    )
    $graphics.FillPolygon($graphite, $left)
    $graphics.DrawPolygon($outline, $left)
    $graphics.FillPolygon($teal, $right)
    $graphics.FillRectangle($graphite, $x + $size * 0.76, $y + $size * 0.03, $size * 0.21, $size * 0.30)
    $graphics.DrawRectangle($outline, $x + $size * 0.76, $y + $size * 0.03, $size * 0.21, $size * 0.30)
    $graphics.FillRectangle($amber, $x + $size * 0.76, $y + $size * 0.38, $size * 0.21, $size * 0.29)
    $graphics.FillRectangle($graphite, $x + $size * 0.76, $y + $size * 0.72, $size * 0.21, $size * 0.25)
    $graphics.DrawRectangle($outline, $x + $size * 0.76, $y + $size * 0.72, $size * 0.21, $size * 0.25)
  } finally {
    $teal.Dispose(); $violet.Dispose(); $amber.Dispose(); $graphite.Dispose(); $outline.Dispose()
  }
}

function Save-Icon([string]$path, [int]$width, [int]$height, [string]$background, [string]$foreground) {
  $canvas = New-Canvas $width $height
  try {
    $graphics = $canvas.Graphics
    $backgroundBrush = [System.Drawing.SolidBrush]::new((Get-Color $background))
    try { $graphics.FillRectangle($backgroundBrush, 0, 0, $width, $height) }
    finally { $backgroundBrush.Dispose() }
    $size = [Math]::Min($width, $height) * 0.86
    Draw-Mark $graphics (($width - $size) / 2) (($height - $size) / 2) $size (Get-Color $foreground)
    $canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $canvas.Graphics.Dispose()
    $canvas.Bitmap.Dispose()
  }
}

function Save-Banner([string]$path, [int]$width, [int]$height, [bool]$vertical) {
  $canvas = New-Canvas $width $height
  try {
    $background = [System.Drawing.SolidBrush]::new((Get-Color '#171A1D'))
    $foreground = [System.Drawing.SolidBrush]::new((Get-Color '#F3F1EA'))
    $accent = [System.Drawing.SolidBrush]::new((Get-Color '#36BFA6'))
    $font = [System.Drawing.Font]::new('Segoe UI', $(if ($vertical) { 19 } else { 15 }), [System.Drawing.FontStyle]::Bold)
    try {
      $canvas.Graphics.FillRectangle($background, 0, 0, $width, $height)
      if ($vertical) {
        Draw-Mark $canvas.Graphics 23 55 118 (Get-Color '#F3F1EA')
        $canvas.Graphics.DrawString('mos', $font, $foreground, 22, 185)
        $canvas.Graphics.DrawString('AI', $font, $accent, 67, 185)
        $canvas.Graphics.DrawString('co', $font, $foreground, 93, 185)
      } else {
        Draw-Mark $canvas.Graphics 9 4 48 (Get-Color '#F3F1EA')
        $canvas.Graphics.DrawString('mos', $font, $foreground, 63, 16)
        $canvas.Graphics.DrawString('AI', $font, $accent, 99, 16)
        $canvas.Graphics.DrawString('co', $font, $foreground, 122, 16)
      }
      $canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally {
      $font.Dispose()
      $accent.Dispose()
      $foreground.Dispose()
      $background.Dispose()
    }
  } finally {
    $canvas.Graphics.Dispose()
    $canvas.Bitmap.Dispose()
  }
}

function Write-BigEndian32($writer, [int]$value) {
  foreach ($shift in @(24, 16, 8, 0)) { $writer.Write([byte](($value -shr $shift) -band 255)) }
}

$themeRoot = Join-Path $repoRoot 'src/assets/theme-icons'
Get-ChildItem $themeRoot -Recurse -Filter '*.png' | ForEach-Object {
  $path = $_.FullName
  $existing = [System.Drawing.Image]::FromFile($path)
  try { $width = $existing.Width; $height = $existing.Height }
  finally { $existing.Dispose() }
  $name = $_.BaseName
  $background = '#171A1D'; $foreground = '#F3F1EA'
  if ($name -match 'light|solarized') { $background = '#F3F1EA'; $foreground = '#171A1D' }
  if ($name -match 'nord') { $background = '#2e3440'; $foreground = '#d8dee9' }
  if ($name -match 'gruvbox') { $background = '#282828'; $foreground = '#fabd2f' }
  if ($name -match 'dracula') { $background = '#282a36'; $foreground = '#bd93f9' }
  if ($name -match 'indigo|blue|tokyo') { $background = '#151625'; $foreground = '#aaa7ff' }
  if ($name -match 'blush|pink') { $background = '#251922'; $foreground = '#f0b3d1' }
  if ($name -match 'pure-black|min-dark|dark$') { $background = '#090a0c'; $foreground = '#f5f5f8' }
  Save-Icon $path $width $height $background $foreground
}
foreach ($size in @(32, 48, 64)) {
  Save-Icon (Join-Path $themeRoot "$size/mosaico.png") $size $size '#171A1D' '#F3F1EA'
}
Save-Icon (Join-Path $themeRoot 'mosaico.png') 220 220 '#171A1D' '#F3F1EA'

$iconsRoot = Join-Path $repoRoot 'src-tauri/icons'
Get-ChildItem $iconsRoot -Recurse -Filter '*.png' | ForEach-Object {
  $existing = [System.Drawing.Image]::FromFile($_.FullName)
  try { $width = $existing.Width; $height = $existing.Height }
  finally { $existing.Dispose() }
  Save-Icon $_.FullName $width $height '#171A1D' '#F3F1EA'
}

$iconSizes = @(16, 32, 48, 64, 128, 256, 512, 1024)
$pngBytes = @{}
foreach ($size in $iconSizes) {
  $temporary = Join-Path $env:TEMP "mosaico-icon-$size.png"
  Save-Icon $temporary $size $size '#171A1D' '#F3F1EA'
  $pngBytes[$size] = [System.IO.File]::ReadAllBytes($temporary)
  Remove-Item -LiteralPath $temporary
}

$icoPath = Join-Path $iconsRoot 'icon.ico'
$icoSizes = @(16, 32, 48, 256)
$writer = [System.IO.BinaryWriter]::new([System.IO.File]::Create($icoPath))
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$icoSizes.Count)
  $offset = 6 + 16 * $icoSizes.Count
  foreach ($size in $icoSizes) {
    $writer.Write([byte]($size % 256)); $writer.Write([byte]($size % 256))
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$pngBytes[$size].Length); $writer.Write([uint32]$offset)
    $offset += $pngBytes[$size].Length
  }
  foreach ($size in $icoSizes) { $writer.Write([byte[]]$pngBytes[$size]) }
} finally { $writer.Dispose() }

$icnsPath = Join-Path $iconsRoot 'icon.icns'
$icnsTypes = @{ 16 = 'icp4'; 32 = 'icp5'; 64 = 'icp6'; 128 = 'ic07'; 256 = 'ic08'; 512 = 'ic09'; 1024 = 'ic10' }
$icnsSizes = @(16, 32, 64, 128, 256, 512, 1024)
$writer = [System.IO.BinaryWriter]::new([System.IO.File]::Create($icnsPath))
try {
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
  $total = 8
  foreach ($size in $icnsSizes) { $total += 8 + $pngBytes[$size].Length }
  Write-BigEndian32 $writer $total
  foreach ($size in $icnsSizes) {
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes($icnsTypes[$size]))
    Write-BigEndian32 $writer (8 + $pngBytes[$size].Length)
    $writer.Write([byte[]]$pngBytes[$size])
  }
} finally { $writer.Dispose() }

$assetRoot = Join-Path $repoRoot 'src/assets'
foreach ($name in @('mosaico-logo.png', 'mosaico-loading-mark.png', 'logo-loading.png')) {
  $path = Join-Path $assetRoot $name
  if (Test-Path $path) {
    $existing = [System.Drawing.Image]::FromFile($path)
    try { $width = $existing.Width; $height = $existing.Height }
    finally { $existing.Dispose() }
    Save-Icon $path $width $height '#171A1D' '#F3F1EA'
  }
}

$homePath = Join-Path $assetRoot 'home-bg-right.png'
$canvas = New-Canvas 3344 1882
try {
  $canvas.Graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-Mark $canvas.Graphics 1690 80 1660 ([System.Drawing.Color]::FromArgb(210, 243, 241, 234))
  $canvas.Bitmap.Save($homePath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
}

$installerRoot = Join-Path $repoRoot 'src-tauri/installer'
foreach ($name in @('header.bmp', 'sidebar.bmp')) {
  $path = Join-Path $installerRoot $name
  $existing = [System.Drawing.Image]::FromFile($path)
  try { $width = $existing.Width; $height = $existing.Height }
  finally { $existing.Dispose() }
  Save-Banner $path $width $height ($name -eq 'sidebar.bmp')
}
