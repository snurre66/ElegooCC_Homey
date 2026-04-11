Add-Type -AssemblyName System.Drawing
$sourcePath = "C:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\drivers\elegoo_cc\assets\images\large.png"
$rootImgDir = "C:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\assets\images"

if (!(Test-Path $rootImgDir)) { New-Item -ItemType Directory -Path $rootImgDir }

$img = [System.Drawing.Image]::FromFile($sourcePath)

# Root App Store Small: 250 x 175
$small = New-Object System.Drawing.Bitmap(250, 175)
$g1 = [System.Drawing.Graphics]::FromImage($small)
$g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g1.DrawImage($img, 0, 0, 250, 175)
$small.Save("$rootImgDir\small.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Root App Store Large: 500 x 350 (Correction!)
$large = New-Object System.Drawing.Bitmap(500, 350)
$g2 = [System.Drawing.Graphics]::FromImage($large)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($img, 0, 0, 500, 350)
$large.Save("$rootImgDir\large.png", [System.Drawing.Imaging.ImageFormat]::Png)

$img.Dispose()
$large.Dispose()
$small.Dispose()
