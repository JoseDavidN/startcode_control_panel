# Empaquetar e instalar StartCode Panel (app de escritorio)

Cómo sale de `DESKTOP/` lo que se reparte en cada sistema. Todos los comandos se ejecutan desde `DESKTOP/`.

| Sistema | Qué sale | Con qué |
|---|---|---|
| Windows 10/11 (x64) | `StartCode-Panel-<versión>-Instalador.exe` | `installer/` + `installer/empaquetar.ps1` |
| Linux (cualquiera) | `StartCode-Panel-<versión>-x86_64.AppImage` | `packaging/linux/appimage.sh` |
| Arch Linux | paquete `startcode-panel-git` | `packaging/linux/PKGBUILD` |
| macOS 12 o posterior | `StartCode-Panel-<versión>-macOS.dmg` y `.zip` | `packaging/macos/empaquetar.sh` |

## Antes de empaquetar

- **Versión**: no se escribe en ningún archivo de esta carpeta. Todos los scripts la leen de `project(StartCodePanel VERSION x.y.z …)` en `DESKTOP/CMakeLists.txt` (esa línea debe seguir en una sola línea). Se puede imponer otra con `-DSTARTCODE_VERSION=` (instalador), `-Version` (`empaquetar.ps1`) o la variable `STARTCODE_VERSION` (scripts de Linux y macOS).
- **API**: la app lleva dentro la URL del API (`-DSTARTCODE_API_URL=https://…/api/v1`). Sin ella queda la de desarrollo (`http://localhost:3001/api/v1`), que no sirve para repartir.
- **Compilación aparte**: empaquetar siempre desde una carpeta de compilación propia y en `Release` (por ejemplo `build-paquete/`), no desde `build/`: la de depuración lleva el conductor de pruebas.
- **Qt 6.9 o posterior** con Qt WebSockets (en el instalador de Qt es un módulo adicional).

## libvterm (Windows y macOS)

La app usa libvterm para la terminal SSH y la busca con pkg-config (`pkg_check_modules(VTERM … vterm)`). En Linux viene con el sistema (`libvterm` en Arch, `libvterm-dev` en Debian y Ubuntu). En Windows y macOS no existe, y vcpkg no la tiene (comprobado en noviembre de 2026), así que `packaging/libvterm/` la descarga (versión 0.3.3, hash fijado), la compila **estática** y deja las cabeceras, la biblioteca y `vterm.pc` en un prefijo:

```
cmake -S packaging/libvterm -B build-vterm -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=<prefijo>
cmake --build build-vterm --target install
```

Después la app se configura con ese prefijo en `CMAKE_PREFIX_PATH` (CMake pasa a pkg-config los `lib/pkgconfig` de esa lista). Al ser estática no hay DLL ni `.dylib` que repartir. No hace falta tocar `DESKTOP/CMakeLists.txt`.

Hace falta el programa `pkg-config` en el PATH:

- **Windows**: `choco install pkgconfiglite` (los equipos de GitHub Actions ya traen uno, el de Strawberry Perl).
- **macOS**: `brew install pkgconf`.

Alternativas: en macOS, `brew install libvterm` (dinámica y de una sola arquitectura: `macdeployqt` la copia dentro del `.app`, pero no vale para un binario universal); en Windows con MSYS2 existe `mingw-w64-ucrt-x86_64-libvterm`, pero el instalador de esta carpeta está pensado para MSVC (runtime de Visual C++).

## Windows: instalador

El instalador es un programa aparte (`installer/`, Win32 y GDI+, sin Qt): tiene que funcionar antes de que Qt esté en el equipo. Lleva pegado al final un ZIP con la app:

```
[instalador][ZIP][desplazamiento del ZIP: 8 bytes][«STCPANEL»]
```

Desde una consola **x64 Native Tools** de Visual Studio 2022, con el `bin` de Qt (`msvc2022_64`) en el PATH:

```
cmake -S packaging/libvterm -B build-vterm -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=%CD%\deps
cmake --build build-vterm --target install

cmake -S . -B build-paquete -G Ninja -DCMAKE_BUILD_TYPE=Release "-DCMAKE_PREFIX_PATH=C:\Qt\6.9.3\msvc2022_64;%CD%\deps" -DSTARTCODE_API_URL=https://panel.ejemplo.com/api/v1
cmake --build build-paquete

cmake -S installer -B build-instalador -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-instalador

pwsh installer/empaquetar.ps1 -Panel build-paquete/startcode-panel.exe -Instalador build-instalador/StartCodePanelInstalador.exe
```

Sale `StartCode-Panel-<versión>-Instalador.exe` en la carpeta actual (`-Salida` para otro sitio). `empaquetar.ps1` ejecuta `windeployqt --release --qmldir qml` (bibliotecas de Qt, módulos QML y plugins), añade el runtime de Visual C++ y, si libvterm se enlazó dinámica, su DLL (`-Vterm ruta\vterm.dll` si no está junto al ejecutable), y comprueba que no falte lo imprescindible.

**Icono**: el de la app, `assets/icons/app.ico` (`-DSTARTCODE_ICONO=ruta.ico` para usar otro).

### Qué hace el instalador

- **Instala para el usuario**, sin administrador: `%LOCALAPPDATA%\Programs\StartCode Panel`.
- **Accesos directos** en el menú Inicio y en el escritorio («StartCode Panel»).
- **Entrada en «Aplicaciones instaladas»** (`HKCU\…\Uninstall\StartCodePanel`: nombre, versión, editor «StartCode», icono, tamaño y desinstalador).
- **Desinstalador**: copia de sí mismo sin el paquete, `desinstalar.exe`, en la carpeta de la app. Windows lo llama con `--desinstalar`. Borra archivos, accesos directos y la entrada de Windows; **conserva la sesión y los ajustes** (QSettings: `HKCU\Software\StartCode\StartCode Panel`).
- **Con la app ya instalada** pregunta: Cancelar, Desinstalar o Actualizar (Reinstalar si es la misma versión). Al actualizar aparta la versión anterior y, si algo falla, la restaura.
- **`--actualizar <pid>`**: espera a que el proceso `<pid>` (la app) termine, instala sin preguntar y vuelve a abrirla. Es para que la app se actualice sola tras descargar el instalador; hoy la app solo avisa y abre la página de descargas, así que nadie lo usa todavía.
- Si la app está abierta, lo dice y no toca nada.

La ventana usa los colores del panel (tema Nocturno de `DESIGN.md`): fondo radial púrpura `#3d1d78 → #2a1352 → #1a0c38` con las auroras de la marca, Space Grotesk, botón primario con el degradado de la marca, secundario de cristal y peligro en rojo semántico, radio de 12 px.

**Convivencia con la app anterior (Tauri)**: su instalador NSIS usa `%LOCALAPPDATA%\StartCode Panel` y la clave `Uninstall\StartCode Panel`; este usa `Programs\StartCode Panel` y `Uninstall\StartCodePanel`, así que no se pisan, pero los accesos directos se llaman igual: quien tenga la anterior debería desinstalarla antes (si la desinstala después, se lleva los accesos directos y hay que reinstalar esta).

**Firma**: el instalador sale sin firmar (aviso de SmartScreen). Ojo: firmarlo tal cual lo rompería, porque busca la marca del paquete en los últimos 16 bytes del archivo y Authenticode añade la firma detrás. Para firmarlo habría que cambiar antes cómo `instalacion.cpp` localiza el pie (`tienePaquete` e `instalar`). Lo que sí se puede firmar sin tocar nada es `startcode-panel.exe`, antes de `empaquetar.ps1`.

## Linux: AppImage

```
cmake -S . -B build-paquete -G Ninja -DCMAKE_BUILD_TYPE=Release -DSTARTCODE_API_URL=https://panel.ejemplo.com/api/v1
cmake --build build-paquete
packaging/linux/appimage.sh build-paquete
```

Sale `StartCode-Panel-<versión>-x86_64.AppImage` en `DESKTOP/` (segundo argumento: otra carpeta). Descarga `linuxdeploy` y su plugin de Qt (versiones y hashes fijados) a `build-paquete/appimage/herramientas`, mete Qt, los módulos QML, el plugin de Wayland, el tema del portal y libvterm, y comprueba el resultado antes de empaquetar. Rechaza una compilación de depuración y avisa si el API es el de desarrollo. El AppImage pide la glibc del sistema donde se compila o una posterior.

Usa `packaging/linux/com.startcode.panel.desktop` y `assets/icons/app-512.png`.

## Arch Linux: PKGBUILD

```
mkdir -p ~/startcode-panel-pkg && cd ~/startcode-panel-pkg
cp /ruta/a/startcode_panel/DESKTOP/packaging/linux/PKGBUILD .
STARTCODE_API_URL=https://panel.ejemplo.com/api/v1 makepkg -si     # para actualizar, otra vez lo mismo
```

Compila con el Qt y la libvterm del sistema e instala con las reglas de `DESKTOP/CMakeLists.txt`: `/usr/bin/startcode-panel`, el `.desktop` y el icono. `DESKTOP/` tiene que estar ya en la rama que se clona. Para otra rama o una copia local:

```
STARTCODE_FUENTE='git+file:///ruta/a/startcode_panel#branch=dev' STARTCODE_API_URL=… makepkg -si
```

Desinstalar: `sudo pacman -Rns startcode-panel-git`.

## macOS: .dmg

```
brew install ninja pkgconf
cmake -S packaging/libvterm -B build-vterm -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PWD/deps" "-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64"
cmake --build build-vterm --target install

cmake -S . -B build-paquete -G Ninja -DCMAKE_BUILD_TYPE=Release "-DCMAKE_PREFIX_PATH=$HOME/Qt/6.9.3/macos;$PWD/deps" "-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64" -DSTARTCODE_API_URL=https://panel.ejemplo.com/api/v1
cmake --build build-paquete

STARTCODE_UNIVERSAL=1 packaging/macos/empaquetar.sh build-paquete/startcode-panel.app
```

Salen `StartCode-Panel-<versión>-macOS.dmg` (se abre y se arrastra a Aplicaciones) y `StartCode-Panel-<versión>-macOS.zip` (solo el `.app`, para actualizaciones). El script trabaja sobre una copia llamada «StartCode Panel.app»: fija identificador (`com.startcode.panel`), nombre y versión en `Info.plist`, genera el `.icns` del PNG (`sips` + `iconutil`) si el `.app` no trae uno, ejecuta `macdeployqt -qmldir=qml`, comprueba que nada apunte fuera del `.app` y firma. Sin `STARTCODE_FIRMA` la firma es ad hoc: arranca, pero Gatekeeper avisa (clic derecho → Abrir); con `STARTCODE_FIRMA="Developer ID Application: …"` firma de verdad (la notarización queda aparte).

Desinstalar: arrastrar la app a la Papelera.

## Iconos

El icono de la app está en `assets/icons/`: `app-512.png` (ventana, notificaciones, Linux), `app.ico` (ejecutable e instalador de Windows) y `app.icns` (paquete de macOS). `DESKTOP/CMakeLists.txt` ya los usa en cada plataforma. El instalador **no** se añade con `add_subdirectory`: es un proyecto aparte (CRT estático, sin Qt) que se configura con `cmake -S installer`.

## Archivos

```
installer/
├── CMakeLists.txt          proyecto del instalador de Windows (lee la versión, genera el .ico, descarga miniz)
├── src/main.cpp            ventana (GDI+), fases y argumentos
├── src/instalacion.{h,cpp} instalar, desinstalar, accesos directos y registro
├── recursos.rc.in          manifiesto, icono, fuente, logo y datos de la versión
├── instalador.manifest     sin administrador, DPI por monitor, Windows 10/11
└── empaquetar.ps1          windeployqt + runtime + ZIP pegado al instalador
packaging/
├── LEEME.md
├── libvterm/CMakeLists.txt       libvterm estática con vterm.pc (Windows y macOS)
├── windows/startcode-panel.rc.in icono y versión de startcode-panel.exe (opcional, ver arriba)
├── linux/appimage.sh             AppImage
├── linux/PKGBUILD                paquete de Arch
├── linux/com.startcode.panel.desktop
├── macos/Info.plist.in           plantilla de Info.plist (opcional, ver arriba)
└── macos/empaquetar.sh           .dmg y .zip
```
