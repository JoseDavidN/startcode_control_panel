pragma Singleton

import QtQuick

/* Navegación entre secciones desde cualquier pantalla (el panel, un aviso,
   el asistente): `AppNav.open("servers", "<id del servidor>")`. Quien pinta
   la estructura de la app la atiende. */
QtObject {
    /* Secciones: dashboard | servers | databases | notifications | settings.
       `target`: id del servidor o de la conexión a abrir, o la pestaña de
       Configuración (profile, appearance, notifications, security,
       monitoring, assistant, system); vacío = la sección sin más. */
    signal open(string page, string target)
}
