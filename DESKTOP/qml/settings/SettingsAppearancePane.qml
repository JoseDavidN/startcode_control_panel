import QtQuick
import QtQuick.Shapes
import StartCode

/* Configuración → Aspecto: tema, tipografía, barra lateral y movimiento.
   Cada elección se aplica al instante y se guarda sola en la cuenta. */
Column {
    id: root

    readonly property var appearance: (Auth.preferences && Auth.preferences.appearance) || ({})
    readonly property string themeChoice: appearance.theme || "dark"
    readonly property string fontChoice: appearance.font || "grotesk"
    readonly property string sidebarMode: appearance.sidebarMode || "expanded"
    readonly property bool reducedMotion: appearance.reducedMotion === true

    /* Tres tarjetas en fila solo si cada una conserva un ancho legible. */
    readonly property bool threeUp: width >= 620
    readonly property bool twoUp: width >= 520
    readonly property real thirdWidth: threeUp ? (width - 24) / 3 : width
    readonly property real halfWidth: twoUp ? (width - 12) / 2 : width

    function setTheme(value) { Auth.patchPreferences("appearance", { theme: value }) }
    function setFont(value) { Auth.patchPreferences("appearance", { font: value }) }
    function setSidebarMode(value) { Auth.patchPreferences("appearance", { sidebarMode: value }) }
    function setReducedMotion(value) { Auth.patchPreferences("appearance", { reducedMotion: value }) }

    spacing: 32

    /* ── Tarjeta elegible (un `radio`): vista previa, nombre y descripción ── */
    component OptionCard: Glass {
        id: card

        property bool selected: false
        property string name: ""
        property string desc: ""
        /* Dato secundario a la derecha del nombre (peso de la tipografía). */
        property string note: ""
        /* Alto propio del contenido: la fila iguala todas a la más alta. */
        readonly property real naturalHeight: cardColumn.implicitHeight + 24
        default property alias preview: previewSlot.data

        signal picked()
        /* Flechas del teclado: quien agrupa las tarjetas decide qué hacen. */
        signal arrowPressed()

        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        implicitHeight: naturalHeight
        height: implicitHeight
        highlighted: !selected && cardHover.hovered
        activeFocusOnTab: selected

        Accessible.role: Accessible.RadioButton
        Accessible.name: name
        Accessible.description: desc
        Accessible.checkable: true
        Accessible.checked: selected
        Accessible.onPressAction: card.picked()

        Keys.onPressed: event => {
            if (event.key === Qt.Key_Space || event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                event.accepted = true
                card.picked()
            } else if (event.key === Qt.Key_Left || event.key === Qt.Key_Right
                       || event.key === Qt.Key_Up || event.key === Qt.Key_Down) {
                event.accepted = true
                card.arrowPressed()
            }
        }

        /* Elegida: tinte de selección y anillo de marca. */
        Rectangle {
            anchors.fill: parent
            radius: card.radius
            visible: card.selected
            color: Theme.tintActive
            border.width: 2
            border.color: Qt.alpha(Theme.brandLight1, 0.6)
        }
        Rectangle {
            visible: card.activeFocus
            anchors.fill: parent
            anchors.margins: -3
            radius: card.radius + 3
            color: "transparent"
            border.width: 2
            border.color: Theme.focusRing
        }

        Column {
            id: cardColumn
            x: 12; y: 12
            width: card.width - 24

            Item {
                id: previewSlot
                width: parent.width
                height: 104
            }
            Item { width: 1; height: 12 }
            Item {
                width: parent.width
                height: 20

                Item {
                    id: dot
                    anchors.verticalCenter: parent.verticalCenter
                    width: 16; height: 16
                    Rectangle {
                        anchors.fill: parent
                        radius: 8
                        visible: !card.selected
                        color: "transparent"
                        border.width: 1
                        border.color: Theme.hairlineStrong
                    }
                    BrandFill { anchors.fill: parent; visible: card.selected; radius: 8 }
                    Icon { anchors.centerIn: parent; visible: card.selected; name: "check"; size: 10; color: Theme.onBrand }
                }
                Label {
                    anchors.left: dot.right
                    anchors.leftMargin: 8
                    anchors.right: noteLabel.left
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    text: card.name
                    font.weight: Font.Medium
                }
                Label {
                    id: noteLabel
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    text: card.note
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                }
            }
            Item { width: 1; height: 6 }
            Label {
                width: parent.width
                text: card.desc
                tone: 0.5
                font.pixelSize: Theme.textXs
                lineHeight: 1.5
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        HoverHandler { id: cardHover; cursorShape: Qt.PointingHandCursor }
        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            onTapped: { card.forceActiveFocus(); card.picked() }
        }
    }

    /* ── Miniatura de un tema ───────────────────────────────────────────
       Pinta la paleta del tema que representa, no la del activo: las tres
       tarjetas se ven a la vez. Los colores salen de `Theme.palettes`. */
    component ThemePreview: Item {
        id: mini

        property string themeId: "dark"
        /* Opacidad de la tinta de la miniatura (única cifra que no está en la paleta). */
        property real inkAlpha: 0.85

        readonly property var pal: Theme.palettes[themeId]
        readonly property color panel: Theme.rgba(pal.surfaceRgb, pal.glassAlpha.glass)
        readonly property color edge: Theme.rgba(pal.edgeRgb, pal.edge.hairline)
        readonly property color inkColor: Theme.rgba(pal.inkChannel, inkAlpha)
        readonly property color accent1: Theme.rgba(pal.brand1Rgb, 1)
        readonly property color accent2: Theme.rgba(pal.brand2Rgb, 1)

        anchors.fill: parent

        /* Fondo radial del tema, con el foco arriba a la izquierda como en la app. */
        Shape {
            anchors.fill: parent
            preferredRendererType: Shape.CurveRenderer
            ShapePath {
                strokeColor: "transparent"
                fillGradient: RadialGradient {
                    centerX: mini.width * 0.2; centerY: 0
                    focalX: centerX; focalY: centerY
                    centerRadius: Math.max(1, Math.hypot(mini.width * 0.8, mini.height))
                    GradientStop { position: 0.0; color: mini.pal.bg[0] }
                    GradientStop { position: 0.35; color: mini.pal.bg[1] }
                    GradientStop { position: 0.8; color: mini.pal.bg[2] }
                }
                PathRectangle { width: mini.width; height: mini.height; radius: Theme.radiusXl }
            }
        }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusXl
            color: "transparent"
            border.width: 1
            border.color: mini.edge
        }

        /* Riel */
        Rectangle {
            id: miniRail
            x: 10; y: 10
            width: 42
            height: parent.height - 20
            radius: Theme.radiusLg
            color: mini.panel
            border.width: 1
            border.color: mini.edge

            Column {
                x: 6; y: 6
                width: parent.width - 12
                spacing: 6
                BrandFill { width: 12; height: 12; radius: 4; from: mini.accent1; to: mini.accent2 }
                Repeater {
                    model: 3
                    Rectangle {
                        required property int index
                        width: parent.width
                        height: 6; radius: 3
                        color: mini.inkColor
                        opacity: index === 0 ? 0.55 : 0.25
                    }
                }
            }
        }
        /* Contenido */
        Rectangle {
            anchors.left: miniRail.right
            anchors.leftMargin: 8
            anchors.right: parent.right
            anchors.rightMargin: 10
            y: 10
            height: parent.height - 20
            radius: Theme.radiusLg
            color: mini.panel
            border.width: 1
            border.color: mini.edge

            Column {
                x: 8; y: 8
                width: parent.width - 16
                spacing: 8
                Rectangle { width: parent.width * 2 / 3; height: 6; radius: 3; color: mini.inkColor; opacity: 0.45 }
                BrandFill { width: parent.width; height: 8; radius: 4; from: mini.accent1; to: mini.accent2 }
                Rectangle { width: parent.width / 2; height: 6; radius: 3; color: mini.inkColor; opacity: 0.25 }
            }
        }
    }

    /* ── Muestra de una tipografía, pintada con su familia real ─────── */
    component FontPreview: Glass {
        id: sample

        property string family: Theme.fontUi

        anchors.fill: parent
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        clip: true

        Column {
            x: 14
            width: parent.width - 28
            anchors.verticalCenter: parent.verticalCenter
            spacing: 6
            Label {
                width: parent.width
                text: "Aa Bb Cc"
                font.family: sample.family
                font.pixelSize: 20
                font.weight: Font.DemiBold
            }
            Label {
                width: parent.width
                text: "cpu 47% · ram 2.1 GB"
                tone: 0.7
                font.family: sample.family
            }
            Label {
                width: parent.width
                text: "0123456789 { } ( ) [ ] & @ #"
                tone: 0.45
                font.family: sample.family
                font.pixelSize: Theme.textXs
                font.letterSpacing: -0.3
            }
        }
    }

    /* ── Miniatura de la barra lateral en un modo ───────────────────── */
    component SidebarPreview: Rectangle {
        id: sb

        property string mode: "expanded"
        readonly property bool expanded: mode === "expanded"

        anchors.fill: parent
        radius: Theme.radiusXl
        color: Theme.shadow(0.25)
        border.width: 1
        border.color: Theme.hairline

        Rectangle {
            id: sbRail
            x: 10; y: 10
            width: sb.expanded ? 58 : 24
            height: parent.height - 20
            radius: Theme.radiusLg
            color: Theme.tintActive
            border.width: 1
            border.color: Theme.hairlineSoft
            clip: true

            Column {
                x: 6; y: 6
                width: parent.width - 12
                spacing: 6

                Item {
                    width: parent.width
                    height: 12
                    BrandFill { width: 12; height: 12; radius: 4 }
                    Rectangle {
                        visible: sb.expanded
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.max(0, parent.width - 16)
                        height: 4; radius: 2
                        color: Theme.ink(0.25)
                    }
                }
                Repeater {
                    model: 3
                    Item {
                        id: sbRow
                        required property int index
                        width: parent.width
                        height: 12
                        BrandFill { anchors.fill: parent; visible: sbRow.index === 0; radius: 4; strength: 0.18 }
                        Rectangle {
                            x: 3; y: 3
                            width: 6; height: 6; radius: 2
                            color: Theme.ink(0.5)
                        }
                        Rectangle {
                            visible: sb.expanded
                            x: 16
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.max(0, parent.width - 16)
                            height: 4; radius: 2
                            color: Theme.ink(0.2)
                        }
                    }
                }
            }
        }
        Rectangle {
            anchors.left: sbRail.right
            anchors.leftMargin: 8
            anchors.right: parent.right
            anchors.rightMargin: 10
            y: 10
            height: parent.height - 20
            radius: Theme.radiusLg
            color: Theme.tintSunken
            border.width: 1
            border.color: Theme.hairlineSoft
        }
    }

    /* Nota al pie de un grupo. */
    component Hint: Label {
        tone: 0.4
        font.pixelSize: Theme.textXs
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }

    /* ── Tema ──────────────────────────────────────────────────────── */
    SettingsGroup {
        width: root.width
        title: "Tema"

        Grid {
            id: themeGrid
            readonly property real rowHeight: Math.max(themeDark.naturalHeight, themeAurora.naturalHeight, themeSolar.naturalHeight)
            width: root.width
            columns: root.threeUp ? 3 : 1
            spacing: 12
            Accessible.role: Accessible.Grouping
            Accessible.name: "Tema de la aplicación"

            OptionCard {
                id: themeDark
                width: root.thirdWidth
                height: root.threeUp ? themeGrid.rowHeight : naturalHeight
                selected: root.themeChoice === "dark"
                name: "Nocturno"
                desc: "El tema original: violeta y rosa sobre negro profundo."
                onPicked: root.setTheme("dark")
                ThemePreview { themeId: "dark"; inkAlpha: 0.85 }
            }
            OptionCard {
                id: themeAurora
                width: root.thirdWidth
                height: root.threeUp ? themeGrid.rowHeight : naturalHeight
                selected: root.themeChoice === "aurora"
                name: "Aurora"
                desc: "Oscuro más claro y vivo, con acentos cian y azul eléctrico."
                onPicked: root.setTheme("aurora")
                ThemePreview { themeId: "aurora"; inkAlpha: 0.9 }
            }
            OptionCard {
                id: themeSolar
                width: root.thirdWidth
                height: root.threeUp ? themeGrid.rowHeight : naturalHeight
                selected: root.themeChoice === "solar"
                name: "Solar"
                desc: "Claro, sobre blanco cálido y con acentos anaranjados."
                onPicked: root.setTheme("solar")
                ThemePreview { themeId: "solar"; inkAlpha: 0.75 }
            }
        }
        Hint {
            width: root.width
            text: "El tema se guarda en tu cuenta y se aplica en todos tus equipos."
        }
    }

    /* ── Tipografía ────────────────────────────────────────────────── */
    SettingsGroup {
        width: root.width
        title: "Tipografía"

        Grid {
            id: fontGrid
            readonly property real rowHeight: Math.max(fontGrotesk.naturalHeight, fontMono.naturalHeight, fontRounded.naturalHeight)
            width: root.width
            columns: root.threeUp ? 3 : 1
            spacing: 12
            Accessible.role: Accessible.Grouping
            Accessible.name: "Tipografía de la aplicación"

            OptionCard {
                id: fontGrotesk
                width: root.thirdWidth
                height: root.threeUp ? fontGrid.rowHeight : naturalHeight
                selected: root.fontChoice === "grotesk"
                name: "Space Grotesk"
                note: "Delgada"
                desc: "Geométrica de trazo fino, con aire técnico. La más compacta de las tres."
                onPicked: root.setFont("grotesk")
                FontPreview { family: "Space Grotesk" }
            }
            OptionCard {
                id: fontMono
                width: root.thirdWidth
                height: root.threeUp ? fontGrid.rowHeight : naturalHeight
                selected: root.fontChoice === "mono"
                name: "JetBrains Mono"
                note: "Media"
                desc: "Monoespaciada de programación: todo alineado, cifras inconfundibles."
                onPicked: root.setFont("mono")
                FontPreview { family: Theme.fontMono }
            }
            OptionCard {
                id: fontRounded
                width: root.thirdWidth
                height: root.threeUp ? fontGrid.rowHeight : naturalHeight
                selected: root.fontChoice === "rounded"
                name: "Nunito"
                note: "Gruesa"
                desc: "Terminales redondeados y trazo grueso. La más legible a tamaño pequeño."
                onPicked: root.setFont("rounded")
                FontPreview { family: "Nunito" }
            }
        }
        Hint {
            width: root.width
            text: "Las tres fuentes viajan dentro de la aplicación: no se descargan de internet al abrirla. "
                + "Las métricas y direcciones siguen en monoespaciada sea cual sea la elección."
        }
    }

    /* ── Barra lateral ─────────────────────────────────────────────── */
    SettingsGroup {
        width: root.width
        title: "Barra lateral"

        Grid {
            id: sidebarGrid
            readonly property real rowHeight: Math.max(sidebarExpanded.naturalHeight, sidebarCollapsed.naturalHeight)
            /* Las flechas alternan entre los dos modos y el foco sigue al elegido. */
            function flip() {
                const next = root.sidebarMode === "expanded" ? "collapsed" : "expanded"
                root.setSidebarMode(next)
                if (next === "expanded") sidebarExpanded.forceActiveFocus()
                else sidebarCollapsed.forceActiveFocus()
            }
            width: root.width
            columns: root.twoUp ? 2 : 1
            spacing: 12
            Accessible.role: Accessible.Grouping
            Accessible.name: "Modo de la barra lateral"

            OptionCard {
                id: sidebarExpanded
                width: root.halfWidth
                height: root.twoUp ? sidebarGrid.rowHeight : naturalHeight
                selected: root.sidebarMode === "expanded"
                name: "Expandida"
                desc: "Íconos y etiquetas siempre visibles. Recomendado en ventanas amplias."
                onPicked: root.setSidebarMode("expanded")
                onArrowPressed: sidebarGrid.flip()
                SidebarPreview { mode: "expanded" }
            }
            OptionCard {
                id: sidebarCollapsed
                width: root.halfWidth
                height: root.twoUp ? sidebarGrid.rowHeight : naturalHeight
                selected: root.sidebarMode === "collapsed"
                name: "Compacta"
                desc: "Sólo íconos, con el nombre al pasar el cursor. Libera 170 px de ancho."
                onPicked: root.setSidebarMode("collapsed")
                onArrowPressed: sidebarGrid.flip()
                SidebarPreview { mode: "collapsed" }
            }
        }
        Hint {
            width: root.width
            text: "La preferencia se guarda en tu cuenta y se aplica en todos tus equipos."
        }
    }

    /* ── Movimiento ────────────────────────────────────────────────── */
    SettingsGroup {
        width: root.width
        title: "Movimiento"

        SettingsNotifRow {
            width: root.width
            iconName: "monitor"
            iconColor: Theme.tone("violet").text
            title: "Reducir animaciones"
            desc: "Desactiva las transiciones de la interfaz y detiene las auroras del fondo."
            on: root.reducedMotion
            onChange: value => root.setReducedMotion(value)
        }
    }
}
