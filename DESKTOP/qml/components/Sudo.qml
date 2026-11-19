pragma Singleton

import QtQuick

/* Contraseña de sudo por servidor, solo en memoria y solo mientras la app
   está abierta. La comparten las acciones del detalle de un servidor. */
QtObject {
    property var cache: ({})
    function get(serverId) { return cache[serverId] || "" }
    function set(serverId, password) { cache[serverId] = password }
    function clear(serverId) { delete cache[serverId] }
}
