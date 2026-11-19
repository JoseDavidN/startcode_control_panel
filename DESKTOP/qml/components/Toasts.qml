pragma Singleton

import QtQuick

/* Avisos breves de la app. Los pinta `ToastHost`, abajo y al centro. */
QtObject {
    readonly property ListModel model: ListModel {}
    property int nextId: 1

    function show(kind, title, detail) {
        model.append({ toastId: nextId++, kind: kind, title: title, detail: detail || "" })
        if (model.count > 4)
            model.remove(0)
    }
    function error(title, detail) { show("error", title, detail) }
    function success(title, detail) { show("success", title, detail) }
    function info(title, detail) { show("info", title, detail) }
    function warning(title, detail) { show("warning", title, detail) }

    function dismiss(toastId) {
        for (let i = 0; i < model.count; i++) {
            if (model.get(i).toastId === toastId) {
                model.remove(i)
                return
            }
        }
    }
}
