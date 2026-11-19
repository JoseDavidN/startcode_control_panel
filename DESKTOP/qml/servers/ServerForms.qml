import QtQuick
import StartCode

/* Valores fijos y reglas que comparten los modales de servidores (alta y
   edición): opciones de los desplegables y validación de la llave privada.
   Se instancia una vez por modal: `ServerForms { id: logic }`. */
QtObject {
    /* Mismo enum que `ServerOs` del backend. */
    readonly property var osOptions: [
        { value: "ubuntu",  label: "Ubuntu" },
        { value: "centos",  label: "CentOS" },
        { value: "debian",  label: "Debian" },
        { value: "fedora",  label: "Fedora" },
        { value: "arch",    label: "Arch Linux" },
        { value: "solaris", label: "Solaris" },
        { value: "openbsd", label: "OpenBSD" },
        { value: "netbsd",  label: "NetBSD" },
        { value: "freebsd", label: "FreeBSD" },
        { value: "other",   label: "Otro" }
    ]

    /* '' es «sin etiqueta»: al backend llega como null. */
    readonly property var tagOptions: [
        { value: "",            label: "Sin etiqueta" },
        { value: "production",  label: "Producción" },
        { value: "staging",     label: "Preproducción" },
        { value: "testing",     label: "Pruebas" },
        { value: "development", label: "Desarrollo" },
        { value: "backup",      label: "Respaldo" }
    ]

    readonly property string keyPlaceholder:
        "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA...\n-----END OPENSSH PRIVATE KEY-----"

    /* Comando para comprobar la huella en el propio servidor. */
    readonly property string hostKeyCheckCommand: "ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub"

    /* Saltos de línea de Windows o Mac clásico a `\n`, sin espacios en los extremos. */
    function normalizeKey(value) {
        return String(value).trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    }

    /* Comprobación de formato antes de enviarla. Devuelve `{ valid, error }`. */
    function validateKey(key) {
        const k = String(key).trim()
        if (!k) return { valid: false, error: "La clave privada es requerida" }
        if (!k.includes("BEGIN") || !k.includes("PRIVATE KEY"))
            return { valid: false, error: "Debe contener \"BEGIN ... PRIVATE KEY\"" }
        if (!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(k))
            return { valid: false, error: "Debe comenzar con \"-----BEGIN ... PRIVATE KEY-----\"" }
        if (!/-----END [A-Z ]+PRIVATE KEY-----/.test(k))
            return { valid: false, error: "Debe terminar con \"-----END ... PRIVATE KEY-----\"" }
        if ((k.includes("BEGIN RSA PRIVATE KEY") || k.includes("BEGIN EC PRIVATE KEY")) && k.includes("ENCRYPTED"))
            return { valid: false, error: "La clave tiene passphrase. Remuévela con: ssh-keygen -p -N \"\" -f tu_clave" }
        const minLength = k.includes("BEGIN OPENSSH PRIVATE KEY") ? 400 : 800
        if (k.length < minLength) return { valid: false, error: "La clave parece estar incompleta" }
        return { valid: true, error: "" }
    }

    /* ── Texto enriquecido ─────────────────────────────────────────────
       Los datos del usuario (nombre, host) se escapan siempre: van dentro
       de un texto con formato. */
    function esc(text) {
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }
    /* Tramo en monoespaciada con la tinta a la opacidad indicada. */
    function mono(text, alpha) {
        return "<span style=\"font-family:'" + Theme.fontMono + "'; color:" + Theme.ink(alpha === undefined ? 0.8 : alpha)
             + "\">" + esc(text) + "</span>"
    }
    /* Tramo en monoespaciada con un color concreto del tema. */
    function code(text, color) {
        return "<span style=\"font-family:'" + Theme.fontMono + "'; color:" + color + "\">" + esc(text) + "</span>"
    }
}
