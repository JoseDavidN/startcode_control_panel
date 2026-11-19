# Instalador de StartCode Panel para Windows (ver src/main.cpp). Proyecto
# aparte de la app: Win32 y GDI+, sin Qt, porque se ejecuta antes de que Qt
# esté instalado. empaquetar.ps1 le pega al final el ZIP con la app.
#
#   cmake -S installer -B build-instalador -G Ninja -DCMAKE_BUILD_TYPE=Release
#   cmake --build build-instalador
cmake_minimum_required(VERSION 3.21)
project(StartCodePanelInstalador LANGUAGES C CXX)

if(NOT WIN32)
    message(FATAL_ERROR "El instalador de StartCode Panel es solo para Windows")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# CRT estático: el instalador funciona sin el runtime de Visual C++, que
# viaja dentro del paquete y aún no está en el equipo
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Versión que instala: la de project(... VERSION ...) de la app, leída de su
# CMakeLists.txt. Con -DSTARTCODE_VERSION=x.y.z se impone otra
set(STARTCODE_VERSION "" CACHE STRING "Versión de StartCode Panel que instala (vacío: la de ../CMakeLists.txt)")
if(NOT STARTCODE_VERSION)
    file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/../CMakeLists.txt" _linea_proyecto
        REGEX "^project\\(StartCodePanel[ \t]+VERSION[ \t]+[0-9.]+" LIMIT_COUNT 1)
    string(REGEX REPLACE ".*VERSION[ \t]+([0-9]+(\\.[0-9]+)*).*" "\\1" _version_leida "${_linea_proyecto}")
    if(NOT _version_leida MATCHES "^[0-9]+(\\.[0-9]+)*$")
        message(FATAL_ERROR "No se pudo leer la versión de ../CMakeLists.txt: pásala con -DSTARTCODE_VERSION=x.y.z")
    endif()
    set(STARTCODE_VERSION "${_version_leida}" CACHE STRING "" FORCE)
endif()
if(NOT STARTCODE_VERSION MATCHES "^[0-9]+\\.[0-9]+\\.[0-9]+$")
    message(FATAL_ERROR "STARTCODE_VERSION debe ser x.y.z (es «${STARTCODE_VERSION}»)")
endif()
string(REPLACE "." "," STARTCODE_VERSION_COMAS "${STARTCODE_VERSION}")
message(STATUS "Instalador de StartCode Panel ${STARTCODE_VERSION}")

# miniz (MIT): lectura de ZIP en un solo archivo de C
include(FetchContent)
FetchContent_Declare(miniz
    URL https://github.com/richgel999/miniz/releases/download/3.0.2/miniz-3.0.2.zip
    URL_HASH SHA256=ada38db0b703a56d3dd6d57bf84a9c5d664921d870d8fea4db153979fb5332c5
    # Sin CMakeLists propio: solo se descarga
    SOURCE_SUBDIR sin-cmake
)
FetchContent_MakeAvailable(miniz)
add_library(miniz STATIC ${miniz_SOURCE_DIR}/miniz.c)
target_include_directories(miniz PUBLIC ${miniz_SOURCE_DIR})

# Icono (.ico): el repositorio solo trae el PNG, así que se genera aquí con
# packaging/windows/generar-icono.ps1. Con -DSTARTCODE_ICONO=ruta se usa otro
set(STARTCODE_ICONO "" CACHE FILEPATH "Icono .ico del instalador (vacío: se genera del PNG)")
if(NOT STARTCODE_ICONO)
    set(_icono_generado "${CMAKE_CURRENT_BINARY_DIR}/startcode-panel.ico")
    set(_icono_origen "${CMAKE_CURRENT_SOURCE_DIR}/../assets/img/icono-oscuro-512.png")
    if(NOT EXISTS "${_icono_generado}" OR "${_icono_origen}" IS_NEWER_THAN "${_icono_generado}")
        find_program(STARTCODE_POWERSHELL NAMES pwsh powershell REQUIRED)
        execute_process(
            COMMAND "${STARTCODE_POWERSHELL}" -NoProfile -ExecutionPolicy Bypass
                -File "${CMAKE_CURRENT_SOURCE_DIR}/../packaging/windows/generar-icono.ps1"
                -Origen "${_icono_origen}" -Salida "${_icono_generado}"
            RESULT_VARIABLE _icono_resultado
        )
        if(NOT _icono_resultado EQUAL 0 OR NOT EXISTS "${_icono_generado}")
            message(FATAL_ERROR "No se pudo generar el icono (packaging/windows/generar-icono.ps1)")
        endif()
    endif()
    set(STARTCODE_ICONO_USADO "${_icono_generado}")
else()
    set(STARTCODE_ICONO_USADO "${STARTCODE_ICONO}")
endif()

# Recursos: manifiesto, fuente Space Grotesk (la de la interfaz por defecto)
# e icono de StartCode Panel (rutas absolutas)
set(STARTCODE_FUENTE "${CMAKE_CURRENT_SOURCE_DIR}/../assets/fonts/SpaceGrotesk.ttf")
set(STARTCODE_LOGO "${CMAKE_CURRENT_SOURCE_DIR}/../assets/img/icono-oscuro-180.png")
set(STARTCODE_MANIFIESTO "${CMAKE_CURRENT_SOURCE_DIR}/instalador.manifest")
configure_file(recursos.rc.in "${CMAKE_CURRENT_BINARY_DIR}/recursos.rc" @ONLY)

add_executable(StartCodePanelInstalador WIN32
    src/main.cpp
    src/instalacion.h
    src/instalacion.cpp
    "${CMAKE_CURRENT_BINARY_DIR}/recursos.rc"
)
target_compile_definitions(StartCodePanelInstalador PRIVATE
    UNICODE _UNICODE NOMINMAX
    # _wfopen y compañía: se usan con rutas propias, sin riesgo
    _CRT_SECURE_NO_WARNINGS
    STARTCODE_VERSION="${STARTCODE_VERSION}"
)
target_link_libraries(StartCodePanelInstalador PRIVATE
    miniz gdiplus shlwapi ole32 shell32 uuid dwmapi advapi32 user32 gdi32
)
if(MSVC)
    # Fuentes en UTF-8 (textos con tildes); el manifiesto va en recursos.rc
    target_compile_options(StartCodePanelInstalador PRIVATE /utf-8 /W4)
    target_link_options(StartCodePanelInstalador PRIVATE /MANIFEST:NO)
endif()
