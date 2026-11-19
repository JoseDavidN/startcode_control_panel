pragma Singleton

import QtQuick

/* Estado compartido de las notificaciones de la cuenta. Lo mantiene el
   vigilante de avisos (`NotificationWatcher`, uno en toda la app); las
   pantallas solo lo leen y piden refrescos. */
QtObject {
    /* Sin leer, para la insignia de la barra lateral. */
    property int unread: 0
    /* Cambia cuando el servidor avisa de novedades: quien liste
       notificaciones vuelve a pedirlas al cambiar. */
    property int revision: 0

    /* Pídelo tras marcar como leídas o borrar: recalcula `unread` y sube `revision`. */
    signal refreshRequested()
    function refresh() { refreshRequested() }
}
