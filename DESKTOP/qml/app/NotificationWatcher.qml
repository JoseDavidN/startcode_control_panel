import QtQuick
import StartCode

/* Vigilante de avisos de la cuenta, uno en toda la app mientras hay sesión.
   La detección (umbrales, servidor caído) vive en el servidor; aquí solo se
   escucha la señal `notifications:changed`, se vuelve a pedir lo no leído y
   se avisa de lo nuevo: las alertas de seguridad, como notificación del
   sistema (si el usuario lo dejó activado); el resto, como aviso en la app. */
Item {
    id: root

    /* Ids ya anunciados: lo que estaba sin leer al entrar no se suelta de golpe. */
    property var announced: null

    function refreshCount() {
        Api.request("GET", "/notifications/unread-count", null, (ok, data) => {
            if (ok && data) NotificationState.unread = data.unread || 0
        })
    }

    function nativeSecurity() {
        const saved = App.storeGet("native_security_alerts")
        return saved === undefined || saved === null ? true : saved === true
    }

    function announce(items) {
        if (root.announced === null) return
        const seen = root.announced
        /* De más antiguo a más nuevo, como llegaron. */
        items.slice().reverse().forEach(item => {
            if (seen[item.id]) return
            seen[item.id] = true
            if (item.type === "security" && root.nativeSecurity()
                    && App.notifyWith(item.title, item.body, { urgency: "critical", tag: "notifications" }))
                return
            if (item.severity === "error") Toasts.error(item.title, item.body)
            else if (item.severity === "warning") Toasts.warning(item.title, item.body)
            else Toasts.info(item.title, item.body)
        })
    }

    Component.onCompleted: {
        refreshCount()
        Api.request("GET", "/notifications?unread=true&limit=50&offset=0", null, (ok, data) => {
            const seen = {}
            if (ok && data && Array.isArray(data.items)) data.items.forEach(i => seen[i.id] = true)
            root.announced = seen
        })
    }

    Connections {
        target: Realtime
        function onEvent(name, payload) {
            if (name !== "notifications:changed") return
            NotificationState.revision++
            root.refreshCount()
            Api.request("GET", "/notifications?unread=true&limit=20&offset=0", null, (ok, data) => {
                if (ok && data && Array.isArray(data.items)) root.announce(data.items)
            })
        }
    }
    Connections {
        target: NotificationState
        function onRefreshRequested() {
            NotificationState.revision++
            root.refreshCount()
        }
    }
    /* Al pulsar una notificación del sistema, la app pasa al frente y abre la lista. */
    Connections {
        target: App
        function onNotificationActivated(tag) { AppNav.open("notifications", "") }
    }
}
