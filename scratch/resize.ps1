Add-Type -AssemblyName System.Drawing
$imgObj = [System.Drawing.Image]::FromFile("C:\Users\thoma\.gemini\antigravity\brain\71bb678c-0f87-4854-8b1c-8337dd8d5f97\generic_printer_lines_1775946064676.png")
$outDir = "C:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\drivers\elegoo_cc\assets\images"
New-Item -ItemType Directory -Path $outDir -Force

$largeBmp = New-Object System.Drawing.Bitmap(500, 500)
$graph = [System.Drawing.Graphics]::FromImage($largeBmp)
$graph.DrawImage($imgObj, 0, 0, 500, 500)
$largeBmp.Save("$outDir\large.png", [System.Drawing.Imaging.ImageFormat]::Png)

$smallBmp = New-Object System.Drawing.Bitmap(75, 75)
$graph = [System.Drawing.Graphics]::FromImage($smallBmp)
$graph.DrawImage($imgObj, 0, 0, 75, 75)
$smallBmp.Save("$outDir\small.png", [System.Drawing.Imaging.ImageFormat]::Png)

$imgObj.Dispose()
$largeBmp.Dispose()
$smallBmp.Dispose()
