pragma Singleton

import QtQuick

/* Tokens del sistema de diseño (DESIGN.md). Un bloque por tema con la misma
   lista de claves; los componentes nunca escriben un color literal. */
QtObject {
    id: theme

    /* Preferencias del usuario (Configuración → Aspecto). */
    property string userTheme: "dark"
    property string fontChoice: "grotesk"
    property bool reducedMotion: false
    /* El login se ve siempre en Nocturno, sea cual sea el tema elegido. */
    property bool forceNocturno: false
    /* Escena de la app (fondo y contenido, sin la capa de modales): lo que
       desenfocan las superficies que flotan sobre toda la ventana. */
    property Item scene: null

    readonly property string name: forceNocturno || !palettes[userTheme] ? "dark" : userTheme
    readonly property var p: palettes[name]

    function rgba(rgb, alpha) { return Qt.rgba(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, alpha) }
    /* Canal de tinta: texto e iconos con opacidad (`text-white/NN`). */
    function ink(alpha) {
        if (alpha === undefined) return rgba(p.inkChannel, 1)
        /* El texto secundario (del 25 % en adelante) se refuerza: los fondos son
           más coloridos y con la opacidad original perdía contraste. */
        return rgba(p.inkChannel, alpha >= 0.25 ? alpha + (1 - alpha) * 0.2 : alpha)
    }
    function brand1(alpha) { return rgba(p.brand1Rgb, alpha === undefined ? 1 : alpha) }
    function brand2(alpha) { return rgba(p.brand2Rgb, alpha === undefined ? 1 : alpha) }
    function surface(alpha) { return rgba(p.surfaceRgb, alpha) }
    function shadow(alpha) { return rgba(p.shadowRgb, alpha) }

    /* ── Fondo ─────────────────────────────────────────────────────── */
    readonly property color bgBase: p.bg[2]
    readonly property var bgStops: p.bg
    readonly property var auroras: p.auroras
    readonly property var auroraOpacity: p.auroraOpacity

    /* ── Superficies ───────────────────────────────────────────────── */
    readonly property var glassAlpha: p.glassAlpha
    readonly property var sheen: p.sheen
    readonly property color hairline: rgba(p.edgeRgb, p.edge.hairline)
    readonly property color hairlineSoft: rgba(p.edgeRgb, p.edge.soft)
    readonly property color hairlineStrong: rgba(p.edgeRgb, p.edge.strong)
    readonly property color hairlineHover: rgba(p.edgeRgb, p.edge.hover)
    readonly property color line: rgba(p.edgeRgb, p.edge.line)
    readonly property color edgeDashed: rgba(p.edgeRgb, p.edge.dashed)
    readonly property color edgeDashedHover: rgba(p.edgeRgb, p.edge.dashedHover)
    readonly property color tintHover: rgba(p.edgeRgb, p.tint.hover)
    readonly property color tintActive: rgba(p.edgeRgb, p.tint.active)
    readonly property color tintSunken: rgba(p.edgeRgb, p.tint.sunken)
    readonly property color insetHi: Qt.rgba(1, 1, 1, p.insetHi)
    readonly property color insetField: p.insetField
    readonly property color track: rgba(p.edgeRgb, p.trackAlpha)
    readonly property color knob: "#ffffff"
    readonly property color chkBorder: rgba(p.edgeRgb, p.chk[0])
    readonly property color chkBg: Qt.rgba(1, 1, 1, p.chk[1])

    /* Escala de elevación: capas [desplazamiento Y, desenfoque, extensión, alfa]. */
    readonly property var elevation: p.elevation

    /* ── Marca y semánticos ────────────────────────────────────────── */
    readonly property color brandStart: brand1(1)
    readonly property color brandEnd: brand2(1)
    readonly property color brandLight1: p.brandLight[0]
    readonly property color brandLight2: p.brandLight[1]
    readonly property color onBrand: p.onBrand
    readonly property color focusRing: p.focusRing
    readonly property color ok: p.semantic.ok
    readonly property color warn: p.semantic.warn
    readonly property color danger: p.semantic.danger
    readonly property color info: p.semantic.info

    /* Familias de color de acento. `violet` y `fuchsia` son la marca y siguen
       al tema; las demás conservan su significado. Devuelve `{ text, base }`. */
    function tone(name) {
        if (name === "violet") return { text: brandLight1, base: brandStart }
        if (name === "fuchsia") return { text: brandLight2, base: brandEnd }
        return p.tones[name] || { text: ink(0.6), base: ink(0.4) }
    }

    /* Resaltado del editor SQL: `keyword`, `fn`, `type`, `string`, `number`,
       `identifier`, `comment`, `operator`. Solo cambia el color, nunca el peso. */
    readonly property var sql: p.sql
    /* Filas alternas de las tablas de datos: clara / oscura. */
    readonly property color rowStripe1: p.rowStripes[0]
    readonly property color rowStripe2: p.rowStripes[1]

    /* ── Tipografía ────────────────────────────────────────────────── */
    readonly property string fontUi: fontChoice === "mono" ? "JetBrains Mono"
                                   : fontChoice === "rounded" ? "Nunito" : "Space Grotesk"
    readonly property string fontMono: "JetBrains Mono"
    readonly property var fontTerminal: ["JetBrains Mono", "Symbols Nerd Font Mono"]
    readonly property int textXs: 12
    readonly property int textSm: 14
    readonly property int textBase: 16
    readonly property int textCaption: 10

    /* ── Radios y medidas ──────────────────────────────────────────── */
    readonly property int radiusMd: 6
    readonly property int radiusLg: 8
    readonly property int radiusXl: 12
    readonly property int radius2xl: 16
    readonly property int controlHeight: 40
    readonly property int fieldHeight: 44
    readonly property int titleBarHeight: 38

    /* ── Movimiento: igual en los tres temas ───────────────────────── */
    readonly property int moFast: reducedMotion ? 1 : 160
    readonly property int moBase: reducedMotion ? 1 : 280
    readonly property int moSlow: reducedMotion ? 1 : 460
    readonly property int moRise: reducedMotion ? 0 : 22
    /* Retraso entre elementos que entran escalonados (tarjetas, filas). */
    readonly property int moStagger: reducedMotion ? 0 : 55
    /* Escala al pulsar y al pasar el ratón por un botón. */
    readonly property real moPress: reducedMotion ? 1 : 0.95
    readonly property real moHover: reducedMotion ? 1 : 1.03
    /* Rebote de las entradas con «pop» (modal, menú, selección). */
    readonly property real moOvershoot: 1.35
    readonly property var moEase: [0.22, 1, 0.36, 1, 1, 1]
    readonly property var moEaseInOut: [0.4, 0, 0.2, 1, 1, 1]

    readonly property var palettes: ({
        dark: {
            bg: ["#4c1d95", "#2e1065", "#1b0b40"],
            auroras: ["#a855f7", "#ec4899", "#6366f1"],
            auroraOpacity: [0.85, 0.72, 0.68],
            surfaceRgb: [22, 9, 48],
            glassAlpha: { glass: 0.60, soft: 0.40, input: 0.34, float: 0.90, media: 0.44 },
            sheen: { glass: [0.06, 0.02], soft: [0.05, 0.02], input: [0.07, 0.04] },
            edgeRgb: [255, 255, 255],
            edge: { hairline: 0.13, soft: 0.12, strong: 0.20, hover: 0.18, line: 0.07, dashed: 0.16, dashedHover: 0.30 },
            tint: { hover: 0.06, active: 0.10, sunken: 0.04 },
            insetHi: 0.07,
            insetField: "#4d000000",
            trackAlpha: 0.08,
            chk: [0.18, 0.03],
            shadowRgb: [0, 0, 0],
            elevation: {
                flat: [[1, 1, 0, 0.25]],
                raised: [[1, 2, 0, 0.35], [2, 6, -2, 0.45]],
                panel: [[1, 2, 0, 0.5], [4, 12, -4, 0.55], [24, 60, -24, 0.7]],
                float: [[2, 4, 0, 0.5], [8, 20, -6, 0.6], [28, 64, -20, 0.75]],
                modal: [[2, 6, 0, 0.5], [12, 28, -8, 0.6], [32, 80, -16, 0.8]]
            },
            inkChannel: [255, 255, 255],
            brand1Rgb: [168, 85, 247],
            brand2Rgb: [236, 72, 153],
            brandLight: ["#c084fc", "#f472b6"],
            onBrand: "#ffffff",
            focusRing: "#c084fc",
            sql: { keyword: "#c084fc", fn: "#f472b6", type: "#a5b4fc", string: "#6ee7b7", number: "#fcd34d", identifier: "#7dd3fc", comment: "#59ffffff", operator: "#8cffffff" },
            rowStripes: ["#12a855f7", "#2e000000"],
            tones: {
                emerald: { text: "#6ee7b7", base: "#10b981" },
                teal: { text: "#5eead4", base: "#14b8a6" },
                sky: { text: "#7dd3fc", base: "#0ea5e9" },
                cyan: { text: "#67e8f9", base: "#22d3ee" },
                blue: { text: "#93c5fd", base: "#3b82f6" },
                amber: { text: "#fcd34d", base: "#f59e0b" },
                orange: { text: "#fdba74", base: "#f97316" },
                rose: { text: "#fda4af", base: "#f43f5e" }
            },
            semantic: { ok: "#34d399", warn: "#fbbf24", danger: "#fb7185", info: "#38bdf8" }
        },
        aurora: {
            bg: ["#1d4f91", "#12356b", "#0a2247"],
            auroras: ["#22d3ee", "#3b82f6", "#6366f1"],
            auroraOpacity: [0.7, 0.62, 0.6],
            surfaceRgb: [9, 27, 58],
            glassAlpha: { glass: 0.60, soft: 0.40, input: 0.34, float: 0.90, media: 0.44 },
            sheen: { glass: [0.08, 0.03], soft: [0.06, 0.03], input: [0.09, 0.05] },
            edgeRgb: [255, 255, 255],
            edge: { hairline: 0.13, soft: 0.12, strong: 0.20, hover: 0.18, line: 0.07, dashed: 0.16, dashedHover: 0.30 },
            tint: { hover: 0.06, active: 0.10, sunken: 0.04 },
            insetHi: 0.07,
            insetField: "#52000612",
            trackAlpha: 0.08,
            chk: [0.18, 0.03],
            shadowRgb: [0, 10, 30],
            elevation: {
                flat: [[1, 1, 0, 0.25]],
                raised: [[1, 2, 0, 0.35], [2, 6, -2, 0.45]],
                panel: [[1, 2, 0, 0.5], [4, 12, -4, 0.55], [24, 60, -24, 0.7]],
                float: [[2, 4, 0, 0.5], [8, 20, -6, 0.6], [28, 64, -20, 0.75]],
                modal: [[2, 6, 0, 0.5], [12, 28, -8, 0.6], [32, 80, -16, 0.8]]
            },
            inkChannel: [242, 249, 255],
            brand1Rgb: [34, 211, 238],
            brand2Rgb: [59, 130, 246],
            brandLight: ["#67e8f9", "#60a5fa"],
            onBrand: "#03121f",
            focusRing: "#67e8f9",
            sql: { keyword: "#67e8f9", fn: "#93c5fd", type: "#c4b5fd", string: "#86efac", number: "#fcd34d", identifier: "#f9a8d4", comment: "#59ffffff", operator: "#8cffffff" },
            rowStripes: ["#0f22d3ee", "#2e000000"],
            tones: {
                emerald: { text: "#6ee7b7", base: "#10b981" },
                teal: { text: "#5eead4", base: "#14b8a6" },
                sky: { text: "#7dd3fc", base: "#0ea5e9" },
                cyan: { text: "#67e8f9", base: "#22d3ee" },
                blue: { text: "#93c5fd", base: "#3b82f6" },
                amber: { text: "#fcd34d", base: "#f59e0b" },
                orange: { text: "#fdba74", base: "#f97316" },
                rose: { text: "#fda4af", base: "#f43f5e" }
            },
            semantic: { ok: "#34d399", warn: "#fbbf24", danger: "#fb7185", info: "#38bdf8" }
        },
        solar: {
            bg: ["#ffd3a8", "#ffe6cc", "#fff1e0"],
            auroras: ["#fb923c", "#f59e0b", "#fb7185"],
            auroraOpacity: [0.5, 0.42, 0.38],
            surfaceRgb: [255, 255, 255],
            glassAlpha: { glass: 0.72, soft: 0.55, input: 0.75, float: 0.94, media: 0.58 },
            sheen: { glass: [0.55, 0.15], soft: [0.45, 0.15], input: [0.6, 0.3] },
            edgeRgb: [124, 45, 18],
            edge: { hairline: 0.18, soft: 0.17, strong: 0.28, hover: 0.26, line: 0.10, dashed: 0.22, dashedHover: 0.40 },
            tint: { hover: 0.05, active: 0.09, sunken: 0.04 },
            insetHi: 0.8,
            insetField: "#1a7c2d12",
            trackAlpha: 0.12,
            chk: [0.30, 0.7],
            shadowRgb: [124, 45, 18],
            elevation: {
                flat: [[1, 1, 0, 0.10]],
                raised: [[1, 2, 0, 0.14], [2, 6, -2, 0.18]],
                panel: [[1, 2, 0, 0.16], [4, 12, -4, 0.22], [18, 40, -22, 0.35]],
                float: [[2, 4, 0, 0.18], [8, 20, -6, 0.26], [24, 56, -20, 0.38]],
                modal: [[2, 6, 0, 0.18], [12, 28, -8, 0.28], [28, 70, -20, 0.35]]
            },
            inkChannel: [42, 26, 12],
            brand1Rgb: [249, 115, 22],
            brand2Rgb: [251, 146, 60],
            brandLight: ["#ea580c", "#f59e0b"],
            onBrand: "#2a1a0c",
            focusRing: "#c2410c",
            sql: { keyword: "#c2410c", fn: "#be185d", type: "#7c3aed", string: "#047857", number: "#1d4ed8", identifier: "#0369a1", comment: "#732a1a0c", operator: "#992a1a0c" },
            rowStripes: ["#a6ffffff", "#12f97316"],
            tones: {
                emerald: { text: "#047857", base: "#059669" },
                teal: { text: "#0f766e", base: "#0d9488" },
                sky: { text: "#0369a1", base: "#0284c7" },
                cyan: { text: "#0e7490", base: "#0891b2" },
                blue: { text: "#1d4ed8", base: "#2563eb" },
                amber: { text: "#b45309", base: "#d97706" },
                orange: { text: "#c2410c", base: "#ea580c" },
                rose: { text: "#be123c", base: "#e11d48" }
            },
            semantic: { ok: "#059669", warn: "#d97706", danger: "#e11d48", info: "#0284c7" }
        }
    })
}
