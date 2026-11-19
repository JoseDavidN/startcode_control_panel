import QtQuick
import StartCode

/* Cierra la sesión tras `security.sessionTimeout` minutos sin actividad
   (0 = nunca). No visual: se instancia una sola vez en la ventana principal.
   Las sesiones con «Mantener sesión iniciada» no se cierran por inactividad. */
Item {
    id: root

    /* Minutos configurados en la cuenta; 0 lo desactiva. */
    readonly property int minutes: {
        if (!Auth.authenticated) return 0
        const security = Auth.preferences.security
        const value = security ? Math.round(Number(security.sessionTimeout) || 0) : 0
        return value > 0 ? value : 0
    }
    /* Desde cuándo se cuenta: al entrar o al cambiar el tiempo, la cuenta empieza de cero. */
    property double armedAt: 0

    visible: false
    width: 0
    height: 0

    onMinutesChanged: armedAt = Date.now()
    Component.onCompleted: armedAt = Date.now()

    /* `Auth.persistent` (sesión recordada) se lee en cada tic: si el
       controlador no lo expone, vale `undefined` y la sesión se trata como normal. */
    function persistentSession() { return Auth.persistent === true }

    Timer {
        interval: 1000
        repeat: true
        running: root.minutes > 0
        onTriggered: {
            if (!Auth.authenticated || root.persistentSession()) return
            const last = Math.max(App.lastActivityMs(), root.armedAt)
            if (Date.now() - last >= root.minutes * 60000) {
                /* Rearmar antes de cerrar: `logout` tarda lo que la petición y no debe repetirse. */
                root.armedAt = Date.now()
                Auth.logout()
            }
        }
    }
}
