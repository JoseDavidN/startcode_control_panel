# Crea el instalador de StartCode Panel para Windows: la app con todo lo que
# necesita (Qt, sus módulos QML y plugins, libvterm y el runtime de Visual
# C++) en un ZIP, pegado al final del instalador
# (StartCodePanelInstalador.exe) con su desplazamiento y una marca:
#
#   [instalador][ZIP][desplazamiento del ZIP: 8 bytes][«STCPANEL»]
#
# Desde una consola de Visual Studio (x64 Native Tools) con Qt en el PATH,
# tras compilar la app y el instalador (pasos completos en packaging/LEEME.md):
#   pwsh installer/empaquetar.ps1 -Panel build/startcode-panel.exe `
#        -Instalador build-instalador/StartCodePanelInstalador.exe
#
# Sale StartCode-Panel-<versión>-Instalador.exe en la carpeta actual (o donde
# diga -Salida). La versión es la de project(... VERSION ...) del
# CMakeLists.txt de la app; -Version la sustituye.
param(
    [Parameter(Mandatory)] [string] $Panel,
    [Parameter(Mandatory)] [string] $Instalador,
    [string] $Salida,
    [string] $Version,
    # Carpeta con los .qml de la app: windeployqt saca de ahí los módulos QML
    [string] $Qml = (Join-Path $PSScriptRoot "..\qml"),
    # vterm.dll, si libvterm se enlazó dinámica y no está junto al ejecutable
    [string] $Vterm
)
$ErrorActionPreference = "Stop"

$raiz = Join-Path $PSScriptRoot ".."
if (-not $Version) {
    $linea = Select-String -Path (Join-Path $raiz "CMakeLists.txt") -Pattern '^project\(StartCodePanel\s+VERSION\s+([0-9.]+)' |
        Select-Object -First 1
    if (-not $linea) { throw "No se pudo leer la versión de CMakeLists.txt: pásala con -Version" }
    $Version = $linea.Matches[0].Groups[1].Value
}
if (-not $Salida) { $Salida = "StartCode-Panel-$Version-Instalador.exe" }
if (-not (Test-Path $Panel)) { throw "No está ${Panel}: compila antes la app" }
if (-not (Test-Path $Instalador)) { throw "No está ${Instalador}: compila antes el instalador (cmake -S installer)" }

$temporal = Join-Path ([IO.Path]::GetTempPath()) ("startcode-panel-paquete-" + [Guid]::NewGuid())
$carpeta = Join-Path $temporal "StartCode Panel"
New-Item -ItemType Directory -Path $carpeta | Out-Null

try {
    # La app, con el nombre que espera el instalador (instalacion.cpp), y las
    # bibliotecas de Qt que usa: módulos QML (QtQuick, Controls, Layouts,
    # Dialogs, Effects, Shapes…), plugins (plataforma, imágenes, TLS) y
    # traducciones
    $exe = Join-Path $carpeta "startcode-panel.exe"
    Copy-Item $Panel $exe
    & windeployqt --release --qmldir $Qml --no-compiler-runtime $exe
    if ($LASTEXITCODE -ne 0) { throw "windeployqt falló" }

    # libvterm: windeployqt solo copia lo de Qt. Enlazada estática (lo que
    # deja packaging/libvterm) no hay nada que copiar; dinámica, su DLL va
    # junto al ejecutable
    $origen = Split-Path -Parent (Resolve-Path $Panel)
    if ($Vterm) {
        Copy-Item $Vterm $carpeta
    } else {
        Get-ChildItem $origen -Filter "*vterm*.dll" | Copy-Item -Destination $carpeta
    }
    # Con dumpbin (consola de Visual Studio) se comprueba que no falte
    if (Get-Command dumpbin -ErrorAction SilentlyContinue) {
        $dependencias = & dumpbin /nologo /dependents $exe |
            ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\S+\.dll$' }
        foreach ($dll in $dependencias) {
            if ($dll -match 'vterm' -and -not (Test-Path (Join-Path $carpeta $dll))) {
                throw "startcode-panel.exe necesita $dll y no está en el paquete: pásala con -Vterm"
            }
        }
    }

    # Runtime de Visual C++ junto al ejecutable (despliegue local, sin
    # instalar vc_redist): VCToolsRedistDir lo define la consola de Visual Studio
    if (-not $env:VCToolsRedistDir) { throw "Falta VCToolsRedistDir: usa una consola de Visual Studio" }
    $runtime = Get-ChildItem (Join-Path $env:VCToolsRedistDir "x64") -Directory -Filter "Microsoft.VC*.CRT" | Select-Object -First 1
    if (-not $runtime) { throw "No se encontró el runtime de Visual C++ en $env:VCToolsRedistDir" }
    Copy-Item (Join-Path $runtime.FullName "*.dll") $carpeta

    # Lo imprescindible para que la app arranque en un equipo sin Qt
    foreach ($necesario in "Qt6Quick.dll", "Qt6QuickControls2.dll", "Qt6WebSockets.dll", "Qt6Network.dll",
                           "plugins\platforms\qwindows.dll", "qml\QtQuick\Controls", "qml\QtQuick\Layouts") {
        $ruta = Join-Path $carpeta $necesario
        # windeployqt deja los plugins en la raíz (platforms\) o en plugins\, según la versión
        $alternativa = Join-Path $carpeta ($necesario -replace '^plugins\\', '')
        if (-not (Test-Path $ruta) -and -not (Test-Path $alternativa)) {
            throw "Falta en el paquete: $necesario (¿windeployqt es el del Qt con el que se compiló?)"
        }
    }

    # Licencias, si el proyecto las trae
    foreach ($licencia in "LICENSE", "licencias") {
        $ruta = Join-Path $raiz $licencia
        if (Test-Path $ruta) { Copy-Item $ruta $carpeta -Recurse }
    }

    # Comprimido con 7-Zip (en los equipos de GitHub Actions) o, si no está,
    # con PowerShell (más lento)
    $zip = Join-Path $temporal "StartCodePanel.zip"
    if (Get-Command 7z -ErrorAction SilentlyContinue) {
        & 7z a -tzip -mx=7 $zip (Join-Path $carpeta "*") | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "7z falló" }
    } else {
        Compress-Archive -Path (Join-Path $carpeta "*") -DestinationPath $zip -CompressionLevel Optimal
    }

    # Instalador + ZIP + pie
    Copy-Item $Instalador $Salida -Force
    $inicio = (Get-Item $Salida).Length
    $flujo = [IO.File]::Open((Resolve-Path $Salida), [IO.FileMode]::Append)
    try {
        $entrada = [IO.File]::OpenRead($zip)
        try { $entrada.CopyTo($flujo) } finally { $entrada.Dispose() }
        [byte[]] $pie = [BitConverter]::GetBytes([Int64]$inicio) + [Text.Encoding]::ASCII.GetBytes("STCPANEL")
        $flujo.Write($pie, 0, $pie.Length)
    } finally {
        $flujo.Dispose()
    }
    $mb = [Math]::Round((Get-Item $Salida).Length / 1MB)
    Write-Host "Instalador creado: $Salida ($mb MB)"
} finally {
    Remove-Item -Recurse -Force $temporal -ErrorAction SilentlyContinue
}
