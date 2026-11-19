import QtQuick
import StartCode

/* Desinstalar el agente del servidor. Es la misma pantalla de pasos que la
   instalación, con sus textos, sus actividades y `DELETE /servers/:id/agent`. */
AgentInstallModal {
    action: "uninstall"
}
