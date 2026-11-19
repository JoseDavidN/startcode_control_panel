#pragma once

#include <functional>
#include <string>

// Lo que hace el instalador, sin interfaz. Cada función informa del avance
// (0 a 1) por `avance`, desde el hilo en el que se la llame, y devuelve ""
// si todo fue bien o el error en español, listo para mostrar.
//
// StartCode Panel se instala para el usuario, sin permisos de administrador:
// en %LOCALAPPDATA%\Programs\StartCode Panel, con accesos directos en el menú
// Inicio y el escritorio y su entrada en «Aplicaciones instaladas».

using Avance = std::function<void(double)>;

// Carpeta donde se instala StartCode Panel ("" si Windows no da la de programas del usuario)
std::wstring carpetaInstalacion();

// Lo que hay instalado, según lo que deja instalar(): la entrada de
// «Aplicaciones instaladas» en el registro o startcode-panel.exe en su carpeta
struct Instalada {
    bool hay = false;
    std::wstring version; // DisplayVersion; "" si no se sabe
};
Instalada instalacionExistente();

// Si el ejecutable lleva el paquete pegado (el instalador) o no (el
// desinstalador que se copia en la carpeta de la app)
bool tienePaquete(const std::wstring &ejecutable);

// Si el ejecutable está dentro de la carpeta de instalación (el desinstalador)
bool dentroDeInstalacion(const std::wstring &ejecutable);

// Instala el paquete que lleva el propio ejecutable `instalador` (ver
// empaquetar.ps1: el ZIP va pegado al final del .exe, con una marca)
std::wstring instalar(const std::wstring &instalador, const Avance &avance);

// Quita StartCode Panel: archivos, accesos directos y la entrada de Windows.
// La sesión y los ajustes del usuario (QSettings: en el registro, bajo
// HKCU\Software\StartCode\StartCode Panel) se conservan.
// Desde fuera de la carpeta (el instalador) la borra entera al momento; desde
// dentro (desinstalar.exe), la carpeta se borra cuando el proceso termina.
std::wstring desinstalar(const Avance &avance);

// Abre el StartCode Panel instalado
void abrirPanel();
