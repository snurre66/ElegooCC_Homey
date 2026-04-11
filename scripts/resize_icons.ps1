Add-Type -AssemblyName System.Drawing
$sourcePath = "C:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\drivers\elegoo_cc\assets\images\large.png"
$largePath = "C:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\drivers\elegoo_cc\assets\images\large_new.png"
$smallPath = "C:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\drivers\elegoo_cc\assets\images\small_new.png"

$img = [System.Drawing.Image]::FromFile($sourcePath)

# Small: 75x75
$small = New-Object System.Drawing.Bitmap(75, 75)
$g1 = [System.Drawing.Graphics]::FromImage($small)
$g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g1.DrawImage($img, 0, 0, 75, 75)
$small.Save($smallPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Large: 500x500
$large = New-Object System.Drawing.Bitmap(500, 500)
$g2 = [System.Drawing.Graphics]::FromImage($large)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($img, 0, 0, 500, 500)
$large.Save($largePath, [System.Drawing.Imaging.ImageFormat]::Png)

$img.Dispose()
$large.Dispose()
$small.Dispose()

Move-Item -Path $largePath -Destination $sourcePath -Force
Move-Item -Path $smallPath -Destination "C:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\drivers\elegoo_cc\assets\images\small.png" -Force
