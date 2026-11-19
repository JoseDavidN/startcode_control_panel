import QtQuick
import QtQuick.Shapes
import StartCode

/* Gráfica de líneas en el tiempo, dibujada con `Shape` (sin librerías).

       DashboardChart {
           width: parent.width
           series: [{ label: "CPU", tone: "blue", points: [{ t: 1731000000000, v: 42 }] }]
           thresholds: [{ value: 80, tone: "amber", label: "Umbral 80%" }]
       }

   Cada serie es una línea suave con un relleno degradado tenue. Un hueco en
   los datos (el servidor dejó de reportar) corta la línea en vez de unirla
   con una recta. Al pasar el ratón: guía vertical, puntos y valores. */
Item {
    id: root

    /* `[{ label, tone, points: [{ t: ms, v: número }] }]`; `tone` es una familia de `Theme.tone`. */
    property var series: []
    property real minY: 0
    property real maxY: 100
    /* Formato de los valores (eje Y y cuadro bajo el puntero). */
    property var formatValue: function (v) { return Math.round(v) + "%" }
    /* Formato de las marcas del eje X y de la cabecera del cuadro. */
    property var formatTime: function (t) { return new Date(t).toLocaleTimeString(Qt.locale("es_ES"), "HH:mm") }
    property var formatTip: function (t) { return new Date(t).toLocaleString(Qt.locale("es_ES"), "d MMM, HH:mm") }
    /* Líneas de referencia discontinuas: `[{ value, tone, label }]`. */
    property var thresholds: []
    /* Extremos del eje X en ms; 0 = los de los datos. */
    property real startTime: 0
    property real endTime: 0
    property int divisions: 4
    property bool legendVisible: true
    property real plotHeight: 240
    /* Ancho reservado a las etiquetas del eje Y. */
    property real gutter: 44

    readonly property bool hasData: clean.some(s => s.points.length > 0)

    implicitWidth: 320
    implicitHeight: plotHeight + 30 + (legendVisible ? legend.height + 12 : 0)
    Accessible.role: Accessible.Graphic
    Accessible.name: clean.map(s => s.label).join(", ")

    /* Series saneadas: puntos finitos, ordenados y sin instantes repetidos. */
    readonly property var clean: Array.from(series || []).map(s => {
        const sorted = Array.from(s.points || [])
            .filter(p => p && isFinite(p.t) && isFinite(p.v))
            .map(p => ({ t: Number(p.t), v: Number(p.v) }))
            .sort((a, b) => a.t - b.t)
        const points = []
        for (const p of sorted) {
            if (points.length === 0 || p.t > points[points.length - 1].t) points.push(p)
        }
        return { label: s.label || "", tone: s.tone || "violet", points: points }
    })

    readonly property var domain: {
        let lo = startTime > 0 ? startTime : Infinity
        let hi = endTime > 0 ? endTime : -Infinity
        for (const s of clean) {
            if (s.points.length === 0) continue
            if (!(startTime > 0)) lo = Math.min(lo, s.points[0].t)
            if (!(endTime > 0)) hi = Math.max(hi, s.points[s.points.length - 1].t)
        }
        if (!isFinite(lo) || !isFinite(hi)) { hi = Date.now(); lo = hi - 3600000 }
        if (hi <= lo) hi = lo + 1
        return [lo, hi]
    }

    /* Separación a partir de la cual dos puntos ya no se unen: 2,5 veces el paso habitual. */
    readonly property real gapMs: {
        const steps = []
        for (const s of clean) {
            for (let i = 1; i < s.points.length; i++) steps.push(s.points[i].t - s.points[i - 1].t)
        }
        if (steps.length < 2) return Infinity
        steps.sort((a, b) => a - b)
        return steps[Math.floor(steps.length / 2)] * 2.5
    }

    function px(t) { return (t - domain[0]) / (domain[1] - domain[0]) * plot.width }
    function py(v) {
        const range = (maxY - minY) || 1
        return plot.height - Math.max(0, Math.min(1, (v - minY) / range)) * plot.height
    }
    function num(v) { return v.toFixed(1) }

    /* Tramo continuo como curva cúbica monótona: suave y sin pasarse de los valores reales. */
    function runPath(run) {
        const n = run.length
        const start = "M" + num(run[0].x) + " " + num(run[0].y)
        if (n === 1) return start + "l0.1 0"
        if (n === 2) return start + "L" + num(run[1].x) + " " + num(run[1].y)
        const dx = [], slope = [], tangent = []
        for (let i = 0; i < n - 1; i++) {
            dx.push(run[i + 1].x - run[i].x)
            slope.push((run[i + 1].y - run[i].y) / dx[i])
        }
        tangent.push(slope[0])
        for (let i = 1; i < n - 1; i++) {
            if (slope[i - 1] * slope[i] <= 0) { tangent.push(0); continue }
            tangent.push(3 * (dx[i - 1] + dx[i])
                / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]))
        }
        tangent.push(slope[n - 2])
        let path = start
        for (let i = 0; i < n - 1; i++) {
            const third = dx[i] / 3
            path += "C" + num(run[i].x + third) + " " + num(run[i].y + tangent[i] * third)
                + " " + num(run[i + 1].x - third) + " " + num(run[i + 1].y - tangent[i + 1] * third)
                + " " + num(run[i + 1].x) + " " + num(run[i + 1].y)
        }
        return path
    }

    /* Trazos SVG de cada serie: `{ color, line, fill }`. */
    readonly property var geometry: {
        const w = plot.width, h = plot.height
        if (w <= 0 || h <= 0) return []
        return clean.map(s => {
            let line = "", fill = "", run = [], previous = null
            const flush = () => {
                if (run.length === 0) return
                const segment = runPath(run)
                line += segment
                if (run.length > 1) {
                    fill += segment + "L" + num(run[run.length - 1].x) + " " + num(h)
                        + "L" + num(run[0].x) + " " + num(h) + "Z"
                }
                run = []
            }
            for (const p of s.points) {
                if (p.t < domain[0] || p.t > domain[1]) continue
                if (previous !== null && p.t - previous > gapMs) flush()
                const x = px(p.t)
                /* Con la gráfica muy estrecha dos puntos pueden caer en el mismo píxel. */
                if (run.length === 0 || x - run[run.length - 1].x >= 0.1) run.push({ x: x, y: py(p.v) })
                previous = p.t
            }
            flush()
            return { color: Theme.tone(s.tone).base, line: line, fill: fill }
        })
    }

    /* ── Puntero ───────────────────────────────────────────────────── */
    function nearest(points, t) {
        let best = null, distance = Infinity
        for (const p of points) {
            const d = Math.abs(p.t - t)
            if (d < distance) { distance = d; best = p }
            else if (p.t > t) break
        }
        return best
    }
    /* Instante con datos más cercano al puntero; NaN sin puntero. */
    readonly property real hoverT: {
        if (!hover.hovered || !hasData || plot.width <= 0) return NaN
        const t = domain[0] + hover.point.position.x / plot.width * (domain[1] - domain[0])
        let best = NaN, distance = Infinity
        for (const s of clean) {
            const p = nearest(s.points, t)
            if (p && Math.abs(p.t - t) < distance) { distance = Math.abs(p.t - t); best = p.t }
        }
        return best
    }
    readonly property var hoverRows: {
        if (isNaN(hoverT)) return []
        const rows = []
        for (const s of clean) {
            const p = nearest(s.points, hoverT)
            if (!p || Math.abs(p.t - hoverT) > gapMs) continue
            rows.push({ label: s.label, color: Theme.tone(s.tone).base, text: formatValue(p.v), y: py(p.v) })
        }
        return rows
    }

    readonly property var xTicks: {
        const count = Math.max(2, Math.min(6, Math.floor(plot.width / 96)))
        const ticks = []
        for (let i = 0; i <= count; i++) {
            ticks.push({ x: plot.width * i / count, last: i === count,
                         text: formatTime(domain[0] + (domain[1] - domain[0]) * i / count) })
        }
        return ticks
    }

    /* ── Eje Y y rejilla ───────────────────────────────────────────── */
    Repeater {
        model: root.divisions + 1
        Item {
            id: gridLine
            required property int index
            readonly property real lineY: plot.y + plot.height * index / root.divisions
            Label {
                x: 0
                y: gridLine.lineY - height / 2
                width: root.gutter - 8
                horizontalAlignment: Text.AlignRight
                text: root.formatValue(root.maxY - (root.maxY - root.minY) * gridLine.index / root.divisions)
                tone: 0.4
                mono: true
                font.pixelSize: 11
            }
            Rectangle {
                x: plot.x
                y: Math.round(gridLine.lineY)
                width: plot.width
                height: 1
                color: Theme.line
            }
        }
    }

    /* ── Eje X ─────────────────────────────────────────────────────── */
    Repeater {
        model: root.xTicks
        Label {
            required property var modelData
            required property int index
            width: 80
            x: plot.x + modelData.x - (index === 0 ? 0 : modelData.last ? width : width / 2)
            y: plot.y + plot.height + 8
            horizontalAlignment: index === 0 ? Text.AlignLeft : modelData.last ? Text.AlignRight : Text.AlignHCenter
            text: modelData.text
            tone: 0.4
            mono: true
            font.pixelSize: 11
        }
    }

    /* ── Zona de dibujo ────────────────────────────────────────────── */
    Item {
        id: plot
        x: root.gutter
        y: 8
        width: Math.max(0, root.width - root.gutter - 8)
        height: root.plotHeight

        /* Umbrales: líneas discontinuas de referencia. */
        Repeater {
            model: Array.from(root.thresholds || []).filter(t => t.value >= root.minY && t.value <= root.maxY)
            Shape {
                id: mark
                required property var modelData
                readonly property real lineY: Math.round(root.py(modelData.value)) + 0.5
                anchors.fill: parent
                ShapePath {
                    strokeColor: Qt.alpha(Theme.tone(mark.modelData.tone || "amber").base, 0.6)
                    strokeWidth: 1
                    strokeStyle: ShapePath.DashLine
                    dashPattern: [4, 4]
                    fillColor: "transparent"
                    startX: 0; startY: mark.lineY
                    PathLine { x: plot.width; y: mark.lineY }
                }
            }
        }

        /* Series. El modelo es el número de series: al cambiar los datos se
           actualizan los trazos sin volver a crear las formas. */
        Repeater {
            model: root.geometry.length
            Shape {
                id: curve
                required property int index
                readonly property var shape: root.geometry[index] || { color: "transparent", line: "", fill: "" }
                anchors.fill: parent
                preferredRendererType: Shape.CurveRenderer

                ShapePath {
                    strokeColor: "transparent"
                    strokeWidth: 0
                    fillGradient: LinearGradient {
                        x1: 0; y1: 0
                        x2: 0; y2: plot.height
                        GradientStop { position: 0; color: Qt.alpha(curve.shape.color, 0.2) }
                        GradientStop { position: 1; color: Qt.alpha(curve.shape.color, 0) }
                    }
                    PathSvg { path: curve.shape.fill }
                }
                ShapePath {
                    strokeColor: curve.shape.color
                    strokeWidth: 2
                    fillColor: "transparent"
                    capStyle: ShapePath.RoundCap
                    joinStyle: ShapePath.RoundJoin
                    PathSvg { path: curve.shape.line }
                }
            }
        }

        /* Guía vertical y puntos bajo el puntero. */
        Rectangle {
            visible: !isNaN(root.hoverT)
            x: Math.round(root.px(isNaN(root.hoverT) ? root.domain[0] : root.hoverT))
            width: 1
            height: parent.height
            color: Theme.hairlineStrong
        }
        Repeater {
            model: root.hoverRows
            Rectangle {
                required property var modelData
                x: root.px(root.hoverT) - 5
                y: modelData.y - 5
                width: 10; height: 10; radius: 5
                color: modelData.color
                border.width: 2
                border.color: Theme.surface(0.9)
            }
        }

        HoverHandler { id: hover }

        /* Cuadro con los valores: a la derecha de la guía, o a la izquierda si no cabe. */
        Glass {
            id: tip
            readonly property real anchorX: root.px(isNaN(root.hoverT) ? root.domain[0] : root.hoverT)
            visible: root.hoverRows.length > 0
            z: 5
            variant: "float"
            radius: Theme.radiusXl
            width: tipBody.implicitWidth + 24
            height: tipBody.implicitHeight + 20
            x: anchorX + 12 + width > plot.width ? Math.max(0, anchorX - 12 - width) : anchorX + 12
            y: 4

            Column {
                id: tipBody
                x: 12; y: 10
                spacing: 6
                Label {
                    text: isNaN(root.hoverT) ? "" : root.formatTip(root.hoverT)
                    tone: 0.9
                    font.pixelSize: Theme.textXs
                    font.weight: Font.DemiBold
                }
                Row {
                    spacing: 8
                    Column {
                        spacing: 4
                        Repeater {
                            model: root.hoverRows
                            Item {
                                required property var modelData
                                width: 12; height: 16
                                Rectangle {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: 12; height: 3; radius: 1.5
                                    color: parent.modelData.color
                                }
                            }
                        }
                    }
                    Column {
                        spacing: 4
                        Repeater {
                            model: root.hoverRows
                            Label {
                                required property var modelData
                                height: 16
                                verticalAlignment: Text.AlignVCenter
                                text: modelData.label
                                tone: 0.65
                                font.pixelSize: Theme.textXs
                            }
                        }
                    }
                    Column {
                        spacing: 4
                        Repeater {
                            model: root.hoverRows
                            Label {
                                required property var modelData
                                height: 16
                                verticalAlignment: Text.AlignVCenter
                                text: modelData.text
                                mono: true
                                font.pixelSize: Theme.textXs
                                font.weight: Font.DemiBold
                            }
                        }
                    }
                }
            }
        }
    }

    /* ── Leyenda ───────────────────────────────────────────────────── */
    Flow {
        id: legend
        visible: root.legendVisible
        x: root.gutter
        y: plot.y + plot.height + 34
        width: Math.max(0, root.width - root.gutter - 8)
        spacing: 16

        Repeater {
            model: root.clean
            Row {
                required property var modelData
                spacing: 6
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 12; height: 3; radius: 1.5
                    color: Theme.tone(parent.modelData.tone).base
                }
                Label { text: parent.modelData.label; tone: 0.55; font.pixelSize: Theme.textXs }
            }
        }
        Repeater {
            model: Array.from(root.thresholds || []).filter(t => !!t.label)
            Row {
                id: thresholdKey
                required property var modelData
                spacing: 6
                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    Repeater {
                        model: 3
                        Rectangle {
                            width: 3; height: 1
                            color: Theme.tone(thresholdKey.modelData.tone || "amber").base
                        }
                    }
                }
                Label { text: thresholdKey.modelData.label; tone: 0.45; font.pixelSize: Theme.textXs }
            }
        }
    }
}
