pragma Singleton

import QtQuick

/* Estado global del asistente de IA: si el panel está abierto y el registro
   de lo que la pantalla actual ofrece para leer (fuentes) y para pegar
   (destinos). Cada pantalla registra lo suyo al crearse y lo retira al
   destruirse, así el asistente nunca ve una terminal ya cerrada. La
   conversación no vive aquí: es la memoria del backend. */
QtObject {
    id: bridge

    /* Panel de chat abierto. */
    property bool open: false

    /* Fuentes: `{ id, type, title, read: () => texto, database: () => ref|null }`.
       `type`: terminal | command_output | sql_editor | sql_result | schema. */
    property var sources: []
    /* Destinos: `{ id, kind, label, paste: texto => void }`.
       `kind`: terminal | command | sql. Pegar nunca ejecuta. */
    property var targets: []

    /* El asistente propone dar de alta un servidor o una conexión: quien
       tenga el formulario lo abre ya rellenado. */
    signal serverFormRequested(var data)
    signal connectionFormRequested(var data)

    function registerSource(source) {
        sources = sources.filter(s => s.id !== source.id).concat([source])
    }
    function unregisterSource(id) {
        sources = sources.filter(s => s.id !== id)
    }
    function registerTarget(target) {
        targets = targets.filter(t => t.id !== target.id).concat([target])
    }
    function unregisterTarget(id) {
        targets = targets.filter(t => t.id !== id)
    }
}
