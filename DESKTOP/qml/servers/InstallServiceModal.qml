import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import StartCode

/* Instalar o desinstalar un servicio en el servidor con el mismo botón: al
   elegirlo se comprueba si ya está; si no, se ofrece instalarlo; si ya está,
   se avisa y se pide confirmar una desinstalación completa. El modal no cambia
   de tamaño: el catálogo desplaza dentro de un alto fijo y el resto de vistas
   ocupa ese mismo hueco.

       InstallServiceModal { id: m; server: root.server; onChanged: recargar() }
       m.open()

   `changed()` se emite al cerrar si algo se instaló o desinstaló. */
Modal {
    id: root

    /* `{ id, name, host, os, status }` */
    property var server: ({})
    /* Al cerrar, si se instaló o desinstaló algo: el detalle debe recargarse. */
    signal changed()

    readonly property string serverId: server && server.id ? String(server.id) : ""
    readonly property string serverName: server && server.name ? String(server.name) : ""
    readonly property string base: "/agent-data/servers/" + serverId + "/services"

    /* ── Catálogo ──────────────────────────────────────────────────── */
    /* `ready`: ya tiene receta en el backend; el resto se ve pero aún no se
       puede instalar. Kubernetes y MySQL se eligen entre variantes. */
    readonly property var kubernetesVariants: [
        { id: "k3s", name: "K3s", logo: "k3s", desc: "De Rancher (SUSE). Un solo binario y pocos recursos: el más usado para un nodo, edge o laboratorio" },
        { id: "microk8s", name: "MicroK8s", logo: "canonical", desc: "De Canonical, por snap. Complementos (DNS, ingress, almacenamiento) con un comando" },
        { id: "k0s", name: "k0s", logo: "kubernetes", desc: "De Mirantis. Un binario sin dependencias del sistema, Kubernetes sin modificar" },
        { id: "rke2", name: "RKE2", logo: "rancher", desc: "De Rancher, endurecido para seguridad (CIS). El más completo; tarda más en arrancar" }
    ]
    /* MySQL de Oracle solo está en Ubuntu y RHEL/Fedora; MariaDB, compatible, en todas. */
    readonly property var mysqlVariants: [
        { id: "mysql", name: "MySQL", logo: "mysql", desc: "El de Oracle. En Ubuntu y en RHEL, Rocky, Alma y Fedora" },
        { id: "mariadb", name: "MariaDB", logo: "mariadb", desc: "Compatible con MySQL (mismos clientes y protocolo). En todas las distribuciones" }
    ]
    readonly property var catalog: [
        { type: "nginx", name: "Nginx", desc: "Servidor web y proxy", ready: true },
        { type: "kubernetes", name: "Kubernetes", desc: "Orquestación de contenedores", ready: true, variants: kubernetesVariants },
        { type: "docker", name: "Docker", desc: "Contenedores", ready: true },
        { type: "mysql", name: "MySQL", desc: "Base de datos relacional", ready: true, variants: mysqlVariants },
        { type: "postgresql", name: "PostgreSQL", desc: "Base de datos avanzada", ready: true },
        { type: "redis", name: "Redis", desc: "Cache en memoria", ready: true },
        { type: "mongodb", name: "MongoDB", desc: "Base de datos NoSQL", ready: true },
        { type: "nodejs", name: "Node.js", desc: "Runtime JavaScript", ready: true },
        { type: "proxmox", name: "Proxmox VE", desc: "Virtualización: VMs y contenedores", ready: false },
        { type: "fail2ban", name: "Fail2ban", desc: "Bloquea IPs con intentos de acceso fallidos", ready: true },
        { type: "tailscale", name: "Tailscale", desc: "Red privada (VPN) sin configurar puertos", ready: true },
        { type: "wireguard", name: "WireGuard", desc: "VPN rápida y moderna", ready: true },
        { type: "restic", name: "restic", desc: "Copias de seguridad cifradas", ready: true }
    ]

    /* Lo que hace cada operación, para confirmarla antes de tocar el servidor. */
    readonly property string kubeCommonInstall: "Deja el nodo como plano de control y trabajador, y espera a que esté listo (puede tardar unos minutos)"
    readonly property var whatItDoes: ({
        nginx: [
            "Detecta el sistema y su gestor de paquetes (apt, dnf, yum, zypper, apk o pacman)",
            "Instala el paquete nginx de los repositorios del sistema",
            "Lo arranca y lo deja habilitado al iniciar el servidor",
            "Comprueba que responde y muestra la versión instalada"
        ],
        docker: [
            "Debian y Ubuntu: instalador oficial (get.docker.com); RHEL, Rocky, Alma, CentOS y Fedora: repositorio oficial de Docker; el resto: paquete de la distribución",
            "Instala Docker Engine, la CLI, containerd, buildx y compose",
            "Lo arranca y lo deja habilitado al iniciar el servidor",
            "Comprueba que responde y muestra la versión instalada"
        ],
        postgresql: [
            "Instala PostgreSQL del sistema (en RHEL y familia crea el clúster con postgresql-setup; en Arch y Alpine, con initdb)",
            "Lo arranca, lo deja habilitado al iniciar y escuchando solo en el propio servidor",
            "Comprueba que responde y muestra la versión instalada"
        ],
        mysql: [
            "Instala mysql-server de los repositorios del sistema",
            "Lo arranca, lo deja habilitado y escuchando solo en el propio servidor (root entra por el socket local)",
            "Comprueba que responde y muestra la versión instalada"
        ],
        mariadb: [
            "Instala mariadb-server (en Alpine y Arch también crea el directorio de datos)",
            "Lo arranca, lo deja habilitado y escuchando solo en el propio servidor (root entra por el socket local)",
            "Comprueba que responde y muestra la versión instalada"
        ],
        mongodb: [
            "Añade el repositorio oficial de MongoDB 8.0 con su clave (no está en las distribuciones)",
            "Instala mongodb-org (servidor, mongosh y herramientas), lo arranca y lo deja habilitado, escuchando solo en el propio servidor",
            "Requisitos: Ubuntu 20.04–24.04, Debian 12 o RHEL/Rocky/Alma 8–9, y un procesador con AVX"
        ],
        redis: [
            "Instala Redis del sistema (en RHEL y familia desde EPEL si hace falta; en Arch puede ser Valkey, compatible)",
            "Lo arranca, lo deja habilitado y escuchando solo en el propio servidor",
            "Comprueba que responde y muestra la versión instalada"
        ],
        nodejs: [
            "Debian, Ubuntu, RHEL, Rocky, Alma y Fedora: la versión LTS desde el repositorio oficial de NodeSource; si no lo admite, la de la distribución",
            "openSUSE, Alpine y Arch: el paquete de la distribución",
            "Instala node, npm y npx. No es un servicio: no se arranca nada",
            "Comprueba y muestra las versiones de Node.js y npm"
        ],
        tailscale: [
            "Debian, Ubuntu, RHEL, Rocky, Alma, Fedora y openSUSE: el instalador oficial (tailscale.com/install.sh), que añade su repositorio; Alpine y Arch: el paquete de la distribución",
            "Arranca tailscaled y lo deja habilitado al iniciar",
            "Te da el enlace para iniciar sesión en Tailscale y unir este servidor a tu red; si ya estaba vinculado, muestra su IP de Tailscale",
            "No cambia las rutas del servidor ni acepta las de otros nodos"
        ],
        fail2ban: [
            "Instala fail2ban del sistema (en RHEL y familia desde EPEL, sin atarlo a firewalld)",
            "Activa la protección de SSH en el puerto real de sshd: bloquea 1 h una IP con 5 accesos fallidos en 10 minutos",
            "La IP desde la que entra el panel y el propio servidor quedan en la lista blanca: nunca se bloquean",
            "Bloquea con firewalld si está activo, si no con nftables o iptables; lo arranca, lo deja habilitado y comprueba que la protección está cargada"
        ],
        restic: [
            "Descarga la última versión oficial de restic (GitHub), comprueba su suma SHA-256 y la instala en /usr/local/bin; si no se puede, la de la distribución",
            "Instala curl y bzip2 si faltan",
            "Es una herramienta, no un servicio: no se arranca nada ni se crea ninguna copia todavía",
            "Muestra cómo crear el primer repositorio de copias"
        ],
        wireguard: [
            "Instala wireguard-tools (sin DKMS: el kernel trae WireGuard desde Linux 5.6)",
            "Crea la interfaz wg0 con su par de claves, en la primera subred 10.x.0.0/24 libre y el primer puerto UDP libre desde 51820; si ya hay un wg0.conf, lo respeta",
            "Abre ese puerto en ufw o firewalld si están activos, levanta wg0 y la deja habilitada al iniciar",
            "Muestra la dirección, el puerto y la clave pública para añadir los pares (clientes)"
        ],
        k3s: ["Instala curl si falta y ejecuta el instalador oficial (get.k3s.io)", "Crea el servicio k3s con su red (flannel), DNS y almacenamiento local", kubeCommonInstall],
        microk8s: ["Instala snapd si falta (en RHEL y familia, desde EPEL)", "Instala el snap microk8s (--classic)", kubeCommonInstall],
        k0s: ["Instala curl si falta y descarga k0s con su instalador oficial (get.k0s.sh)", "Lo instala como controlador de un solo nodo (k0s install controller --single) y lo arranca", kubeCommonInstall],
        rke2: ["Instala curl si falta y ejecuta el instalador oficial (get.rke2.io)", "Habilita y arranca rke2-server; el primer arranque descarga sus imágenes", kubeCommonInstall]
    })

    /* Desinstalar es completo: el servidor queda como si nunca se hubiera instalado. */
    readonly property string kubeCommonUninstall: "Borra reglas de iptables de Kubernetes, interfaces de red (cni0, flannel, Calico…) y la configuración CNI de Kubernetes, y comprueba que no queda rastro"
    readonly property var whatUninstallDoes: ({
        nginx: [
            "Detiene nginx y lo quita del arranque del sistema",
            "Purga los paquetes nginx y sus módulos, y las dependencias que quedan sin uso",
            "Borra configuración (/etc/nginx), registros, caché, contenido por defecto, unidades del sistema y el usuario nginx",
            "Comprueba que no queda ningún rastro. Tus sitios en /var/www no se tocan"
        ],
        docker: [
            "Detiene Docker y containerd y los quita del arranque",
            "Purga los paquetes de Docker (engine, CLI, containerd.io, buildx, compose) y las dependencias que quedan sin uso",
            "Borra todas las imágenes, contenedores, volúmenes y redes (/var/lib/docker), la configuración, el repositorio y su clave, el grupo docker y los ~/.docker",
            "Quita docker0, los puentes de las redes de Docker y sus reglas de iptables, y comprueba que no queda rastro. runc y los datos de containerd que otro programa siga usando se conservan"
        ],
        postgresql: [
            "Detiene PostgreSQL y lo quita del arranque",
            "Purga los paquetes de PostgreSQL y las dependencias que quedan sin uso (libpq se conserva si otro programa la usa)",
            "Borra TODAS las bases de datos y el clúster, la configuración, los registros, el historial de psql y el usuario postgres",
            "Comprueba que no queda rastro"
        ],
        mysql: [
            "Detiene MySQL y lo quita del arranque",
            "Purga los paquetes de MySQL (las bibliotecas cliente que usen PHP u otros se conservan si siguen en uso)",
            "Borra TODAS las bases de datos (/var/lib/mysql), la configuración, los registros, el historial y el usuario mysql",
            "Comprueba que no queda rastro"
        ],
        mariadb: [
            "Detiene MariaDB y lo quita del arranque",
            "Purga los paquetes de MariaDB y Galera (las bibliotecas cliente en uso se conservan)",
            "Borra TODAS las bases de datos (/var/lib/mysql), la configuración, los registros, el historial y el usuario mysql",
            "Comprueba que no queda rastro"
        ],
        mongodb: [
            "Detiene mongod y lo quita del arranque",
            "Purga los paquetes de MongoDB y quita su repositorio y su clave",
            "Borra TODAS las bases de datos, la configuración, los registros, el historial de mongosh y los usuarios mongodb/mongod",
            "Comprueba que no queda rastro"
        ],
        redis: [
            "Detiene Redis (o Valkey) y lo quita del arranque",
            "Purga sus paquetes",
            "Borra todos los datos guardados, la configuración, los registros, el historial de redis-cli y el usuario redis",
            "Comprueba que no queda rastro"
        ],
        nodejs: [
            "Purga los paquetes de Node.js y npm, y las dependencias que quedan sin uso",
            "Quita el repositorio de NodeSource y su clave",
            "Borra los paquetes globales de npm (pm2, yarn…) y sus comandos, las cachés y la configuración de npm y node-gyp, y los historiales",
            "Comprueba que no queda rastro. Los node_modules de tus proyectos no se tocan"
        ],
        tailscale: [
            "Si el panel entra por SSH a través de Tailscale, no se desinstala: cortaría el acceso",
            "Cierra la sesión del servidor en tu red Tailscale (desaparece de la consola), detiene tailscaled y lo quita del arranque",
            "Purga los paquetes y quita el repositorio oficial y su clave",
            "Borra el estado y la identidad del nodo (/var/lib/tailscale), la caché, la configuración, la interfaz tailscale0 y sus reglas de iptables, y comprueba que no queda rastro"
        ],
        fail2ban: [
            "Detiene fail2ban, que quita todos sus bloqueos, y lo quita del arranque",
            "Purga sus paquetes y las dependencias que quedan sin uso",
            "Borra la configuración (/etc/fail2ban), la base de bloqueos, los registros y cualquier regla f2b que quede en iptables, nftables o ipset",
            "Comprueba que no queda rastro"
        ],
        restic: [
            "Borra el binario de restic y purga el paquete de la distribución si lo hay",
            "Borra las cachés de restic y el autocompletado",
            "Comprueba que no queda rastro. Tus repositorios de copias NO se tocan, estén donde estén"
        ],
        wireguard: [
            "Si el panel entra por SSH a través de WireGuard, no se desinstala: cortaría el acceso",
            "Baja TODAS las interfaces WireGuard (no solo wg0) y las quita del arranque, y cierra su puerto en ufw o firewalld",
            "Purga wireguard-tools y borra /etc/wireguard con todas sus configuraciones y claves",
            "Comprueba que no queda rastro. El módulo del kernel es parte del sistema y se conserva"
        ],
        k3s: ["Ejecuta k3s-uninstall.sh: detiene k3s, borra el servicio, binarios (k3s, kubectl, crictl) y montajes", "Borra /etc/rancher/k3s, /var/lib/rancher/k3s con todas las imágenes y volúmenes locales, y /var/lib/kubelet", kubeCommonUninstall],
        microk8s: ["Detiene MicroK8s y quita el snap con --purge (sin instantánea de datos)", "Borra /var/snap/microk8s, los datos de usuario y el grupo microk8s. snapd se conserva", kubeCommonUninstall],
        k0s: ["Detiene k0s y ejecuta k0s reset: servicios, datos y montajes del nodo", "Borra el binario, /etc/k0s, /var/lib/k0s y /var/lib/kubelet", kubeCommonUninstall],
        rke2: ["Detiene rke2 y ejecuta rke2-uninstall.sh (paquetes, binarios y servicio)", "Borra /etc/rancher/rke2, /var/lib/rancher/rke2 con sus imágenes y /var/lib/kubelet", kubeCommonUninstall]
    })

    /* ── Estado ────────────────────────────────────────────────────── */
    property var selected: null
    /* En un grupo (Kubernetes, MySQL): la variante elegida para instalar. */
    property var variant: null
    /* La contraseña aceptada se reutiliza al reintentar. */
    property string sudoPassword: ""
    readonly property string sudoDraft: sudoField.text

    /* ¿Ya está instalado? Se pregunta cada vez que se elige el servicio. */
    property bool statusLoading: false
    property var statusData: null
    property var statusError: null
    property int statusSeq: 0

    /* La operación en curso y su resultado. */
    property bool busy: false
    property var result: null
    property var error: null
    property var steps: []
    /* Servicio de la operación en curso: filtra los avisos del socket. */
    property string active: ""
    property string runMode: "install"
    property int runSeq: 0
    /* La respuesta HTTP no llegó a tiempo: la operación se sigue por el socket. */
    property bool following: false
    /* Algo se instaló o desinstaló desde que se abrió el modal. */
    property bool dirty: false

    readonly property string mode: statusData && statusData.installed ? "uninstall" : "install"
    readonly property bool uninstalling: mode === "uninstall"
    readonly property bool grouped: selected !== null && selected.variants !== undefined
    /* Lo que se instala o desinstala de verdad: la variante en un grupo, el servicio si no. */
    readonly property var installedVariant: grouped && statusData
        ? (selected.variants.find(v => v.id === statusData.variant) || null) : null
    readonly property var target: grouped ? (installedVariant || variant) : null
    readonly property string targetId: !selected ? "" : grouped ? (target ? target.id : "") : selected.type
    readonly property string targetName: target ? target.name : selected ? selected.name : ""
    readonly property string targetLogo: target ? target.logo : selected ? selected.type : ""
    /* Grupo sin nada instalado y sin elegir: primero se elige la variante. */
    readonly property bool picking: grouped && statusData !== null && !statusData.installed && variant === null
    /* Servicio suelto que este sistema no admite: se dice antes de intentar instalar. */
    readonly property string blocked: !uninstalling && selected !== null && !grouped && statusData && statusData.unsupported
        ? String(statusData.unsupported) : ""
    readonly property bool needsSudo: error !== null && (error.code === "SUDO_REQUIRED" || error.code === "SUDO_PASSWORD")
    readonly property bool started: busy || result !== null || (error !== null && !needsSudo)
    readonly property bool resultOk: result !== null && result.ok === true

    /* Qué se ve en el hueco central, por orden de prioridad. */
    readonly property string view: statusLoading ? "loading"
        : picking ? "picking"
        : statusError !== null ? "statusError"
        : started ? "steps"
        : needsSudo ? "sudo"
        : uninstalling ? "uninstall"
        : blocked !== "" ? "blocked" : "plan"
    /* El campo aún no es visible en este mismo instante: el foco, después. */
    onViewChanged: if (view === "sudo") Qt.callLater(() => sudoField.forceFocus())

    readonly property string actionLabel: uninstalling ? "Desinstalar por completo" : "Instalar"
    readonly property string runLabel: busy ? (uninstalling ? "Desinstalando…" : "Instalando…")
        : result !== null || error !== null ? "Reintentar"
        : needsSudo ? "Continuar" : actionLabel
    readonly property bool runEnabled: !(busy || statusLoading || picking || targetId === "" || blocked !== ""
                                         || (needsSudo && sudoDraft === ""))
    readonly property bool backToVariants: variant !== null && result === null && !busy

    title: !selected ? "Instalar Nuevo Servicio"
         : statusLoading || picking ? selected.name
         : uninstalling ? "Desinstalar " + targetName : "Instalar " + targetName
    size: "md"
    dismissable: !busy

    /* ── Lógica ────────────────────────────────────────────────────── */
    function support(id) {
        const options = statusData && statusData.options ? Array.from(statusData.options) : []
        return options.find(o => o.id === id) || null
    }

    function loadStatus() {
        if (!selected) return
        const seq = ++statusSeq
        statusLoading = true
        statusError = null
        Api.request("POST", base + "/install-status", { service: selected.type }, (ok, data, err) => {
            if (seq !== root.statusSeq) return
            root.statusLoading = false
            if (ok && data) root.statusData = data
            else root.statusError = err || { message: "" }
        }, 45000)
    }

    function select(item) {
        if (!item || !item.ready) return
        variant = null
        statusData = null
        statusError = null
        selected = item
        loadStatus()
    }

    function resetRun() {
        runSeq++
        quietTimer.stop()
        deadline.stop()
        sudoField.text = ""
        active = ""
        following = false
        busy = false
        steps = []
        result = null
        error = null
    }

    /* Volver: de la confirmación de una variante, a elegir otra; si no, al catálogo. */
    function back() {
        if (busy) return
        if (backToVariants) { variant = null; resetRun(); return }
        statusSeq++
        statusLoading = false
        selected = null
        variant = null
        statusData = null
        statusError = null
        resetRun()
    }

    function finishRun(data) {
        quietTimer.stop()
        deadline.stop()
        following = false
        busy = false
        /* Los pasos de la respuesta mandan: cubren los que el socket no trajo. */
        steps = data.steps ? Array.from(data.steps) : []
        result = data
        if (data.ok) dirty = true
    }

    function failRun(err) {
        quietTimer.stop()
        deadline.stop()
        following = false
        busy = false
        error = err || { message: "", code: "", hint: "" }
    }

    function run(password) {
        if (targetId === "" || busy) return
        const pw = password || ""
        const service = targetId
        const seq = ++runSeq
        sudoPassword = pw
        runMode = mode
        active = service
        steps = []
        result = null
        error = null
        following = false
        busy = true
        deadline.restart()
        const body = { service: service }
        if (pw) body.sudoPassword = pw
        Api.request("POST", base + "/" + runMode, body, (ok, data, err) => {
            if (seq !== root.runSeq) return
            if (ok && data) {
                /* Pasó el paso de privilegios: la contraseña vale para el resto del detalle. */
                if (pw) Sudo.set(root.serverId, pw)
                root.finishRun(data)
                return
            }
            /* apt o dnf pueden tardar minutos y la petición se corta antes: la
               operación sigue en el servidor y se termina de seguir por el socket. */
            if (err && err.status === 0 && Realtime.connected) {
                root.following = true
                root.watchFollow()
                return
            }
            if (err && err.code === "SUDO_PASSWORD") {
                Sudo.clear(root.serverId)
                root.sudoPassword = ""
            }
            root.failRun(err)
        }, 900000)
    }

    /* Sin respuesta HTTP, el final se deduce de los pasos: cuando ninguno corre
       durante un rato, la operación terminó (bien, mal o bloqueada). */
    function watchFollow() {
        if (!following) return
        quietTimer.stop()
        if (steps.some(s => s.status === "running")) return
        const settled = steps.some(s => s.status === "failed" || (s.id === "verify" && s.status === "done"))
        quietTimer.interval = settled ? 3000 : 15000
        quietTimer.start()
    }

    function resolveFollow() {
        if (!following) return
        const seq = runSeq
        const service = active
        const failed = steps.find(s => s.status === "failed")
        const outcome = extra => Object.assign({
            ok: false, mode: runMode, service: service, steps: steps, os: null, version: null, alreadyInstalled: false
        }, extra)
        if (failed) {
            finishRun(outcome({ error: { code: "", message: "No se pudo completar", detail: failed.detail || "" } }))
            return
        }
        if (!selected) { failRun(null); return }
        const isGroup = grouped
        /* Lo que quedó de verdad en el servidor decide si salió bien. */
        Api.request("POST", base + "/install-status", { service: selected.type }, (ok, data, err) => {
            if (seq !== root.runSeq || !root.following) return
            if (!ok || !data) { root.failRun(err); return }
            const present = data.installed && (!isGroup || data.variant === service)
            if (root.runMode === "install" ? !present : data.installed) {
                root.finishRun(outcome({ error: { code: "", message: "No se pudo completar" } }))
                return
            }
            /* El enlace y la clave solo vienen en la respuesta; del paso queda su primer dato. */
            const access = root.steps.find(s => s.id === "access" && s.status === "done" && s.detail
                                                && s.detail !== "abre el enlace para vincular")
            root.finishRun(outcome({
                ok: true,
                os: data.os || null,
                version: root.runMode === "install" ? data.version : null,
                alreadyInstalled: root.steps.some(s => s.id === "install" && s.status === "skipped"),
                access: access ? { url: null, info: [access.detail], key: null } : undefined
            }))
        }, 45000)
    }

    Timer { id: quietTimer; onTriggered: root.resolveFollow() }
    /* Mismo tope que el panel web: 15 minutos por operación. */
    Timer {
        id: deadline
        interval: 15 * 60000
        onTriggered: if (root.busy) { root.runSeq++; root.failRun({ message: "No se recibió respuesta del servidor", code: "", hint: "" }) }
    }

    /* Progreso en vivo: `{ serverId, service, mode, step }`. */
    Connections {
        target: Realtime
        function onEvent(name, payload) {
            if (name !== "service:install:progress" || !payload || !payload.step) return
            if (payload.serverId !== root.serverId || root.active === "" || payload.service !== root.active) return
            if (!root.busy) return
            const step = payload.step
            const next = root.steps.slice()
            const i = next.findIndex(s => s.id === step.id)
            if (i < 0) next.push(step)
            else next[i] = step
            root.steps = next
            root.watchFollow()
        }
    }

    onClosed: {
        statusSeq++
        statusLoading = false
        selected = null
        variant = null
        statusData = null
        statusError = null
        sudoPassword = ""
        resetRun()
        if (dirty) {
            dirty = false
            changed()
        }
    }

    /* ── Piezas ────────────────────────────────────────────────────── */
    /* Línea de «qué hace»: marca de marca al instalar, aspa roja al desinstalar. */
    component Bullet: Item {
        id: bullet
        property string text: ""
        property bool danger: false
        width: parent ? parent.width : 0
        implicitHeight: bulletLabel.implicitHeight
        height: implicitHeight
        Icon {
            y: 3
            size: 14
            name: bullet.danger ? "close" : "check"
            color: bullet.danger ? Theme.tone("rose").text : Theme.brandLight1
        }
        Label {
            id: bulletLabel
            x: 24
            width: bullet.width - 24
            text: bullet.text
            tone: 0.7
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    /* Caja de aviso: cristal suave con el borde del color del estado. */
    component Notice: Glass {
        id: notice
        property color edge: Theme.hairlineSoft
        property int pad: 12
        default property alias items: noticeColumn.data
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        borderColor: edge
        width: parent ? parent.width : 0
        height: noticeColumn.implicitHeight + pad * 2
        Column {
            id: noticeColumn
            x: notice.pad
            y: notice.pad
            width: notice.width - notice.pad * 2
            spacing: 4
        }
    }

    /* Un paso con su icono de estado; el que corre gira. */
    component StepRow: Item {
        id: stepRow
        property var step: ({})
        readonly property string status: step.status || "pending"
        width: parent ? parent.width : 0
        implicitHeight: Math.max(24, stepText.implicitHeight + 2)
        height: implicitHeight

        Rectangle {
            width: 24; height: 24
            radius: Theme.radiusLg
            color: stepRow.status === "done" ? Qt.alpha(Theme.ok, 0.15)
                 : stepRow.status === "failed" ? Qt.alpha(Theme.danger, 0.15)
                 : stepRow.status === "running" ? Theme.brand1(0.15) : Theme.tintActive
            Icon {
                anchors.centerIn: parent
                visible: stepRow.status === "done" || stepRow.status === "failed" || stepRow.status === "skipped"
                size: 14
                name: stepRow.status === "done" ? "check" : stepRow.status === "failed" ? "close" : "minimize"
                color: stepRow.status === "done" ? Theme.tone("emerald").text
                     : stepRow.status === "failed" ? Theme.tone("rose").text : Theme.ink(0.4)
            }
            Spinner {
                anchors.centerIn: parent
                visible: stepRow.status === "running"
                size: 14
                color: Theme.brandLight1
            }
            Rectangle {
                anchors.centerIn: parent
                visible: stepRow.status === "pending"
                width: 6; height: 6; radius: 3
                color: Theme.ink(0.25)
            }
        }
        Column {
            id: stepText
            x: 36
            y: 2
            width: stepRow.width - 36
            Label {
                width: parent.width
                text: stepRow.step.label || ""
                textFormat: Text.PlainText
                tone: stepRow.status === "pending" ? 0.45 : 0.85
            }
            Label {
                width: parent.width
                visible: text !== ""
                text: stepRow.step.detail || ""
                textFormat: Text.PlainText
                mono: true
                font.pixelSize: Theme.textXs
                color: stepRow.status === "failed" ? Qt.alpha(Theme.tone("rose").text, 0.8) : Theme.ink(0.45)
                HoverTip { text: stepRow.step.detail || "" }
            }
        }
    }

    /* ── Cuerpo: mismo alto en todas las vistas, el modal no salta ──── */
    Item {
        width: parent ? parent.width : 0
        height: 372

        /* Catálogo */
        ColumnLayout {
            anchors.fill: parent
            visible: root.selected === null
            spacing: 12

            Label {
                Layout.fillWidth: true
                text: "Si el servicio ya está instalado en " + root.serverName + ", el mismo botón ofrece desinstalarlo por completo."
                textFormat: Text.PlainText
                tone: 0.45
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }

            ScrollArea {
                id: catalogScroll
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentHeight: grid.height

                Grid {
                    id: grid
                    /* Hueco a la derecha para la barra de desplazamiento. */
                    width: catalogScroll.width - 10
                    columns: width >= 500 ? 3 : 2
                    spacing: 12

                    readonly property real cellWidth: Math.floor((width - spacing * (columns - 1)) / columns)
                    /* Todas las tarjetas, tan altas como la más alta. */
                    property real cellHeight: 0
                    function measure() {
                        let tallest = 0
                        for (let i = 0; i < cells.count; i++) {
                            const cell = cells.itemAt(i)
                            if (cell) tallest = Math.max(tallest, cell.naturalHeight)
                        }
                        cellHeight = tallest
                    }

                    Repeater {
                        id: cells
                        model: root.catalog
                        onItemAdded: grid.measure()

                        delegate: Glass {
                            id: cell
                            required property var modelData
                            required property int index
                            /* El objeto original del catálogo, con su lista de variantes intacta. */
                            readonly property var item: root.catalog[index]
                            readonly property real naturalHeight: cellBody.implicitHeight + 32
                            onNaturalHeightChanged: grid.measure()

                            width: grid.cellWidth
                            height: grid.cellHeight
                            variant: "soft"
                            elevation: "flat"
                            radius: Theme.radiusXl
                            highlighted: cell.modelData.ready && cellHover.hovered
                            opacity: cell.modelData.ready ? 1 : 0.55
                            activeFocusOnTab: cell.modelData.ready
                            borderColor: cell.activeFocus ? Theme.focusRing
                                       : cell.highlighted ? Theme.hairlineHover : Theme.hairlineSoft

                            Accessible.role: Accessible.Button
                            Accessible.name: cell.modelData.name
                            Keys.onReturnPressed: root.select(cell.item)
                            Keys.onSpacePressed: root.select(cell.item)

                            Column {
                                id: cellBody
                                x: 16; y: 16
                                width: cell.width - 32
                                spacing: 2
                                ServiceLogo { type: cell.modelData.type; size: 32 }
                                Item { width: 1; height: 6 }
                                Label {
                                    width: parent.width
                                    text: cell.modelData.name
                                    font.weight: Font.DemiBold
                                }
                                Label {
                                    width: parent.width
                                    text: cell.modelData.desc
                                    tone: 0.45
                                    font.pixelSize: Theme.textXs
                                    wrapMode: Text.WordWrap
                                    elide: Text.ElideNone
                                }
                            }

                            Rectangle {
                                visible: !cell.modelData.ready
                                anchors.top: parent.top
                                anchors.right: parent.right
                                anchors.margins: 10
                                width: soon.implicitWidth + 12
                                height: soon.implicitHeight + 4
                                radius: Theme.radiusMd
                                color: Theme.tintActive
                                border.width: 1
                                border.color: Theme.hairline
                                Label {
                                    id: soon
                                    anchors.centerIn: parent
                                    text: "Próximamente"
                                    font.capitalization: Font.AllUppercase
                                    tone: 0.5
                                    font.pixelSize: 9
                                    font.weight: Font.Medium
                                    font.letterSpacing: 0.5
                                }
                            }

                            HoverHandler {
                                id: cellHover
                                cursorShape: cell.modelData.ready ? Qt.PointingHandCursor : Qt.ForbiddenCursor
                            }
                            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.select(cell.item) }
                            HoverTip {
                                text: !cell.modelData.ready ? "Disponible próximamente"
                                    : "Instalar o desinstalar " + cell.modelData.name + " en " + root.serverName
                                      + (cell.item.variants ? " (" + cell.item.variants.map(v => v.name).join(", ") + ")" : "")
                            }
                        }
                    }
                }
            }
        }

        /* Servicio elegido */
        ColumnLayout {
            anchors.fill: parent
            visible: root.selected !== null
            spacing: 0

            RowLayout {
                Layout.fillWidth: true
                Layout.bottomMargin: 16
                spacing: 12

                Glass {
                    Layout.preferredWidth: 48
                    Layout.preferredHeight: 48
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusXl
                    ServiceLogo { anchors.centerIn: parent; type: root.targetLogo; size: 28 }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2
                    Label {
                        Layout.fillWidth: true
                        text: !root.selected ? "" : root.target ? root.selected.name + " · " + root.target.name : root.selected.name
                        font.weight: Font.DemiBold
                    }
                    Label {
                        Layout.fillWidth: true
                        text: !root.selected ? ""
                            : root.selected.desc + " · en " + root.serverName
                              + (root.statusData && root.statusData.os ? " · " + root.statusData.os.name : "")
                        textFormat: Text.PlainText
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                    }
                }
            }

            ScrollArea {
                id: detailScroll
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentHeight: detail.implicitHeight

                Column {
                    id: detail
                    width: detailScroll.width - 10
                    spacing: 16

                    /* Comprobando */
                    Row {
                        visible: root.view === "loading"
                        width: parent.width
                        spacing: 12
                        Spinner { anchors.verticalCenter: parent.verticalCenter; size: 16; color: Theme.brandLight1 }
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width - 28
                            text: "Comprobando si " + (root.selected ? root.selected.name : "") + " ya está instalado…"
                            tone: 0.6
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }

                    /* Elegir variante del grupo */
                    Column {
                        visible: root.view === "picking"
                        width: parent.width
                        spacing: 8

                        Label {
                            width: parent.width
                            text: "Elige la distribución que quieres instalar en este servidor:"
                            tone: 0.5
                            font.pixelSize: Theme.textXs
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        Repeater {
                            model: root.grouped ? root.selected.variants : []
                            delegate: Glass {
                                id: option
                                required property var modelData
                                required property int index
                                readonly property var opt: root.support(option.modelData.id)
                                readonly property bool supported: opt ? opt.supported !== false : true
                                readonly property string reason: opt && opt.reason ? String(opt.reason) : ""

                                width: parent ? parent.width : 0
                                height: Math.max(36, optionText.implicitHeight) + 24
                                variant: "soft"
                                elevation: "flat"
                                radius: Theme.radiusXl
                                highlighted: option.supported && optionHover.hovered
                                opacity: option.supported ? 1 : 0.5
                                activeFocusOnTab: option.supported
                                borderColor: option.activeFocus ? Theme.focusRing
                                           : option.highlighted ? Theme.hairlineHover : Theme.hairlineSoft

                                function pick() { if (option.supported && root.grouped) root.variant = root.selected.variants[option.index] }

                                Accessible.role: Accessible.Button
                                Accessible.name: option.modelData.name
                                Keys.onReturnPressed: option.pick()
                                Keys.onSpacePressed: option.pick()

                                Glass {
                                    x: 12; y: 12
                                    width: 36; height: 36
                                    variant: "soft"
                                    elevation: "none"
                                    radius: Theme.radiusLg
                                    ServiceLogo { anchors.centerIn: parent; type: option.modelData.logo; size: 20 }
                                }
                                Column {
                                    id: optionText
                                    x: 60; y: 12
                                    width: option.width - 72
                                    Label {
                                        width: parent.width
                                        text: option.modelData.name
                                        font.weight: Font.DemiBold
                                    }
                                    Label {
                                        width: parent.width
                                        text: option.supported ? option.modelData.desc : option.reason
                                        textFormat: Text.PlainText
                                        tone: 0.5
                                        font.pixelSize: Theme.textXs
                                        wrapMode: Text.WordWrap
                                        elide: Text.ElideNone
                                    }
                                }

                                HoverHandler {
                                    id: optionHover
                                    cursorShape: option.supported ? Qt.PointingHandCursor : Qt.ForbiddenCursor
                                }
                                TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: option.pick() }
                                HoverTip { text: option.supported ? "Instalar " + option.modelData.name : option.reason }
                            }
                        }
                    }

                    /* No se pudo comprobar */
                    Notice {
                        visible: root.view === "statusError"
                        edge: Qt.alpha(Theme.danger, 0.25)
                        Label {
                            width: parent.width
                            text: root.statusError && root.statusError.message ? root.statusError.message : "No se pudo comprobar el servidor"
                            textFormat: Text.PlainText
                            color: Theme.tone("rose").text
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }

                    /* Pasos de la operación */
                    Column {
                        visible: root.view === "steps"
                        width: parent.width
                        spacing: 12
                        Repeater {
                            model: root.steps.length ? root.steps : [{ id: "ssh", label: "Conexión SSH", status: "running" }]
                            delegate: StepRow {
                                required property var modelData
                                step: modelData
                            }
                        }
                    }

                    /* Hace falta sudo */
                    Column {
                        visible: root.view === "sudo"
                        width: parent.width
                        spacing: 12

                        Notice {
                            pad: 16
                            Label {
                                width: parent.width
                                text: "Hace falta sudo"
                                font.weight: Font.DemiBold
                            }
                            Label {
                                width: parent.width
                                text: !root.error ? ""
                                    : root.error.code === "SUDO_PASSWORD" ? (root.error.message || "")
                                    : (root.error.hint || "El usuario SSH no es root y sudo pide contraseña.")
                                textFormat: Text.PlainText
                                tone: 0.6
                                font.pixelSize: Theme.textXs
                                lineHeight: 1.3
                                wrapMode: Text.WordWrap
                                elide: Text.ElideNone
                            }
                        }
                        GlassField {
                            id: sudoField
                            width: parent.width
                            password: true
                            maximumLength: 256
                            placeholder: "Contraseña del usuario SSH"
                            onAccepted: if (root.needsSudo && root.sudoDraft !== "" && !root.busy) root.run(root.sudoDraft)
                        }
                        Label {
                            width: parent.width
                            text: "Se usa solo para esta operación y no se guarda."
                            tone: 0.4
                            font.pixelSize: 11
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }

                    /* Ya está instalado: confirmar la desinstalación completa */
                    Column {
                        visible: root.view === "uninstall"
                        width: parent.width
                        spacing: 12

                        Notice {
                            edge: Qt.alpha(Theme.warn, 0.25)
                            Label {
                                width: parent.width
                                text: root.targetName + (root.statusData && root.statusData.version ? " · " + root.statusData.version : "")
                                      + " ya está instalado en este servidor"
                                textFormat: Text.PlainText
                                color: Theme.tone("amber").text
                                font.weight: Font.Medium
                                wrapMode: Text.WordWrap
                                elide: Text.ElideNone
                            }
                            Label {
                                width: parent.width
                                text: "¿Quieres desinstalarlo por completo? No quedará rastro del servicio, como si nunca se hubiera instalado. No se puede deshacer."
                                tone: 0.6
                                font.pixelSize: Theme.textXs
                                lineHeight: 1.3
                                wrapMode: Text.WordWrap
                                elide: Text.ElideNone
                            }
                        }
                        Column {
                            width: parent.width
                            spacing: 8
                            Repeater {
                                model: root.view === "uninstall" ? (root.whatUninstallDoes[root.targetId] || []) : []
                                delegate: Bullet {
                                    required property string modelData
                                    text: modelData
                                    danger: true
                                }
                            }
                        }
                    }

                    /* Este sistema no lo admite */
                    Notice {
                        visible: root.view === "blocked"
                        edge: Qt.alpha(Theme.warn, 0.25)
                        Label {
                            width: parent.width
                            text: "No se puede instalar " + root.targetName + " en este servidor"
                            color: Theme.tone("amber").text
                            font.weight: Font.Medium
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        Label {
                            width: parent.width
                            text: root.blocked
                            textFormat: Text.PlainText
                            tone: 0.6
                            font.pixelSize: Theme.textXs
                            lineHeight: 1.3
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }

                    /* Qué va a hacer la instalación */
                    Column {
                        visible: root.view === "plan"
                        width: parent.width
                        spacing: 8
                        Repeater {
                            model: root.view === "plan" ? (root.whatItDoes[root.targetId] || []) : []
                            delegate: Bullet {
                                required property string modelData
                                text: modelData
                            }
                        }
                    }

                    /* Resultado: terminó bien */
                    Notice {
                        id: okNotice
                        visible: root.resultOk
                        edge: Qt.alpha(Theme.ok, 0.25)

                        readonly property var access: root.resultOk && root.result.mode === "install" && root.result.access
                            ? root.result.access : null
                        readonly property string accessUrl: access && access.url && /^https?:\/\//i.test(String(access.url))
                            ? String(access.url) : ""
                        readonly property string accessKey: access && access.key ? String(access.key) : ""
                        readonly property string summary: !root.resultOk || root.result.mode !== "install" ? ""
                            : [root.result.version, root.result.os ? root.result.os.name : ""].filter(Boolean).join(" · ")

                        Label {
                            width: parent.width
                            text: !root.resultOk ? ""
                                : root.result.mode === "uninstall" ? root.targetName + " se desinstaló por completo: no queda rastro en el servidor"
                                : root.result.alreadyInstalled ? root.targetName + " ya estaba instalado y está en marcha"
                                : root.targetName + " instalado y en marcha"
                            color: Theme.tone("emerald").text
                            font.weight: Font.Medium
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        Label {
                            width: parent.width
                            visible: text !== ""
                            text: okNotice.summary
                            textFormat: Text.PlainText
                            tone: 0.5
                            font.pixelSize: Theme.textXs
                        }

                        /* Datos para usarlo (VPN): enlace, textos y clave pública. */
                        Column {
                            id: accessBox
                            readonly property var notice: okNotice
                            visible: notice.access !== null
                            width: parent.width
                            topPadding: 8
                            spacing: 8

                            Rectangle { width: parent.width; height: 1; color: Theme.line }

                            T.Button {
                                id: linkButton
                                visible: accessBox.notice.accessUrl !== ""
                                implicitHeight: 36
                                implicitWidth: linkRow.implicitWidth + 32
                                hoverEnabled: true
                                scale: down ? 0.98 : 1
                                onClicked: App.openExternal(accessBox.notice.accessUrl)

                                background: Item {
                                    Elevation {
                                        anchors.fill: parent
                                        radius: Theme.radiusXl
                                        level: linkButton.hovered ? "brand" : "brandSm"
                                    }
                                    BrandFill { anchors.fill: parent }
                                    Rectangle {
                                        visible: linkButton.visualFocus
                                        anchors.fill: parent
                                        anchors.margins: -3
                                        radius: Theme.radiusXl + 3
                                        color: "transparent"
                                        border.width: 2
                                        border.color: Theme.focusRing
                                    }
                                }
                                contentItem: Item {
                                    Row {
                                        id: linkRow
                                        anchors.centerIn: parent
                                        spacing: 8
                                        Label {
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: "Vincular a tu red"
                                            color: Theme.onBrand
                                            font.weight: Font.DemiBold
                                        }
                                        Icon {
                                            anchors.verticalCenter: parent.verticalCenter
                                            size: 14
                                            color: Theme.onBrand
                                            path: "M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"
                                        }
                                    }
                                }
                                HoverHandler { cursorShape: Qt.PointingHandCursor }
                            }

                            Repeater {
                                model: accessBox.notice.access && accessBox.notice.access.info ? Array.from(accessBox.notice.access.info) : []
                                delegate: Label {
                                    required property string modelData
                                    width: accessBox.width
                                    text: modelData
                                    textFormat: Text.PlainText
                                    tone: 0.65
                                    font.pixelSize: Theme.textXs
                                    lineHeight: 1.3
                                    wrapMode: Text.WordWrap
                                    elide: Text.ElideNone
                                }
                            }

                            RowLayout {
                                visible: accessBox.notice.accessKey !== ""
                                width: parent.width
                                spacing: 8

                                Label {
                                    /* En una ventana estrecha la clave necesita el sitio. */
                                    visible: accessBox.width >= 360
                                    text: "Clave pública"
                                    font.capitalization: Font.AllUppercase
                                    tone: 0.4
                                    font.pixelSize: 11
                                    font.weight: Font.DemiBold
                                    font.letterSpacing: 0.5
                                }
                                Rectangle {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: 24
                                    radius: Theme.radiusLg
                                    color: Theme.tintSunken
                                    Label {
                                        anchors.verticalCenter: parent.verticalCenter
                                        x: 8
                                        width: parent.width - 16
                                        text: accessBox.notice.accessKey
                                        textFormat: Text.PlainText
                                        mono: true
                                        tone: 0.85
                                        font.pixelSize: Theme.textXs
                                    }
                                    HoverTip { text: accessBox.notice.accessKey }
                                }
                                SecondaryButton {
                                    implicitHeight: 28
                                    implicitWidth: 72
                                    text: "Copiar"
                                    onClicked: {
                                        App.copy(accessBox.notice.accessKey)
                                        Toasts.success("Clave pública copiada", "")
                                    }
                                    HoverTip { text: "Copiar la clave pública" }
                                }
                            }
                        }
                    }

                    /* Resultado: no terminó */
                    Notice {
                        id: failNotice
                        visible: root.result !== null && !root.resultOk
                        edge: Qt.alpha(Theme.danger, 0.25)

                        readonly property string failure: root.result && root.result.error && root.result.error.message
                            ? String(root.result.error.message) : "No se pudo completar"
                        readonly property string failureDetail: root.result && root.result.error && root.result.error.detail
                            ? String(root.result.error.detail) : ""

                        Label {
                            width: parent.width
                            text: failNotice.failure
                            textFormat: Text.PlainText
                            color: Theme.tone("rose").text
                            font.weight: Font.Medium
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        ScrollArea {
                            visible: failNotice.failureDetail !== ""
                            width: parent.width
                            height: Math.min(112, failureText.implicitHeight)
                            contentHeight: failureText.implicitHeight
                            Label {
                                id: failureText
                                width: parent.width
                                text: failNotice.failureDetail
                                textFormat: Text.PlainText
                                mono: true
                                tone: 0.5
                                font.pixelSize: 11
                                wrapMode: Text.WrapAnywhere
                                elide: Text.ElideNone
                            }
                        }
                    }

                    /* La petición falló (no es cuestión de sudo) */
                    Notice {
                        visible: root.error !== null && !root.needsSudo
                        edge: Qt.alpha(Theme.danger, 0.25)
                        Label {
                            width: parent.width
                            text: root.error && root.error.message ? root.error.message : "No se pudo completar"
                            textFormat: Text.PlainText
                            color: Theme.tone("rose").text
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.topMargin: 12
                Layout.preferredHeight: 1
                color: Theme.line
            }
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 12
                spacing: 8

                GhostButton {
                    iconName: "chevronLeft"
                    text: root.backToVariants ? "Distribuciones" : "Catálogo"
                    enabled: !root.busy
                    onClicked: root.back()
                }
                Item { Layout.fillWidth: true }
                PrimaryButton {
                    visible: root.resultOk
                    text: "Listo"
                    onClicked: root.close()
                }
                PrimaryButton {
                    visible: !root.resultOk && root.statusError !== null
                    text: "Reintentar"
                    enabled: !root.statusLoading
                    onClicked: root.loadStatus()
                }
                PrimaryButton {
                    visible: !root.resultOk && root.statusError === null && !root.uninstalling
                    text: root.runLabel
                    loading: root.busy
                    enabled: root.runEnabled
                    onClicked: root.run(root.needsSudo ? root.sudoDraft : (root.sudoPassword || Sudo.get(root.serverId)))
                }
                DangerButton {
                    visible: !root.resultOk && root.statusError === null && root.uninstalling
                    text: root.runLabel
                    loading: root.busy
                    enabled: root.runEnabled
                    onClicked: root.run(root.needsSudo ? root.sudoDraft : (root.sudoPassword || Sudo.get(root.serverId)))
                }
            }
        }
    }
}
