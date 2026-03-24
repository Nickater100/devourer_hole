Add-Type -AssemblyName System.Drawing
$bmp = new-object System.Drawing.Bitmap 1024, 500
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 10, 20, 40))
$icon = [System.Drawing.Image]::FromFile("C:\Users\nicos\OneDrive\Escritorio\devourer_hole\resources\icon.png")
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconSize = 350
$x = (1024 - $iconSize) / 2
$y = (500 - $iconSize) / 2
$g.DrawImage($icon, $x, $y, $iconSize, $iconSize)
$g.Dispose()
$icon.Dispose()
$bmp.Save("C:\Users\nicos\OneDrive\Escritorio\devourer_hole\resources\feature_v2.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
