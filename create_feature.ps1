Add-Type -AssemblyName System.Drawing
$bmp = new-object System.Drawing.Bitmap 1024, 500
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 15, 30, 50))
$icon = [System.Drawing.Image]::FromFile('C:\Users\nicos\OneDrive\Escritorio\devourer_hole\resources\icon.png')
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($icon, 200, 100, 300, 300)
$font = new-object System.Drawing.Font('Arial', 60, [System.Drawing.FontStyle]::Bold)
$brush = new-object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.DrawString('ANGRY BALL', $font, $brush, 540, 200)
$g.Dispose()
$icon.Dispose()
$bmp.Save('C:\Users\nicos\OneDrive\Escritorio\devourer_hole\resources\feature_graphic.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
