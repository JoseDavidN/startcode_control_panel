import QtQuick
import QtQuick.Shapes
import StartCode

/* Icono de trazo sobre una rejilla de 24: 1,75 de grosor y extremos redondos.
   `name` elige uno del juego; `path` admite un trazo SVG propio. */
Item {
    id: root

    property string name: ""
    property string path: paths[name] ?? ""
    property real size: 16
    property color color: Theme.ink(0.65)
    property real strokeWidth: 1.75
    /* Relleno del trazo (la estrella de favorito va rellena). */
    property color fill: "transparent"

    readonly property var paths: ({
        chart: "M4 20V10M10 20V4M16 20v-6M22 20H2",
        server: "M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01",
        database: "M4 5a8 3 0 1 0 16 0a8 3 0 1 0 -16 0M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
        cloud: "M7 18a4 4 0 01-.4-8A6 6 0 0118 10.5a3.75 3.75 0 01-.5 7.5H7z",
        bell: "M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0",
        gear: "M9 12a3 3 0 106 0 3 3 0 00-6 0M19.4 15a1.7 1.7 0 00.4 1.8l.1.1a2 2 0 01-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 01-2.8-2.9l.1-.1a1.7 1.7 0 00.4-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9L4.1 7a2 2 0 012.9-2.8l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.4l.1-.1a2 2 0 012.9 2.9l-.1.1a1.7 1.7 0 00-.4 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z",
        logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
        search: "M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M21 21l-4.3-4.3",
        mail: "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3.5 6.5l8.5 6 8.5-6",
        lock: "M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1zM8 11V8a4 4 0 018 0v3",
        eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM9 12a3 3 0 106 0 3 3 0 00-6 0",
        eyeOff: "M3 3l18 18M10.6 5.1A10.6 10.6 0 0112 5c6.4 0 10 7 10 7a17.6 17.6 0 01-3.2 4M6.5 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7a9.7 9.7 0 004.3-1M9.9 9.9a3 3 0 004.2 4.2",
        shield: "M12 3l8 3v6c0 4.6-3.2 8.2-8 9-4.8-.8-8-4.4-8-9V6l8-3zM9 12l2 2 4-4",
        check: "M5 12.5l4.5 4.5L19 7.5",
        alert: "M12 9v4M12 17h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
        arrowLeft: "M19 12H5M11 18l-6-6 6-6",
        minimize: "M5 12h14",
        maximize: "M5 5h14v14H5z",
        restore: "M8 8h11v11H8zM5 16V5h11",
        close: "M6 6l12 12M18 6L6 18",
        monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
        plus: "M12 5v14M5 12h14",
        filter: "M3 5h18l-7 8v6l-4-2v-4z",
        grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
        list: "M4 6h16M4 12h16M4 18h16",
        chevronRight: "M9 6l6 6-6 6",
        star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
        cpu: "M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
        memory: "M3 8h18v8H3zM7 16v3M12 16v3M17 16v3M7 11v2M12 11v2M17 11v2",
        disk: "M4 5a8 3 0 1 0 16 0a8 3 0 1 0 -16 0M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5",
        wrench: "M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.1-.6-.6-2.1z",
        activity: "M3 12h4l3-8 4 16 3-8h4",
        clock: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 7v5l3 2",
        edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
        trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
        info: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 11v5M12 8h.01",
        chevronLeft: "M15 18l-6-6 6-6",
        chevronDown: "M6 9l6 6 6-6",
        plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0V8zM12 18v4",
        checkAll: "M1 13l4 4L13 9M11 13l4 4L23 5",
        send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
        ram: "M4 7h16a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5H4a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 014 7zM7 11v2M11 11v2M15 11v2M19 11v2M5 17v2M9 17v2M13 17v2M17 17v2",
        diskDrive: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 14h18M6 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
        screen: "M4 3h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2zM8 21h8M12 17v4",
        shieldOff: "M2 2l20 20M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",
        layout: "M4 4h16v16H4zM4 9h16M9 9v11",
        spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
        save: "M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM7 3v6h8V3M7 21v-7h10v7",
        warn: "M12 4L2 20h20L12 4zM12 10v5M12 18v.01",
        column: "M5 7h14M5 12h14M5 17h9",
        trigger: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
        index: "M4 6h16M4 12h10M4 18h6M18 14v6M15 17h6",
        procedure: "M8 4H6a2 2 0 00-2 2v4l-2 2 2 2v4a2 2 0 002 2h2M16 4h2a2 2 0 012 2v4l2 2-2 2v4a2 2 0 01-2 2h-2",
        link: "M9 7H6a5 5 0 0 0 0 10h3M15 7h3a5 5 0 0 1 0 10h-3M8 12h8",
        table: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 10h18M9 10v10",
        user: "M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M4 21a8 8 0 0116 0",
        folder: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z",
        download: "M12 4v11M7 10l5 5 5-5M5 20h14",
        paste: "M9 3h6a1 1 0 011 1v2H8V4a1 1 0 011-1zM8 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-2",
        key: "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M11 12l9-9M16 7l3 3",
        copy: "M11 9h9a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-9a2 2 0 012-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1",
        alertCircle: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8v4M12 16h.01",
        external: "M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5",
        globe: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
        brackets: "M16 18l6-6-6-6M8 6l-6 6 6 6",
        pin: "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z",
        play: "M5 3l14 9-14 9V3z",
        pause: "M6 4h4v16H6zM14 4h4v16h-4z",
        logs: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
        refresh: "M21 12a9 9 0 11-2.64-6.36M21 3v6h-6",
        output: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM7 9l3 3-3 3M13 15h4",
        shieldPlain: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
        chevronUp: "M6 15l6-6 6 6",
        terminal: "M4 17l6-5-6-5M12 19h8",
        upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
        box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
        code: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
        cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
        helm: "M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M12 2v8M12 14v8M2 12h8M14 12h8",
        network: "M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4",
        checkCircle: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M8 12.5l3 3 5-6",
        xCircle: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9 9l6 6M15 9l-6 6"
    })

    implicitWidth: size
    implicitHeight: size

    Shape {
        width: 24; height: 24
        scale: root.size / 24
        transformOrigin: Item.TopLeft
        preferredRendererType: Shape.CurveRenderer

        ShapePath {
            strokeColor: root.color
            /* El grosor se mantiene en píxeles reales aunque el icono se escale. */
            strokeWidth: root.strokeWidth
            fillColor: root.fill
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { path: Format.svgPath(root.path) }
        }
    }
}
