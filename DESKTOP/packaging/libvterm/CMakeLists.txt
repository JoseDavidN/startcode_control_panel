# libvterm para Windows y macOS, donde no viene con el sistema (en Linux se usa
# la del sistema y esto no hace falta). La app la busca con pkg-config
# (CMakeLists.txt: pkg_check_modules(VTERM … vterm)); este proyecto la descarga
# (versión y hash fijados), la compila estática y deja en el prefijo las
# cabeceras, la biblioteca y vterm.pc. Al ser estática no hay DLL ni .dylib
# que repartir con la app.
#
#   cmake -S packaging/libvterm -B build-vterm -G Ninja -DCMAKE_BUILD_TYPE=Release \
#         -DCMAKE_INSTALL_PREFIX=<prefijo>
#   cmake --build build-vterm --target install
#
# y la app se configura con -DCMAKE_PREFIX_PATH="<Qt>;<prefijo>" (más en
# packaging/LEEME.md). En macOS, con -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
# sale universal, cosa que la de Homebrew no es.
cmake_minimum_required(VERSION 3.21)
project(LibvtermStartCode VERSION 0.3.3 LANGUAGES C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# libvterm (MIT), de Paul Evans: https://www.leonerd.org.uk/code/libvterm/
# El .tar.gz ya trae generadas las tablas de src/encoding/*.inc
include(FetchContent)
FetchContent_Declare(libvterm
    URL https://launchpad.net/libvterm/trunk/v0.3/+download/libvterm-${PROJECT_VERSION}.tar.gz
        https://www.leonerd.org.uk/code/libvterm/libvterm-${PROJECT_VERSION}.tar.gz
    URL_HASH SHA256=09156f43dd2128bd347cbeebe50d9a571d32c64e0cf18d211197946aff7226e0
    # Su Makefile no se usa: solo se descarga
    SOURCE_SUBDIR sin-cmake
)
FetchContent_MakeAvailable(libvterm)

add_library(vterm STATIC
    ${libvterm_SOURCE_DIR}/src/encoding.c
    ${libvterm_SOURCE_DIR}/src/keyboard.c
    ${libvterm_SOURCE_DIR}/src/mouse.c
    ${libvterm_SOURCE_DIR}/src/parser.c
    ${libvterm_SOURCE_DIR}/src/pen.c
    ${libvterm_SOURCE_DIR}/src/screen.c
    ${libvterm_SOURCE_DIR}/src/state.c
    ${libvterm_SOURCE_DIR}/src/unicode.c
    ${libvterm_SOURCE_DIR}/src/vterm.c
)
target_include_directories(vterm PRIVATE ${libvterm_SOURCE_DIR}/include ${libvterm_SOURCE_DIR}/src)
if(MSVC)
    target_compile_definitions(vterm PRIVATE _CRT_SECURE_NO_WARNINGS _CRT_NONSTDC_NO_DEPRECATE)
endif()

include(GNUInstallDirs)
install(TARGETS vterm ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR})
install(FILES
    ${libvterm_SOURCE_DIR}/include/vterm.h
    ${libvterm_SOURCE_DIR}/include/vterm_keycodes.h
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(FILES ${libvterm_SOURCE_DIR}/LICENSE
    DESTINATION ${CMAKE_INSTALL_DATADIR}/licenses/libvterm)

# vterm.pc con rutas relativas a sí mismo (${pcfiledir}): el prefijo se puede
# mover o guardar en caché sin tocarlo
file(RELATIVE_PATH _a_prefijo
    "${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_LIBDIR}/pkgconfig" "${CMAKE_INSTALL_PREFIX}")
string(REGEX REPLACE "/+$" "" _a_prefijo "${_a_prefijo}")
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/vterm.pc"
"prefix=\${pcfiledir}/${_a_prefijo}
libdir=\${prefix}/${CMAKE_INSTALL_LIBDIR}
includedir=\${prefix}/${CMAKE_INSTALL_INCLUDEDIR}

Name: vterm
Description: Emulador de terminal VT220/xterm (biblioteca estática)
Version: ${PROJECT_VERSION}
Libs: -L\${libdir} -lvterm
Cflags: -I\${includedir}
")
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/vterm.pc" DESTINATION ${CMAKE_INSTALL_LIBDIR}/pkgconfig)
