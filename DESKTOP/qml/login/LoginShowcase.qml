import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import StartCode

/* Panel izquierdo del login: escaparate decorativo con cifras, gráfica,
   órbita de servidores y un registro que avanza solo. Nada de lo que muestra
   sale del backend; solo se ve en ventanas anchas. */
Item {
    id: root

    /* Titular más grande en ventanas muy anchas (`xl:text-4xl`). */
    property bool large: false

    readonly property real inner: width - 80
    /* Las animaciones continuas paran con «Reducir animaciones» o fuera de vista. */
    readonly property bool animated: visible && !Theme.reducedMotion
    /* La órbita mide 300 px fijos: si deja a las tarjetas sin sitio, se oculta. */
    readonly property bool showOrbit: inner - 320 >= 180

    /* Cifras que oscilan alrededor de un valor base. */
    property real cpu: 64
    property real reqs: 1240
    property real latency: 38
    function drift(base, range, top) {
        return Math.max(0, Math.min(top, base + (Math.random() - 0.5) * range * 2))
    }
    Timer {
        interval: 600
        repeat: true
        running: root.visible
        onTriggered: {
            root.cpu = root.drift(64, 8, 100)
            root.reqs = root.drift(1240, 80, 2000)
            root.latency = root.drift(38, 6, 120)
        }
    }

    clip: true

    LoginGlow {
        x: -200; y: -250
        width: 640; height: 640
        tint: Theme.brandStart
        strength: 0.3
    }
    LoginGlow {
        x: root.width - 440; y: root.height - 420
        width: 640; height: 640
        tint: Theme.brandEnd
        strength: 0.2
    }

    /* ── Piezas ────────────────────────────────────────────────────── */
    component Caption: Label {
        tone: 0.45
        font.pixelSize: Theme.textCaption
        font.weight: Font.DemiBold
        font.capitalization: Font.AllUppercase
        font.letterSpacing: 0.5
    }

    component MiniStat: Glass {
        id: stat
        property string caption: ""
        property string figure: ""
        property real bar: 0
        property color barFrom: Theme.brandStart
        property color barTo: Theme.brandEnd

        variant: "soft"
        radius: Theme.radiusXl
        implicitHeight: 81

        Caption {
            x: 12; y: 12
            width: stat.width - 24; height: 15
            verticalAlignment: Text.AlignVCenter
            text: stat.caption
        }
        Label {
            x: 12; y: 29
            width: stat.width - 24; height: 28
            verticalAlignment: Text.AlignVCenter
            text: stat.figure
            font.pixelSize: 18
            font.weight: Font.Bold
        }
        Rectangle {
            x: 12; y: 65
            width: stat.width - 24; height: 4
            radius: 2
            color: Theme.track
            Rectangle {
                width: parent.width * Math.max(0, Math.min(100, stat.bar)) / 100
                height: parent.height
                radius: 2
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: stat.barFrom }
                    GradientStop { position: 1; color: stat.barTo }
                }
                Behavior on width { NumberAnimation { duration: Theme.reducedMotion ? 1 : 700 } }
            }
        }
    }

    component MetricChip: Glass {
        id: chip
        property string iconPath: ""
        property string caption: ""
        property string figure: ""
        property string sub: ""
        property string toneName: "emerald"
        readonly property var colors: Theme.tone(toneName)

        elevation: "raised"
        implicitHeight: 99

        Item {
            id: tile
            x: 16; y: 16 + 3.5
            width: 36; height: 36
            BrandFill {
                anchors.fill: parent
                radius: Theme.radiusLg
                from: Qt.alpha(chip.colors.base, 0.3)
                to: Qt.alpha(chip.colors.base, 0.1)
            }
            Rectangle {
                anchors.fill: parent
                radius: Theme.radiusLg
                color: "transparent"
                border.width: 1
                border.color: Qt.alpha(chip.colors.base, 0.2)
            }
            Icon {
                anchors.centerIn: parent
                path: chip.iconPath
                size: 20
                strokeWidth: 1.6
                color: chip.colors.text
            }
        }
        Caption {
            x: 62; y: 16
            width: chip.width - 78; height: 15
            verticalAlignment: Text.AlignVCenter
            text: chip.caption
        }
        Label {
            x: 62; y: 31
            width: chip.width - 78; height: 28
            verticalAlignment: Text.AlignVCenter
            text: chip.figure
            color: chip.colors.text
            font.pixelSize: 20
            font.weight: Font.Bold
            font.letterSpacing: -0.5
        }
        Label {
            x: 16; y: 67
            width: chip.width - 32; height: 16
            verticalAlignment: Text.AlignVCenter
            text: chip.sub
            tone: 0.55
            font.pixelSize: Theme.textXs
        }
    }

    /* Gráfica que avanza un punto cada 700 ms. */
    component LiveSpark: Item {
        id: spark
        property color stroke: Theme.brandLight1
        property var pts: {
            const out = []
            for (let i = 0; i < 28; i++)
                out.push(30 + Math.random() * 50)
            return out
        }
        function py(p) { return height - (p / 100) * (height - 6) - 3 }
        readonly property string line: {
            const n = pts.length
            let d = ""
            for (let i = 0; i < n; i++)
                d += (i === 0 ? "M " : " L ") + ((i / (n - 1)) * width).toFixed(2) + " " + py(pts[i]).toFixed(2)
            return d
        }

        Timer {
            interval: 700
            repeat: true
            running: root.visible
            onTriggered: {
                const last = spark.pts[spark.pts.length - 1]
                spark.pts = spark.pts.slice(1).concat([Math.max(15, Math.min(92, last + (Math.random() - 0.5) * 22))])
            }
        }

        Shape {
            anchors.fill: parent
            visible: spark.width > 0
            preferredRendererType: Shape.CurveRenderer
            ShapePath {
                strokeColor: "transparent"
                fillGradient: LinearGradient {
                    x1: 0; y1: 0
                    x2: 0; y2: spark.height
                    GradientStop { position: 0; color: Qt.alpha(spark.stroke, 0.4) }
                    GradientStop { position: 1; color: Qt.alpha(spark.stroke, 0) }
                }
                PathSvg { path: spark.line + " L " + spark.width.toFixed(2) + " " + spark.height + " L 0 " + spark.height + " Z" }
            }
            ShapePath {
                strokeColor: spark.stroke
                strokeWidth: 1.5
                fillColor: "transparent"
                capStyle: ShapePath.RoundCap
                joinStyle: ShapePath.RoundJoin
                PathSvg { path: spark.line }
            }
        }
        Rectangle {
            width: 6; height: 6
            radius: 3
            color: spark.stroke
            x: spark.width - 3
            y: spark.py(spark.pts[spark.pts.length - 1]) - 3
        }
    }

    component NodeLabel: Row {
        id: node
        property string nodeName: ""
        property bool degraded: false
        readonly property color dotColor: degraded ? Theme.warn : Theme.ok

        spacing: 6

        Item {
            anchors.verticalCenter: parent.verticalCenter
            width: 10; height: 10
            Rectangle {
                id: ring
                anchors.fill: parent
                radius: 5
                color: node.dotColor
                opacity: 0
                SequentialAnimation {
                    running: root.animated
                    loops: Animation.Infinite
                    ParallelAnimation {
                        NumberAnimation { target: ring; property: "scale"; from: 0.6; to: 2.4; duration: 1760; easing.type: Easing.OutQuad }
                        NumberAnimation { target: ring; property: "opacity"; from: 0.7; to: 0; duration: 1760; easing.type: Easing.OutQuad }
                    }
                    PauseAnimation { duration: 440 }
                }
            }
            Rectangle {
                anchors.fill: parent
                radius: 5
                color: node.dotColor
            }
        }
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: nodeText.implicitWidth + 12
            height: nodeText.implicitHeight + 4
            radius: 4
            color: Theme.shadow(0.4)
            Label {
                id: nodeText
                anchors.centerIn: parent
                text: node.nodeName
                mono: true
                tone: 0.65
                font.pixelSize: Theme.textCaption
            }
        }
    }

    component OrbitDot: Rectangle {
        property real cx: 0
        property real cy: 0
        property real r: 3
        x: cx - r; y: cy - r
        width: r * 2; height: r * 2
        radius: r
    }

    component DashedRing: Shape {
        id: dashed
        property real r: 100
        property color stroke: Theme.edgeDashed
        property var dashes: [4, 4]
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: dashed.stroke
            strokeWidth: 1
            fillColor: "transparent"
            strokeStyle: ShapePath.DashLine
            dashPattern: dashed.dashes
            PathAngleArc {
                centerX: dashed.width / 2; centerY: dashed.height / 2
                radiusX: dashed.r; radiusY: dashed.r
                startAngle: 0; sweepAngle: 360
            }
        }
    }

    /* Órbita de nodos alrededor del servidor: dos capas que giran en sentidos opuestos. */
    component ServerOrbit: Item {
        id: orbit
        width: 300; height: 300

        Glass {
            anchors.centerIn: parent
            width: 112; height: 112
            radius: 56
            elevation: "raised"

            LoginGlow {
                anchors.centerIn: parent
                width: 150; height: 150
                tint: Theme.brandStart
                strength: 0.3
            }
            Item {
                anchors.centerIn: parent
                width: 48; height: 48
                Elevation {
                    anchors.fill: parent
                    radius: Theme.radius2xl
                    level: "brandHi"
                }
                BrandFill {
                    anchors.fill: parent
                    radius: Theme.radius2xl
                }
                Icon {
                    anchors.centerIn: parent
                    path: "M4.5 4h15a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 9.5v-4A1.5 1.5 0 014.5 4zM4.5 13h15a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5v-4A1.5 1.5 0 014.5 13zM7 7.5h.01M7 16.5h.01M15 7.5h3M15 16.5h3"
                    size: 20
                    strokeWidth: 1.6
                    color: Theme.onBrand
                }
            }
        }

        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: "transparent"
            border.width: 1
            border.color: Theme.hairline
        }
        DashedRing {
            anchors.fill: parent
            r: 126
            stroke: Theme.edgeDashed
            dashes: [3, 3]
        }
        Rectangle {
            anchors.fill: parent
            anchors.margins: 48
            radius: width / 2
            color: "transparent"
            border.width: 1
            border.color: Theme.hairlineSoft
        }

        Item {
            anchors.fill: parent
            DashedRing {
                anchors.fill: parent
                r: 138
                stroke: Theme.brand1(0.25)
                dashes: [2, 6]
            }
            OrbitDot { cx: 150; cy: 12; r: 5; color: Theme.brandLight1 }
            OrbitDot { cx: 288; cy: 150; r: 4; color: Theme.brandLight2 }
            OrbitDot { cx: 150; cy: 288; r: 3.5; color: Theme.auroras[2] }
            RotationAnimator on rotation {
                running: root.animated
                from: 0; to: 360
                duration: 22000
                loops: Animation.Infinite
            }
        }
        Item {
            anchors.fill: parent
            DashedRing {
                anchors.fill: parent
                r: 100
                stroke: Theme.brand2(0.18)
                dashes: [4, 8]
            }
            OrbitDot { cx: 250; cy: 150; r: 3; color: Theme.brandLight2 }
            OrbitDot { cx: 50; cy: 150; r: 3; color: Theme.brandStart }
            RotationAnimator on rotation {
                running: root.animated
                from: 360; to: 0
                duration: 30000
                loops: Animation.Infinite
            }
        }

        NodeLabel {
            nodeName: "eu-west-1"
            anchors.horizontalCenter: parent.horizontalCenter
            y: -8
        }
        NodeLabel {
            nodeName: "ap-south-2"
            anchors.horizontalCenter: parent.horizontalCenter
            y: orbit.height + 8 - height
        }
        NodeLabel {
            nodeName: "us-east-1"
            anchors.verticalCenter: parent.verticalCenter
            x: orbit.width + 16 - width
        }
        NodeLabel {
            nodeName: "sa-east-1"
            degraded: true
            anchors.verticalCenter: parent.verticalCenter
            x: -16
        }
    }

    /* Registro del agente: una línea nueva cada 1,4 s; al entrar, todas suben
       con un fundido escalonado. */
    component TerminalFeed: Glass {
        id: feed

        readonly property var logs: [
            ["INFO", "sched: deploy released-2026.05.17 → us-east-1", "emerald"],
            ["OK", "db.pool: connections 6/100 · latency 12ms", "emerald"],
            ["INFO", "agent[devstar] heartbeat · uptime 8w2d", ""],
            ["WARN", "cpu.load reached 78% on devstar", "amber"],
            ["INFO", "tls.cert renewed (cloud.startcode.com.co)", "violet"],
            ["OK", "backup.snapshot.daily completed in 47s", "emerald"],
            ["INFO", "metrics: ingested 28,431 events in last 1m", "sky"],
            ["INFO", "auth.session.refresh admin@startcode.local", ""],
            ["OK", "load.balancer: 12 nodes healthy / 12 total", "emerald"],
            ["INFO", "queue.jobs processed=412 failed=0 backlog=3", "fuchsia"]
        ]
        property var lines: logs.slice(0, 5)
        property int cursor: 5
        property double now: Date.now()

        elevation: "raised"
        implicitHeight: 41 + 152

        Timer {
            interval: 1400
            repeat: true
            running: root.visible
            onTriggered: {
                feed.now = Date.now()
                feed.lines = feed.lines.slice(-6).concat([feed.logs[feed.cursor % feed.logs.length]])
                feed.cursor += 1
            }
        }

        Item {
            id: bar
            width: feed.width; height: 40

            Row {
                x: 16
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8
                Rectangle { anchors.verticalCenter: parent.verticalCenter; width: 10; height: 10; radius: 5; color: Qt.alpha(Theme.danger, 0.9) }
                Rectangle { anchors.verticalCenter: parent.verticalCenter; width: 10; height: 10; radius: 5; color: Qt.alpha(Theme.warn, 0.9) }
                Rectangle { anchors.verticalCenter: parent.verticalCenter; width: 10; height: 10; radius: 5; color: Qt.alpha(Theme.ok, 0.9) }
                Item { width: 1; height: 1 }
                Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    path: "M5 7l4 5-4 5M12 17h7"
                    size: 20
                    strokeWidth: 1.6
                    color: Theme.ink(0.55)
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: feed.width >= 300
                    text: "~/startcode/agent.log"
                    mono: true
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                }
            }
            Row {
                anchors.right: parent.right
                anchors.rightMargin: 16
                anchors.verticalCenter: parent.verticalCenter
                spacing: 6
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 6; height: 6
                    radius: 3
                    color: Theme.ok
                    SequentialAnimation on opacity {
                        running: root.animated
                        loops: Animation.Infinite
                        NumberAnimation { from: 1; to: 0.5; duration: 1000; easing.type: Easing.InOutQuad }
                        NumberAnimation { from: 0.5; to: 1; duration: 1000; easing.type: Easing.InOutQuad }
                    }
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "LIVE"
                    mono: true
                    color: Theme.tone("emerald").text
                    font.pixelSize: Theme.textCaption
                }
            }
        }
        Rectangle {
            y: 40
            width: feed.width; height: 1
            color: Theme.line
        }

        Item {
            y: 41
            width: feed.width; height: 152
            clip: true

            Column {
                id: feedColumn
                x: 16; y: 12
                width: parent.width - 32

                Repeater {
                    model: feed.lines

                    Item {
                        id: entry
                        required property var modelData
                        required property int index
                        readonly property color levelColor: modelData[2] === "" ? Theme.ink(0.65) : Theme.tone(modelData[2]).text

                        width: feedColumn.width; height: 18
                        opacity: 0

                        Item {
                            id: shift
                            width: entry.width; height: entry.height
                            Label {
                                id: stamp
                                anchors.verticalCenter: parent.verticalCenter
                                text: Qt.formatTime(new Date(feed.now - (feed.lines.length - entry.index) * 1400), "HH:mm:ss")
                                mono: true
                                tone: 0.3
                                font.pixelSize: 11
                            }
                            Label {
                                id: level
                                anchors.left: stamp.right
                                anchors.leftMargin: 8
                                anchors.verticalCenter: parent.verticalCenter
                                text: "[" + entry.modelData[0] + "]"
                                mono: true
                                color: entry.levelColor
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                            }
                            Label {
                                anchors.left: level.right
                                anchors.leftMargin: 8
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                text: entry.modelData[1]
                                mono: true
                                tone: 0.75
                                font.pixelSize: 11
                            }
                        }

                        SequentialAnimation {
                            running: true
                            PauseAnimation { duration: Theme.reducedMotion ? 0 : entry.index * 30 }
                            ParallelAnimation {
                                NumberAnimation { target: entry; property: "opacity"; from: 0; to: 1; duration: Theme.reducedMotion ? 1 : 400; easing.type: Easing.OutQuad }
                                NumberAnimation { target: shift; property: "y"; from: 4; to: 0; duration: Theme.reducedMotion ? 1 : 400; easing.type: Easing.OutQuad }
                            }
                        }
                    }
                }

                Item {
                    width: parent.width; height: 20
                    Row {
                        y: 2
                        height: 18
                        spacing: 8
                        Label { anchors.verticalCenter: parent.verticalCenter; text: "$"; mono: true; color: Theme.brandLight1; font.pixelSize: 11 }
                        Label { anchors.verticalCenter: parent.verticalCenter; text: "tail -f agent.log"; mono: true; tone: 0.55; font.pixelSize: 11 }
                        Label {
                            id: caret
                            anchors.verticalCenter: parent.verticalCenter
                            text: "▍"
                            mono: true
                            tone: 0.55
                            font.pixelSize: 11
                            Timer {
                                interval: 500
                                repeat: true
                                running: root.animated
                                onTriggered: caret.opacity = caret.opacity > 0 ? 0 : 1
                            }
                        }
                    }
                }
            }
        }
    }

    /* ── Contenido ─────────────────────────────────────────────────── */
    Column {
        x: 40; y: 40
        width: root.inner
        spacing: 20

        RowLayout {
            width: parent.width
            spacing: 8
            Label {
                Layout.maximumWidth: root.inner - 80
                text: "// Status global · en tiempo real"
                tone: 0.45
                font.pixelSize: Theme.textCaption
                font.weight: Font.DemiBold
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 2
            }
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 1
                color: Theme.line
            }
            Label {
                text: "SYNCED"
                mono: true
                color: Theme.tone("emerald").text
                font.pixelSize: Theme.textCaption
            }
        }

        Column {
            width: parent.width
            spacing: -4
            Label {
                width: parent.width
                text: "Tu infraestructura,"
                font.pixelSize: root.large ? 36 : 30
                font.weight: Font.Bold
                font.letterSpacing: root.large ? -0.9 : -0.75
            }
            LoginGradientText {
                width: Math.min(implicitWidth, root.inner)
                text: "orquestada en una sola vista."
                wrapMode: Text.WordWrap
                font.pixelSize: root.large ? 36 : 30
                font.weight: Font.Bold
                font.letterSpacing: root.large ? -0.9 : -0.75
            }
        }

        Item {
            width: parent.width
            height: pitch.implicitHeight - 4
            Label {
                id: pitch
                y: -4
                width: Math.min(448, root.inner)
                text: "Métricas, logs y despliegues en vivo. Acceso seguro a tus servidores con autenticación cifrada extremo a extremo."
                tone: 0.55
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        Row {
            width: parent.width
            spacing: 12
            MiniStat {
                width: (root.inner - 24) / 3
                caption: "Latencia p50"
                figure: Math.round(root.latency) + "ms"
                bar: root.latency / 120 * 100
                barFrom: Theme.tone("emerald").base
                barTo: Theme.tone("teal").base
            }
            MiniStat {
                width: (root.inner - 24) / 3
                caption: "Requests/s"
                figure: Number(Math.round(root.reqs)).toLocaleString(Qt.locale("es_CO"), "f", 0)
                bar: root.reqs / 2000 * 100
                barFrom: Theme.brandStart
                barTo: Theme.brandEnd
            }
            MiniStat {
                width: (root.inner - 24) / 3
                caption: "CPU media"
                figure: Math.round(root.cpu) + "%"
                bar: root.cpu
                barFrom: Theme.tone("sky").base
                barTo: Theme.tone("cyan").base
            }
        }

        Item {
            width: parent.width
            height: 8 + Math.max(cards.height, root.showOrbit ? 300 : 0)

            Column {
                id: cards
                y: 8 + (parent.height - 8 - height) / 2
                width: root.showOrbit ? root.inner - 320 : root.inner
                spacing: 12

                Glass {
                    id: cpuCard
                    width: parent.width
                    elevation: "raised"
                    implicitHeight: 114
                    height: implicitHeight

                    Icon {
                        id: cpuIcon
                        x: 16; y: 16
                        path: "M3 12h4l3-9 4 18 3-9h4"
                        size: 20
                        strokeWidth: 1.6
                        color: Theme.brandLight1
                    }
                    Label {
                        anchors.left: cpuIcon.right
                        anchors.leftMargin: 8
                        anchors.right: liveTag.left
                        anchors.rightMargin: 8
                        anchors.verticalCenter: cpuIcon.verticalCenter
                        text: "CPU · cluster-prod"
                        tone: 0.7
                        font.pixelSize: Theme.textXs
                        font.weight: Font.Medium
                    }
                    Label {
                        id: liveTag
                        anchors.right: parent.right
                        anchors.rightMargin: 16
                        anchors.verticalCenter: cpuIcon.verticalCenter
                        text: "live"
                        mono: true
                        color: Theme.brandLight1
                        font.pixelSize: Theme.textXs
                    }
                    LiveSpark {
                        x: 16; y: 42
                        width: cpuCard.width - 32
                        height: 56
                    }
                }

                Row {
                    width: parent.width
                    spacing: 12
                    MetricChip {
                        width: (cards.width - 12) / 2
                        height: implicitHeight
                        iconPath: "M4 5a8 3 0 1 0 16 0a8 3 0 1 0 -16 0M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"
                        caption: "Base de datos"
                        figure: "6/100"
                        sub: "conexiones · 12ms p50"
                        toneName: "amber"
                    }
                    MetricChip {
                        width: (cards.width - 12) / 2
                        height: implicitHeight
                        iconPath: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"
                        caption: "Sitios web"
                        figure: "34"
                        sub: "todos resolviendo"
                        toneName: "emerald"
                    }
                }
            }

            ServerOrbit {
                visible: root.showOrbit
                x: root.inner - 300
                y: 8 + (parent.height - 8 - 300) / 2
            }
        }

        TerminalFeed {
            width: parent.width
            height: implicitHeight
        }
    }
}
