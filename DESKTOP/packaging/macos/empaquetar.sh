#!/usr/bin/env bash
# Crea el .dmg (y el .zip) de StartCode Panel para macOS a partir de una
# compilación ya hecha (cmake --build): Qt, sus módulos QML y libvterm van
# dentro de «StartCode Panel.app»; el .dmg se abre y se arrastra a Aplicaciones.
#
#   packaging/macos/empaquetar.sh [ruta del .app compilado] [carpeta de salida]
#   (por defecto: build/startcode-panel.app o «build/StartCode Panel.app», y
#   la carpeta DESKTOP/)
#
# Salen StartCode-Panel-<versión>-macOS.dmg y StartCode-Panel-<versión>-macOS.zip.
# Necesita macdeployqt (en el PATH o en QT_ROOT_DIR/bin) y las herramientas de
# Xcode (sips, iconutil, codesign, hdiutil). El .app compilado no se toca: se
# trabaja sobre una copia.
#
# Variables de entorno:
#   STARTCODE_VERSION    versión del paquete (por defecto, la de CMakeLists.txt)
#   STARTCODE_UNIVERSAL  1: falla si el ejecutable no trae arm64 y x86_64
#   STARTCODE_FIRMA      identidad de codesign («Developer ID Application: …»);
#                        sin ella, firma ad hoc (arranca, pero Gatekeeper avisa)

set -euo pipefail

AQUI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RAIZ=$(cd "$AQUI/../.." && pwd)
NOMBRE="StartCode Panel"
ID=com.startcode.panel

if [[ $(uname -s) != Darwin ]]; then
    echo "Este script es solo para macOS." >&2
    exit 1
fi

ORIGEN=${1:-}
if [[ -z $ORIGEN ]]; then
    for candidata in "$RAIZ/build/$NOMBRE.app" "$RAIZ/build/startcode-panel.app"; do
        if [[ -d $candidata ]]; then
            ORIGEN=$candidata
            break
        fi
    done
fi
if [[ -z $ORIGEN || ! -d $ORIGEN ]]; then
    echo "No está el .app: compila antes (cmake --build) o pasa su ruta." >&2
    exit 1
fi
SALIDA=$(mkdir -p "${2:-$RAIZ}" && cd "${2:-$RAIZ}" && pwd)

VERSION=${STARTCODE_VERSION:-$(sed -n 's/^project(StartCodePanel[[:space:]]\{1,\}VERSION[[:space:]]\{1,\}\([0-9.]*\).*/\1/p' "$RAIZ/CMakeLists.txt" | head -1)}
if [[ -z $VERSION ]]; then
    echo "No se pudo leer la versión de $RAIZ/CMakeLists.txt: pásala en STARTCODE_VERSION." >&2
    exit 1
fi

MACDEPLOYQT=$(command -v macdeployqt || true)
if [[ -z $MACDEPLOYQT && -n ${QT_ROOT_DIR:-} && -x $QT_ROOT_DIR/bin/macdeployqt ]]; then
    MACDEPLOYQT=$QT_ROOT_DIR/bin/macdeployqt
fi
if [[ -z $MACDEPLOYQT ]]; then
    echo "No se encuentra macdeployqt: pon el bin de Qt en el PATH o indica QT_ROOT_DIR." >&2
    exit 1
fi

TRABAJO=$(mktemp -d "${TMPDIR:-/tmp}/startcode-panel-paquete.XXXXXX")
trap 'rm -rf "$TRABAJO"' EXIT
CONTENIDO=$TRABAJO/contenido
APP=$CONTENIDO/$NOMBRE.app
mkdir -p "$CONTENIDO"
# ditto conserva enlaces simbólicos y permisos
ditto "$ORIGEN" "$APP"

PLIST=$APP/Contents/Info.plist
plist() { # clave valor: la cambia o, si no está, la añade
    /usr/libexec/PlistBuddy -c "Set :$1 '$2'" "$PLIST" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Add :$1 string '$2'" "$PLIST"
}
EJECUTABLE=$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$PLIST")
if [[ ! -x $EJECUTABLE ]]; then
    echo "No está el ejecutable de $ORIGEN." >&2
    exit 1
fi

# Datos del paquete: valen aunque el CMakeLists.txt no los haya puesto
plist CFBundleIdentifier "$ID"
plist CFBundleName "$NOMBRE"
plist CFBundleDisplayName "$NOMBRE"
plist CFBundleShortVersionString "$VERSION"
plist CFBundleVersion "$VERSION"

# Icono (.icns): el repositorio solo trae el PNG de 512 px, así que se genera
# aquí si el .app no trae ya uno
mkdir -p "$APP/Contents/Resources"
if ! compgen -G "$APP/Contents/Resources/*.icns" >/dev/null; then
    PNG=$RAIZ/assets/icons/app-512.png
    ICONOS=$TRABAJO/startcode-panel.iconset
    mkdir -p "$ICONOS"
    for lado in 16 32 128 256; do
        sips -z "$lado" "$lado" "$PNG" --out "$ICONOS/icon_${lado}x${lado}.png" >/dev/null
        doble=$((lado * 2))
        sips -z "$doble" "$doble" "$PNG" --out "$ICONOS/icon_${lado}x${lado}@2x.png" >/dev/null
    done
    cp "$PNG" "$ICONOS/icon_512x512.png"
    iconutil -c icns "$ICONOS" -o "$APP/Contents/Resources/startcode-panel.icns"
    plist CFBundleIconFile startcode-panel.icns
fi

# Licencias, si el proyecto las trae
for licencia in "$RAIZ/LICENSE" "$RAIZ/../LICENSE"; do
    if [[ -f $licencia ]]; then
        cp "$licencia" "$APP/Contents/Resources/"
        break
    fi
done

# Qt (frameworks, plugins y los módulos QML que importan los .qml) y las demás
# bibliotecas que enlaza el ejecutable (libvterm, si es dinámica)
"$MACDEPLOYQT" "$APP" -qmldir="$RAIZ/qml"

# Nada debe seguir apuntando a Homebrew ni a la carpeta de Qt: en otro Mac no existen
if otool -L "$EJECUTABLE" | tail -n +2 | grep -E '^[[:space:]]*(/opt/|/usr/local/|/Users/)'; then
    echo "El ejecutable aún depende de bibliotecas de fuera del .app (líneas de arriba)." >&2
    exit 1
fi
for necesario in Contents/Frameworks/QtQuick.framework \
                 Contents/Frameworks/QtWebSockets.framework \
                 Contents/PlugIns/platforms/libqcocoa.dylib \
                 Contents/PlugIns/tls \
                 Contents/Resources/qml/QtQuick/Controls; do
    if [[ ! -e $APP/$necesario ]]; then
        echo "Falta en el .app: $necesario" >&2
        exit 1
    fi
done

ARQUITECTURAS=$(lipo -archs "$EJECUTABLE")
echo "Arquitecturas: $ARQUITECTURAS"
if [[ ${STARTCODE_UNIVERSAL:-0} == 1 ]]; then
    for a in arm64 x86_64; do
        case " $ARQUITECTURAS " in
            *" $a "*) ;;
            *) echo "El ejecutable no incluye $a ($ARQUITECTURAS)." >&2; exit 1 ;;
        esac
    done
fi

# Firma: macdeployqt cambia los binarios y en Apple Silicon uno sin firma
# válida no arranca. La ad hoc (sin certificado) no evita el aviso de
# Gatekeeper: eso pide firma de Apple y notarización
if [[ -n ${STARTCODE_FIRMA:-} ]]; then
    codesign --force --deep --options runtime --timestamp --sign "$STARTCODE_FIRMA" "$APP"
else
    codesign --force --deep --sign - "$APP"
fi
codesign --verify --deep --strict "$APP"

# .dmg: la app y un acceso a Aplicaciones para arrastrarla
DMG=$SALIDA/StartCode-Panel-$VERSION-macOS.dmg
ZIP=$SALIDA/StartCode-Panel-$VERSION-macOS.zip
rm -f "$DMG" "$ZIP"
# El .zip, antes de añadir el acceso a Aplicaciones: solo la app, comprimida
# con ditto (conserva enlaces, permisos y la firma)
ditto -c -k --keepParent "$APP" "$ZIP"
ln -s /Applications "$CONTENIDO/Aplicaciones"
hdiutil create -volname "$NOMBRE" -srcfolder "$CONTENIDO" -ov -format UDZO "$DMG"

echo "Creados: $DMG y $ZIP"
