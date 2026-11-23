#!/usr/bin/env bash
# Crea el AppImage de StartCode Panel a partir de una compilación ya hecha
# (cmake --build). Vale en cualquier Linux con el Qt de la compilación en el
# PATH (qmake) o en QT_ROOT_DIR, y en GitHub Actions (ubuntu-24.04).
#
#   packaging/linux/appimage.sh [carpeta de compilación] [carpeta de salida]
#   (por defecto: build/ y la carpeta DESKTOP/)
#
# La compilación debe ser de Release y con el API real
# (-DCMAKE_BUILD_TYPE=Release -DSTARTCODE_API_URL=…): ver packaging/LEEME.md.
#
# Sale StartCode-Panel-<versión>-x86_64.AppImage, con Qt y libvterm dentro:
# quien lo descarga no necesita instalar nada. Pide la glibc del sistema en el
# que se compila o una posterior: para que valga en más distribuciones,
# compilar en la más antigua que se quiera admitir.
#
# Qué hace cada pieza:
#   linuxdeploy             copia el ejecutable y sus bibliotecas (Qt, libvterm…)
#                           al AppDir y crea el AppImage (plugin appimage, que
#                           lleva dentro).
#   linuxdeploy-plugin-qt   añade lo de Qt: plugins (xcb, imageformats, tls…) y
#                           los módulos QML que importan los .qml de qml/
#                           (QML_SOURCES_PATHS: van compilados dentro del
#                           ejecutable y sin esto no los encontraría).

set -euo pipefail

# Versiones fijadas de las herramientas (https://github.com/linuxdeploy)
LINUXDEPLOY_VERSION=1-alpha-20251107-1
LINUXDEPLOY_SHA256=c20cd71e3a4e3b80c3483cef793cda3f4e990aca14014d23c544ca3ce1270b4d
PLUGIN_QT_VERSION=1-alpha-20250213-1
# GitHub no publica el hash de esta versión: es el sha256sum de la descarga
PLUGIN_QT_SHA256=15106be885c1c48a021198e7e1e9a48ce9d02a86dd0a1848f00bdbf3c1c92724

AQUI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RAIZ=$(cd "$AQUI/../.." && pwd)
COMPILACION=$(cd "${1:-$RAIZ/build}" && pwd)
SALIDA=$(mkdir -p "${2:-$RAIZ}" && cd "${2:-$RAIZ}" && pwd)
TRABAJO=$COMPILACION/appimage
APPDIR=$TRABAJO/AppDir
HERRAMIENTAS=$TRABAJO/herramientas

# La versión es la de project(... VERSION ...) del CMakeLists.txt de la app;
# STARTCODE_VERSION la sustituye
VERSION=${STARTCODE_VERSION:-$(sed -n 's/^project(StartCodePanel[[:space:]]\{1,\}VERSION[[:space:]]\{1,\}\([0-9.]*\).*/\1/p' "$RAIZ/CMakeLists.txt" | head -1)}
if [[ -z $VERSION ]]; then
    echo "No se pudo leer la versión de $RAIZ/CMakeLists.txt: pásala en STARTCODE_VERSION." >&2
    exit 1
fi
ARCH=x86_64
NOMBRE=StartCode-Panel-$VERSION-$ARCH.AppImage

if [[ ! -x $COMPILACION/startcode-panel ]]; then
    echo "No está $COMPILACION/startcode-panel: compila antes (cmake --build)." >&2
    exit 1
fi

# Lo que se reparte no es una compilación de depuración (lleva el conductor de
# pruebas) ni apunta al API de desarrollo
cache() { sed -n "s/^$1:[A-Z]*=//p" "$COMPILACION/CMakeCache.txt" 2>/dev/null | head -1; }
if [[ $(cache CMAKE_BUILD_TYPE) == Debug && ${STARTCODE_PERMITIR_DEBUG:-0} != 1 ]]; then
    echo "$COMPILACION es una compilación de depuración: usa otra carpeta con -DCMAKE_BUILD_TYPE=Release" >&2
    echo "(o STARTCODE_PERMITIR_DEBUG=1 para empaquetarla igualmente)." >&2
    exit 1
fi
case $(cache STARTCODE_API_URL) in
    *localhost* | *127.0.0.1*)
        echo "Aviso: la app se compiló con el API de desarrollo ($(cache STARTCODE_API_URL));" >&2
        echo "para repartirla, configura con -DSTARTCODE_API_URL=https://…/api/v1" >&2
        ;;
esac

# El plugin de Qt usa qmake para saber dónde está Qt. install-qt-action deja
# QT_ROOT_DIR; si no, el qmake del PATH.
if [[ -z ${QMAKE:-} ]]; then
    if [[ -n ${QT_ROOT_DIR:-} && -x $QT_ROOT_DIR/bin/qmake ]]; then
        export QMAKE=$QT_ROOT_DIR/bin/qmake
    else
        QMAKE=$(command -v qmake6 || command -v qmake || true)
        export QMAKE
    fi
fi
if [[ -z $QMAKE ]]; then
    echo "No se encuentra qmake: ponlo en el PATH o indica QMAKE o QT_ROOT_DIR." >&2
    exit 1
fi
echo "Qt: $("$QMAKE" -query QT_VERSION) ($QMAKE)"

# Las herramientas son AppImages: así se ejecutan sin FUSE
export APPIMAGE_EXTRACT_AND_RUN=1

descargar() { # nombre versión repositorio sha256
    local destino=$HERRAMIENTAS/$1
    if [[ ! -x $destino ]]; then
        curl -fsSL -o "$destino" "https://github.com/linuxdeploy/$3/releases/download/$2/$1"
        chmod +x "$destino"
    fi
    echo "$4  $destino" | sha256sum -c --quiet -
}
mkdir -p "$HERRAMIENTAS"
descargar linuxdeploy-$ARCH.AppImage "$LINUXDEPLOY_VERSION" linuxdeploy "$LINUXDEPLOY_SHA256"
descargar linuxdeploy-plugin-qt-$ARCH.AppImage "$PLUGIN_QT_VERSION" linuxdeploy-plugin-qt "$PLUGIN_QT_SHA256"
# linuxdeploy busca los plugins en el PATH y junto a sí mismo
export PATH=$HERRAMIENTAS:$PATH

# AppDir limpio en cada ejecución
rm -rf "$APPDIR"
mkdir -p "$APPDIR"

# El icono se llama como dice el .desktop (Icon=com.startcode.panel)
cp "$RAIZ/assets/icons/app-512.png" "$TRABAJO/com.startcode.panel.png"

# Variables del plugin de Qt. Lo enlazado (Quick, Controls, Network,
# WebSockets, DBus) lo detecta solo; los módulos QML, por los .qml
export QML_SOURCES_PATHS=$RAIZ/qml

# 1) Ejecutable, bibliotecas (libvterm incluida) y Qt
linuxdeploy-$ARCH.AppImage \
    --appdir "$APPDIR" \
    --executable "$COMPILACION/startcode-panel" \
    --desktop-file "$AQUI/com.startcode.panel.desktop" \
    --icon-file "$TRABAJO/com.startcode.panel.png" \
    --plugin qt

# 1b) Wayland (Hyprland, GNOME, KDE…): sin su plugin, la app iría por XWayland
# (borrosa con escala); y el tema del portal, para los diálogos de archivos
# del escritorio (descargas y subidas por SFTP). El plugin de Qt solo copia
# xcb, así que se copia a mano del Qt de la compilación
# (platforms/libqwayland.so y sus carpetas wayland-*) y linuxdeploy añade lo
# que enlazan (libQt6WaylandClient, libwayland-*)
QT_PLUGINS=$("$QMAKE" -query QT_INSTALL_PLUGINS)
if [[ -f $QT_PLUGINS/platforms/libqwayland.so ]]; then
    WAYLAND=("$APPDIR/usr/plugins/platforms/libqwayland.so")
    install -Dm755 "$QT_PLUGINS/platforms/libqwayland.so" "$APPDIR/usr/plugins/platforms/libqwayland.so"
    for carpeta in "$QT_PLUGINS"/wayland-*; do
        [[ -d $carpeta ]] || continue
        cp -r "$carpeta" "$APPDIR/usr/plugins/"
        WAYLAND+=("$APPDIR/usr/plugins/$(basename "$carpeta")")
    done
    if [[ -f $QT_PLUGINS/platformthemes/libqxdgdesktopportal.so ]]; then
        install -Dm755 "$QT_PLUGINS/platformthemes/libqxdgdesktopportal.so" \
            "$APPDIR/usr/plugins/platformthemes/libqxdgdesktopportal.so"
        WAYLAND+=("$APPDIR/usr/plugins/platformthemes/libqxdgdesktopportal.so")
    fi
    DEPS=()
    for ruta in "${WAYLAND[@]}"; do DEPS+=(--deploy-deps-only "$ruta"); done
    linuxdeploy-$ARCH.AppImage --appdir "$APPDIR" "${DEPS[@]}"
else
    echo "Aviso: el Qt de $QT_PLUGINS no trae Wayland; el AppImage irá por XWayland" >&2
fi

# 2) Comprobar lo que la app necesita en tiempo de ejecución: la plataforma,
# TLS (el API y el socket van por https/wss), los módulos QML y libvterm
falta=0
for f in usr/bin/startcode-panel \
         usr/plugins/platforms/libqxcb.so \
         usr/plugins/tls \
         usr/qml/QtQuick/Controls \
         usr/qml/QtQuick/Layouts \
         usr/qml/QtQuick/Templates \
         usr/qml/QtQuick/Dialogs \
         usr/qml/QtQuick/Effects \
         usr/qml/QtQuick/Shapes \
         usr/share/applications/com.startcode.panel.desktop; do
    if [[ ! -e $APPDIR/$f ]]; then
        echo "Falta en el AppDir: $f" >&2
        falta=1
    fi
done
if ! compgen -G "$APPDIR/usr/lib/libvterm.so*" >/dev/null \
    && ldd "$COMPILACION/startcode-panel" | grep -q 'libvterm\.so'; then
    echo "Falta en el AppDir: usr/lib/libvterm.so*" >&2
    falta=1
fi
[[ $falta == 0 ]] || exit 1

# Licencias, si el proyecto las trae
for licencia in "$RAIZ/LICENSE" "$RAIZ/../LICENSE"; do
    if [[ -f $licencia ]]; then
        install -Dm644 "$licencia" "$APPDIR/usr/share/licenses/startcode-panel/LICENSE"
        break
    fi
done

# 3) Empaquetar (plugin appimage de linuxdeploy)
export LDAI_OUTPUT=$SALIDA/$NOMBRE
export OUTPUT=$LDAI_OUTPUT            # nombre que usan las versiones antiguas del plugin
export LINUXDEPLOY_OUTPUT_VERSION=$VERSION
linuxdeploy-$ARCH.AppImage --appdir "$APPDIR" --output appimage

echo "Creado: $SALIDA/$NOMBRE"
