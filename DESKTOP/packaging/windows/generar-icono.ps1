# Genera el icono de Windows (.ico) de StartCode Panel a partir del PNG del
# repositorio (assets/img/icono-oscuro-512.png). El .ico no se guarda en el
# repositorio: lo crea installer/CMakeLists.txt al configurar, y el
# CMakeLists.txt de la app puede hacer lo mismo (ver packaging/LEEME.md).
#
#   pwsh packaging/windows/generar-icono.ps1 [-Origen <png>] [-Salida <ico>]
#
# Solo Windows (System.Drawing). Tamaños: 16, 20, 24, 32, 40, 48, 64 y 128 px
# como mapa de bits de 32 bits y 256 px como PNG, que es como Windows los
# espera en un .ico.
param(
    [string] $Origen = (Join-Path $PSScriptRoot "..\..\assets\img\icono-oscuro-512.png"),
    [string] $Salida = (Join-Path $PSScriptRoot "startcode-panel.ico")
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$tamanos = 16, 20, 24, 32, 40, 48, 64, 128, 256
$original = [System.Drawing.Image]::FromFile((Resolve-Path $Origen))
$imagenes = @()
try {
    foreach ($lado in $tamanos) {
        $mapa = New-Object System.Drawing.Bitmap($lado, $lado, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $g = [System.Drawing.Graphics]::FromImage($mapa)
            try {
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $g.Clear([System.Drawing.Color]::Transparent)
                $g.DrawImage($original, 0, 0, $lado, $lado)
            } finally {
                $g.Dispose()
            }

            $memoria = New-Object System.IO.MemoryStream
            if ($lado -ge 256) {
                $mapa.Save($memoria, [System.Drawing.Imaging.ImageFormat]::Png)
            } else {
                # Mapa de bits de icono: cabecera BITMAPINFOHEADER con el doble
                # de alto, píxeles BGRA de abajo arriba y la máscara (a ceros:
                # con 32 bits manda el canal alfa)
                $zona = New-Object System.Drawing.Rectangle(0, 0, $lado, $lado)
                $bits = $mapa.LockBits($zona, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                try {
                    $pixeles = New-Object byte[] ($lado * $lado * 4)
                    for ($fila = 0; $fila -lt $lado; $fila++) {
                        $desde = [IntPtr]::Add($bits.Scan0, $fila * $bits.Stride)
                        [System.Runtime.InteropServices.Marshal]::Copy($desde, $pixeles, ($lado - 1 - $fila) * $lado * 4, $lado * 4)
                    }
                } finally {
                    $mapa.UnlockBits($bits)
                }
                $filaMascara = [int]([Math]::Floor(($lado + 31) / 32)) * 4
                $mascara = New-Object byte[] ($filaMascara * $lado)
                $escritor = New-Object System.IO.BinaryWriter($memoria)
                $escritor.Write([UInt32]40)                 # biSize
                $escritor.Write([Int32]$lado)               # biWidth
                $escritor.Write([Int32]($lado * 2))         # biHeight: imagen + máscara
                $escritor.Write([UInt16]1)                  # biPlanes
                $escritor.Write([UInt16]32)                 # biBitCount
                $escritor.Write([UInt32]0)                  # biCompression: BI_RGB
                $escritor.Write([UInt32]($pixeles.Length + $mascara.Length)) # biSizeImage
                $escritor.Write([Int32]0)                   # biXPelsPerMeter
                $escritor.Write([Int32]0)                   # biYPelsPerMeter
                $escritor.Write([UInt32]0)                  # biClrUsed
                $escritor.Write([UInt32]0)                  # biClrImportant
                $escritor.Write([byte[]]$pixeles)
                $escritor.Write([byte[]]$mascara)
                $escritor.Flush()
            }
            $imagenes += , @{ Lado = $lado; Datos = $memoria.ToArray() }
            $memoria.Dispose()
        } finally {
            $mapa.Dispose()
        }
    }
} finally {
    $original.Dispose()
}

# .ico: cabecera (6 bytes), una entrada de 16 bytes por imagen y las imágenes
$carpeta = Split-Path -Parent $Salida
if ($carpeta -and -not (Test-Path $carpeta)) { New-Item -ItemType Directory -Path $carpeta | Out-Null }
$archivo = [System.IO.File]::Create($Salida)
try {
    $ico = New-Object System.IO.BinaryWriter($archivo)
    $ico.Write([UInt16]0)                   # reservado
    $ico.Write([UInt16]1)                   # tipo: icono
    $ico.Write([UInt16]$imagenes.Count)
    $posicion = 6 + 16 * $imagenes.Count
    foreach ($imagen in $imagenes) {
        # 256 px se escribe como 0
        $lado = if ($imagen.Lado -ge 256) { 0 } else { $imagen.Lado }
        $ico.Write([Byte]$lado)             # ancho
        $ico.Write([Byte]$lado)             # alto
        $ico.Write([Byte]0)                 # colores de la paleta
        $ico.Write([Byte]0)                 # reservado
        $ico.Write([UInt16]1)               # planos
        $ico.Write([UInt16]32)              # bits por píxel
        $ico.Write([UInt32]$imagen.Datos.Length)
        $ico.Write([UInt32]$posicion)
        $posicion += $imagen.Datos.Length
    }
    foreach ($imagen in $imagenes) { $ico.Write([byte[]]$imagen.Datos) }
    $ico.Flush()
} finally {
    $archivo.Dispose()
}
Write-Host "Icono creado: $Salida ($($imagenes.Count) tamaños)"
