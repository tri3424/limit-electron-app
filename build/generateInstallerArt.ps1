$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$headerWidth = 150
$headerHeight = 57
$sidebarWidth = 164
$sidebarHeight = 314
$headerBmp = New-Object System.Drawing.Bitmap ($headerWidth, $headerHeight)
$headerG = [System.Drawing.Graphics]::FromImage($headerBmp)
$headerRect = New-Object System.Drawing.RectangleF(0, 0, $headerWidth, $headerHeight)
$headerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($headerRect, [System.Drawing.Color]::FromArgb(255,6,95,70), [System.Drawing.Color]::FromArgb(255,22,163,74), [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
$headerG.FillRectangle($headerBrush, 0, 0, $headerWidth, $headerHeight)
$headerFont = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$headerTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$headerG.DrawString('Limit Installer', $headerFont, $headerTextBrush, 10, 15)
$headerBmp.Save('build/installer-header.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$headerG.Dispose(); $headerBmp.Dispose()
$sidebarBmp = New-Object System.Drawing.Bitmap ($sidebarWidth, $sidebarHeight)
$sidebarG = [System.Drawing.Graphics]::FromImage($sidebarBmp)
$sidebarRect = New-Object System.Drawing.RectangleF(0, 0, $sidebarWidth, $sidebarHeight)
$sidebarBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($sidebarRect, [System.Drawing.Color]::FromArgb(255,5,47,34), [System.Drawing.Color]::FromArgb(255,16,122,72), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$sidebarG.FillRectangle($sidebarBrush, 0, 0, $sidebarWidth, $sidebarHeight)
$iconPath = 'build/icon.ico'
if (Test-Path $iconPath) {
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path $iconPath))
  if ($icon) {
    $sidebarG.DrawIcon($icon, 46, 32)
    $icon.Dispose()
  }
}
$sidebarFont = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$sidebarSubFont = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular)
$sidebarTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sidebarG.DrawString('Limit', $sidebarFont, $sidebarTextBrush, 46, 140)
$sidebarG.DrawString('Study Companion', $sidebarSubFont, $sidebarTextBrush, 46, 178)
$sidebarBmp.Save('build/installer-sidebar.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$sidebarG.Dispose(); $sidebarBmp.Dispose()
