# Sistema de Diseño — StartCode Panel

Glassmorphism oscuro enfocado en aplicación de escritorio. Este archivo es la fuente de verdad de diseño. Toda nueva pantalla, componente o modificación visual **debe** seguir estas reglas sin excepción.

---

## Principios

- **Tema y tipografía son del usuario**: se eligen en Aspecto y se guardan en la cuenta; el movimiento y la tipografía no cambian con el tema.
- **Tres temas, un mismo sistema**: Nocturno (por defecto, oscuro violeta), Aurora (oscuro vivo, cian/azul) y Solar (claro, anaranjado). El color nunca se escribe literal: se consume desde tokens, y lo único que cambia entre temas es el archivo de tokens de cada tema.
- **Glassmorphism real**: los paneles son semitransparentes con `backdrop-filter` activo. No simular con grises opacos.
- **Desktop-first**: layouts pensados para ventanas amplias, no para móvil.
- **Sin librería de componentes externa** (shadcn, MUI, etc.): todo se construye con Tailwind + CSS custom.

---

## Fondo (Background)

### Regla crítica
El fondo **nunca** va en el contenedor del layout. Siempre es un elemento `fixed` separado con `z-index: -1`, para que el `backdrop-filter` de los paneles glass pueda borronear correctamente lo que hay detrás.

```tsx
<div
  className="fixed inset-0 overflow-hidden pointer-events-none"
  style={{ zIndex: -1, background: 'radial-gradient(ellipse at 20% 0%, #2a1352 0%, #150a2e 35%, #07050d 80%)' }}
>
  <div className="aurora" style={{ width:580, height:580, background:'#a855f7', top:-140, left:-100, animation:'float1 22s ease-in-out infinite' }} />
  <div className="aurora" style={{ width:520, height:520, background:'#ec4899', top:'35%', right:-120, opacity:0.58, animation:'float2 28s ease-in-out infinite' }} />
  <div className="aurora" style={{ width:600, height:600, background:'#6366f1', bottom:-140, left:'25%', opacity:0.52, animation:'float3 32s ease-in-out infinite' }} />
</div>
```

### Gradiente base
```
radial-gradient(ellipse at 20% 0%, #2a1352 0%, #150a2e 35%, #07050d 80%)
```
- `#2a1352` — púrpura oscuro (esquina superior izquierda)
- `#150a2e` — transición
- `#07050d` — casi negro (resto de la pantalla)

### Auroras (blobs animados)
Tres blobs de color con `filter: blur(72px)` y opacidad base `0.72` (clase `.aurora`):
- Blob 1: `#a855f7` (púrpura) — arriba izquierda
- Blob 2: `#ec4899` (rosa) — medio derecha, `opacity: 0.58`
- Blob 3: `#6366f1` (índigo) — abajo centro, `opacity: 0.52`

Las animaciones float1/float2/float3 están definidas en `App.css` y solo trasladan (sin `scale`): escalar una capa con blur obliga a re-rasterizarla en cada fotograma.

---

## Temas y tokens

El tema activo es un atributo del `<html>`: `data-theme="dark" | "aurora" | "solar"`, escrito por `PreferencesContext` (y por un script inline en `index.html` antes del primer paint). Los tokens viven en **un archivo por tema**, bajo `FRONTEND/src/styles/themes/`, importados desde `App.css`:

| Archivo | Selector |
|---|---|
| `styles/themes/dark.css` | `:root, html[data-theme="dark"]` (por defecto: aplica también sin atributo) |
| `styles/themes/aurora.css` | `html[data-theme="aurora"]` |
| `styles/themes/solar.css` | `html[data-theme="solar"]` |

**Contrato**: los tres archivos declaran exactamente la misma lista de variables, en el mismo orden, aunque el valor coincida con el del tema por defecto. Así un tema nuevo es copiar un archivo, y un token olvidado se detecta comparando las listas (ver *Cómo añadir un tema*). `App.css` queda solo con los `@import` y el CSS de componentes, que consume `var(--token)` y no depende del tema.

No hay conflicto de orden entre los archivos: `:root` tiene especificidad (0,1,0) y `html[data-theme="…"]` (0,1,1), así que un tema explícito siempre gana al bloque por defecto.

### Temas

| id | Nombre | Fondo | Marca | Tinta |
|---|---|---|---|---|
| `dark` (por defecto) | Nocturno | `#07050d` · radial `#2a1352→#150a2e→#07050d` | `#a855f7 → #ec4899` | `#f4f1ff` |
| `aurora` | Aurora | `#050d1a` · radial `#102a4d→#0a1a33→#050d1a` | `#22d3ee → #3b82f6` | `#eaf4ff` |
| `solar` | Solar | `#fdfaf6` · radial `#ffe8d1→#fff4e8→#fdfaf6` | `#f97316 → #fb923c` | `#2a1a0c` |

### Tokens

| Token | Uso |
|---|---|
| `--bg-base`, `--bg-mid`, `--bg-radial` | Fondo de la app y gradiente radial fijo |
| `--aurora-1..3`, `--aurora-opacity`, `--aurora-2-opacity`, `--aurora-3-opacity` | Blobs animados del fondo |
| `--surface-rgb` + `--glass-alpha` / `--glass-soft-alpha` / `--glass-input-alpha` / `--glass-float-alpha` | Base de `.glass`, `.glass-soft`, `.glass-input` y `.glass-float` (casi opaca, para separarse del contenido que pasa por debajo) |
| `--sheen-*` | Gradiente de brillo superior de los paneles |
| `--hairline`, `--hairline-soft`, `--hairline-strong`, `--hairline-hover` | Bordes de superficie: normal, anidada, acentuada y al pasar por encima |
| `--line` | Separadores dentro de un panel (`border-b`, `divide-y`). Deliberadamente más suave que `--hairline`: es el token que se repite N veces en una lista |
| `--edge-dashed`, `--edge-dashed-hover` | Borde discontinuo de zonas de soltar y de estados vacíos |
| `--inset-hi` | Labio de luz superior (va dentro de cada token de sombra, no en la clase) |
| `--inset-field` | Sombra interior de los campos: hundidos, al revés que los paneles |
| `--tint-hover`, `--tint-active`, `--tint-sunken` | Tintes de realce, selección y fondo rehundido |
| `--shadow-flat`, `--shadow-raised`, `--shadow-panel`, `--shadow-float`, `--shadow-modal` | Escala de elevación, de menos a más |
| `--shadow-brand-sm`, `--shadow-brand`, `--shadow-brand-hi` | Sombras de marca (violeta en Nocturno, cian en Aurora, naranja en Solar) |
| `--glow-ok`, `--glow-warn`, `--glow-danger` | Brillos semánticos. En Solar cambian de mecánica: anillo nítido en vez de halo |
| `--focus-ring` | Color del anillo de foco, propio por tema (la marca de Solar no llega a 3:1) |
| `--ink` | Texto base del documento |
| `--brand-1/2`, `--brand-1-rgb`/`--brand-2-rgb`, `--brand-light-1/2` | Gradiente de marca y variante clara (sliders, texto con gradiente) |
| `--on-brand` | Tinta sobre superficies `.grad-brand` |
| `--track`, `--knob`, `--scroll-thumb*`, `--chk-*`, `--select-bg`, `--focus-halo` | Controles: sliders, toggles, scrollbars, checkbox, select, foco |

### Remapeo de utilidades de Tailwind

Tailwind v4 compila cada utilidad de color a `var(--color-*)`, así que cada tema redefine esas variables y retiñe la app sin tocar las clases de los componentes:

- **`--color-white` es el canal de tinta, no "blanco"**. En Solar vale `#2a1a0c`, de modo que `text-white/55` es tinta oscura. Se usa **solo para texto e iconos**: bordes, separadores y tintes de fondo salen de sus propios tokens (`border-hairline`, `border-line`, `bg-tint-hover`…), porque convivían dos tintas distintas de borde y en Solar se veía el empalme. Para blanco real sobre la marca está `--on-brand`; para el dot de un toggle, `--knob`.
- `violet-*`, `purple-*`, `fuchsia-*`, `pink-*` e `indigo-500` son la **familia de marca**: se remapean a cian/azul en Aurora y a naranja/ámbar en Solar. Usarlas para acentos es correcto; para colores semánticos, no.
- `emerald` (ok), `amber` (atención), `rose` (error) y `sky` (info) conservan su significado y solo se oscurecen en Solar para contrastar sobre fondo claro.

---|---|---|
| Brand primary | `#a855f7 → #ec4899` (135°) | Botones primarios, activos, acentos |
| Brand soft | `rgba(168,85,247,0.18) → rgba(236,72,153,0.18)` | Fondos de acento suave |
| Brand text | `#c084fc → #f472b6` | Texto con gradiente de marca |
| Fondo base | `#07050d` | HTML/body |
| Fondo glass | `rgba(8,3,20,0.62)` | Base oscura de paneles principales |
| Éxito | `#34d399` / `emerald-400` | Estados online, positivos |
| Advertencia | `#fbbf24` / `amber-400` | Estados de atención |
| Error | `#fb7185` / `rose-400` | Estados offline, errores |
| Texto principal | `#f4f1ff` | Body text |
| Texto secundario | `rgba(255,255,255,0.65)` → `0.45` | Labels, subtítulos |
| Texto muted | `rgba(255,255,255,0.35)` | Captions, separadores de sección |

---

## Superficies (`App.css`)

### La capa importa

Las recetas de superficie viven en **`@layer components`**. No es cosmético: una regla fuera de capa gana a cualquier utilidad de Tailwind por muy específica que sea, y mientras `.glass` estuvo fuera dejaba muertos los `border-b-0` de la junta del panel, los `border-rose-400/20` de los avisos de error y los `hover:bg-*` escritos sobre tarjetas. En capa, la utilidad del componente corrige la receta propiedad a propiedad.

Siguen **fuera de capa a propósito**, y llevan su comentario: los `:root` de los temas (tienen que ganar a `@layer theme`) y `.grad-brand *` (tiene que ganar a `text-white`).

El puente con Tailwind son tres mecanismos:

| Mecanismo | Para qué | Ejemplo de uso |
|---|---|---|
| `@theme inline` | Colores de borde y tinte | `border-hairline`, `border-line`, `divide-line`, `bg-tint-hover`, `bg-track`, `border-edge` |
| `@utility` | Sombras | `elev-raised`, `elev-panel`, `elev-float`, `elev-modal`, `elev-brand`, `glow-ok` |
| `@layer components` | Recetas completas | `.glass`, `.glass-soft`, `.glass-input`, `.row-hit`, `.edge-dashed`, `.focus-ring`, `.nav-active`, `.panel-head` |

Las sombras no pueden ir por `@theme`: el namespace `--shadow-*` de Tailwind choca con los tokens del proyecto y `--shadow-panel: var(--shadow-panel)` sería circular.

### Escala de elevación

Un nivel es **una sola propiedad `box-shadow`**, con el labio de luz dentro del token, para que al anidar no se sumen sombras. Cada nivel lleva término de contacto además del ambiente: sin él un panel flota sin asentarse.

| Nivel | Uso |
|---|---|
| `--shadow-flat` | Tercer nivel de anidamiento: solo labio y contacto de 1 px |
| `--shadow-raised` | Tarjetas y bloques dentro de un panel |
| `--shadow-panel` | Paneles de primer nivel: sidebar y área de contenido |
| `--shadow-float` | Desplegables, popovers, avisos flotantes |
| `--shadow-modal` | Modales y la terminal |

**La profundidad se resuelve sola**: `.glass` y `.glass-soft` bajan de nivel automáticamente según cuántas superficies tengan encima, así que una tarjeta dentro de un panel no necesita decir nada. Para romper la regla se escribe la utilidad (`elev-panel`), que siempre gana.

**Solo la superficie exterior borronea**: dentro de otra superficie glass, `.glass`, `.glass-soft` y `.glass-input` conservan alfa y brillo pero no llevan `backdrop-filter` (ya están sobre cristal borroso; repetir el blur no se ve y cuesta un recálculo por capa en cada fotograma). Igual con `.grain`: el de una tarjeta dentro de un panel con grano no se pinta. Los modales van en portal, así que su caja sigue siendo superficie exterior. La excepción es `.glass-float`: una superficie que flota sobre contenido que se desplaza por debajo (la línea de comandos `sticky` del detalle de servidor, `components/servers/CommandBar.tsx`) recupera el blur aunque esté dentro de otro panel y sube su fondo a `--glass-float-alpha`. Va con `elev-float` y sin `.grain`.

**Solar invierte el reparto**: menos borde y más contacto. Empatar el trazo con Nocturno exigiría alfa 0,23, y a esa altura deja de leerse como borde y se lee como color marrón; la definición que falta la ponen las sombras, que sobre fondo claro sí rinden.

### `.glass` — paneles principales
Sidebar, área de contenido principal, modales.
```css
.glass {
  background-color: rgb(var(--surface-rgb) / var(--glass-alpha));
  background-image: linear-gradient(180deg, var(--sheen-1) 0%, var(--sheen-2) 100%);
  backdrop-filter: blur(28px) saturate(200%);
  border: 1px solid var(--hairline);
  box-shadow: var(--shadow-panel);
}
```

### `.glass-soft` — paneles anidados
Tarjetas dentro de paneles glass, chips de usuario, secciones de settings.
```css
.glass-soft {
  background-color: rgb(var(--surface-rgb) / var(--glass-soft-alpha));
  background-image: linear-gradient(180deg, var(--sheen-soft-1) 0%, var(--sheen-2) 100%);
  backdrop-filter: blur(18px) saturate(180%);
  border: 1px solid var(--hairline-soft);
  box-shadow: var(--shadow-raised);
}
```

### `.glass-input` — inputs y selects
Van al revés que los paneles: hundidos.
```css
.glass-input {
  background-color: rgb(var(--surface-rgb) / var(--glass-input-alpha));
  background-image: linear-gradient(180deg, var(--sheen-input-1) 0%, var(--sheen-input-2) 100%);
  border: 1px solid var(--hairline);
  box-shadow: inset 0 1px 2px var(--inset-field);
}
.glass-input:focus-within {
  border-color: rgb(var(--brand-1-rgb) / 0.5);
  box-shadow: inset 0 1px 2px var(--inset-field), 0 0 0 4px rgb(var(--brand-1-rgb) / 0.12);
}
```

### `.row-hit` — realce al pasar por encima
**Sobre una superficie glass no se usa `hover:bg-*`**: esa utilidad sustituye el color del cristal en vez de sumarse, y la tarjeta se queda translúcida. `.row-hit` apila el tinte como capa de imagen, por encima del brillo y del color, y de paso sube el borde a `--hairline-hover`. En elementos que no son glass, `hover:bg-tint-hover` es correcto.

### `.edge-dashed` — borde discontinuo
Zonas de soltar y estados vacíos. Lleva su propio `:hover` en CSS: **no se muta `style.borderColor` desde JS**.

### `.focus-ring` / `.focus-ring-inset` — foco visible
`.focus-ring` usa `outline` y sigue el radio del elemento; dentro de un `overflow: hidden` el outline se recorta y toca `.focus-ring-inset`, que lo dibuja con `box-shadow`.

### `.grain` — textura de grano
Aplicar a todo elemento `glass` o `glass-soft` que necesite profundidad visual. Usa `::after` pseudoelemento — el contenedor debe tener `position: relative` y `overflow: hidden`.

### `.grad-brand` — gradiente de marca
```css
background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
```

### `.grad-brand-soft` — gradiente suave de marca
```css
background: linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(236,72,153,0.18) 100%);
```

### `.text-grad-brand` — texto con gradiente
```css
background: linear-gradient(135deg, #c084fc 0%, #f472b6 100%);
-webkit-background-clip: text; background-clip: text; color: transparent;
```

### `.nav-active` — ítem de nav activo
```css
.nav-active {
  background: linear-gradient(135deg, rgb(var(--brand-1-rgb) / 0.28), rgb(var(--brand-2-rgb) / 0.28));
  border: 1px solid var(--hairline-strong);
  box-shadow: var(--shadow-brand), inset 0 1px 0 var(--inset-hi);
}
.sb-row.nav-active { border-color: var(--hairline-strong); }
```
El selector compuesto es necesario: `.sb-row` declara `border: 1px solid transparent` para reservar el hueco y, a igual especificidad, ganaba por orden de declaración.

---

## Componentes

### Botón primario (`.grad-brand`)
```tsx
<button className="grad-brand text-sm font-semibold px-4 h-10 rounded-xl
  elev-brand hover:elev-brand-hi transition">
  Guardar
</button>
```

### Botón secundario (glass)
```tsx
<button className="glass-soft row-hit text-white/85 text-sm font-medium px-4 h-10 rounded-xl">
  Cancelar
</button>
```

### Botón fantasma
```tsx
<button className="text-white/70 hover:text-white hover:bg-tint-hover text-sm px-4 h-10 rounded-xl transition">
  Acción
</button>
```

### Input de texto
```tsx
<div className="glass-input rounded-xl h-11 flex items-center gap-2 px-3.5 transition">
  <input className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 text-white" />
</div>
```

### Toggle (switch)
Usar el componente `Toggle` existente en `Settings.tsx`. Clases clave:
- Track on: `.grad-brand border-transparent elev-brand-sm`
- Track off: `bg-track border-hairline`
- Dot: `bg-white rounded-full` con `translate-x-5` cuando está on

### Slider (rango)
**Siempre usar el componente `RangeSlider`** de `Settings.tsx`, nunca `<input type="range">` nativo. El componente superpone un input invisible sobre visuals custom para consistencia cross-browser.

Thumb: `linear-gradient(135deg, #c084fc 0%, #f472b6 100%)` con `box-shadow: 0 0 0 4px rgba(168,85,247,0.22)`.
Track filled: `linear-gradient(135deg, #a855f7 0%, #ec4899 100%)`.
Track empty: `var(--track)`.

### Progress bar
**Siempre usar el componente `MetricBar`** de `components/common/MetricBar.tsx` (variante `compact` para filas densas). Su pista es `bg-track`, nunca un `bg-white/NN`: sobre el fondo claro de Solar un marrón al 6 % es invisible. El gradiente lo decide `barGradient` (`utils/metrics.ts`) según el valor: `emerald→teal`, `sky→cyan`, `amber→orange`, `rose→orange`.

```tsx
<div className="bg-track h-1.5 rounded-full overflow-hidden">
  <div className={`h-full rounded-full bg-gradient-to-r ${barGradient(value)} transition-all duration-700`}
    style={{ width: `${value}%` }} />
</div>
```

### Card (panel de contenido)
**Usar el componente `Card`** de `components/common/Card.tsx`:

```tsx
<Card className="p-5">{/* contenido */}</Card>
```
Siempre `rounded-2xl`. Nunca `rounded-md` ni `rounded-lg` en paneles principales. No se le escribe sombra: la elevación sale de la profundidad a la que quede la tarjeta.

### Badge de estado
```tsx
// Online
<span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md
  bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">Online</span>
// Atención
<span className="... bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20">Atención</span>
// Offline
<span className="... bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20">Offline</span>
```

### Ícono de acción (botón cuadrado)
```tsx
<button className="w-11 h-11 rounded-xl glass-soft row-hit text-white/75
  hover:text-white flex items-center justify-center transition">
  <Icon />
</button>
```

### Modal
Usar el componente `Modal` en `src/components/common/Modal.tsx`.
- **Se monta en el `body` con un portal**, no donde se use. Es obligatorio: `.glass` lleva `backdrop-filter` y `.mo-view` anima `transform`, y cualquiera de los dos convierte al ancestro en bloque contenedor, así que un `position: fixed` dentro de una tarjeta deja de medirse contra la ventana y el modal queda encerrado en ella. Cualquier overlay a pantalla completa que no use este componente (la terminal) tiene que portarse igual.
- Backdrop: `bg-black/60 backdrop-blur-md`
- Contenedor: `glass elev-modal rounded-2xl grain` con `max-h-[88vh] flex flex-col`
- Header: `shrink-0`
- Body: `overflow-y-auto modal-scroll flex-1 min-h-0`
- Tamaños: `sm=max-w-md`, `md=max-w-2xl`, `lg=max-w-3xl`, `xl=max-w-5xl`

### Zona de arrastrar y soltar
```tsx
<div className={`rounded-xl border border-dashed p-5 text-center transition ${
  dragging ? 'grad-brand-soft border-violet-400/40' : 'border-edge hover:border-edge-hover'
}`}>
```
Para un estado vacío completo basta la clase `.edge-dashed`, que ya trae el grosor y el hover.
El resaltado al arrastrar se hace con `grad-brand-soft`, no con un color literal. El contenedor lleva un contador de `dragenter`/`dragleave`: sin él, los hijos hacen parpadear el estado. La usa el modal SFTP (`components/servers/sftp/SftpDropZone.tsx`).

### Separador de sección
```tsx
<div className="border-t border-line" />
```
En listas, `divide-y divide-line`.

### Título de sección
```tsx
<h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">Título</h3>
```

---

## Layout principal

```
fixed background (z:-1)
└── fragment <>
    ├── fondo con auroras (fixed inset-0)
    └── div.h-full.flex.p-5.gap-5
        ├── aside.w-[240px].glass.rounded-2xl.grain  ← sidebar
        └── main.flex-1
            ├── div.glass.panel-head.rounded-2xl.rounded-b-none  ← chrome bar (traffic lights + URL)
            └── div.glass.rounded-2xl.rounded-t-none.overflow-hidden.grain  ← contenido
                └── div.h-full.overflow-y-auto.scroll-area.p-6
                    └── <Outlet />
```

El sidebar incluye siempre: brand, nav workspace, nav cuenta, tarjeta de estado de servidor, chip de usuario con logout.

---

## Tipografía

Tres familias **empaquetadas en el proyecto** (`FRONTEND/src/assets/fonts/`, WOFF2 variables, subconjuntos latin y latin-ext, SIL OFL). No se piden a ningún CDN: la app conserva su tipografía sin red. Se declaran en **`FRONTEND/src/styles/fonts.css`** y la elección del usuario (Configuración → Aspecto → Tipografía) se aplica con `data-font` en el `<html>`. Como el movimiento, **no depende del tema**.

| id | Familia | Peso | Carácter |
|---|---|---|---|
| `grotesk` (por defecto) | Space Grotesk | Delgada | Geométrica de trazo fino, aire técnico; métricas parecidas a las de Inter |
| `mono` | JetBrains Mono | Media | Monoespaciada de programación, redonda y muy clara |
| `rounded` | Nunito | Gruesa | Terminales redondeados, máxima legibilidad a tamaño pequeño |

A las tres se suma **Symbols Nerd Font Mono** (MIT, `ryanoasis/nerd-fonts`), que no es elegible: solo cubre el rango privado de glifos de prompt (powerline, devicons, seti, Font Awesome, codicons, Material Design) que JetBrains Mono no tiene. Va en dos archivos separados por `unicode-range` —símbolos y Material Design— para que el navegador descargue solo el que haga falta.

### Tokens

| Token | Uso |
|---|---|
| `--font-ui` | Familia de toda la interfaz; la consumen `html, body, #root` y los toasts |
| `--font-mono` | **Siempre JetBrains Mono**: métricas, IPs y logs (`font-mono`) quedan monoespaciados con cualquier elección |
| `--font-sans` | Sigue a `--font-ui` para que la utilidad `font-sans` no se salga del sistema |
| `--font-terminal` | Pila de la terminal SSH: JetBrains Mono + Symbols Nerd Font Mono. Como su paleta, **no sigue la elección del usuario**: un prompt con iconos debe verse igual que en la terminal del escritorio |

- No fijar `font-family` en un componente: usar `var(--font-ui)` o la utilidad `font-mono`. Lo que no es CSS (xterm recibe la familia por opción) lee el token con `getComputedStyle`, no una literal.
- xterm pinta sobre canvas, y el canvas no dispara la descarga de una fuente: la terminal hace `document.fonts.load` con una muestra de cada subconjunto Nerd Font y rehace el atlas en `loadingdone`, o los iconos quedan en cajas vacías.
- Color base: `var(--ink)`.
- Tamaños frecuentes: `text-xs` (10-12px labels), `text-sm` (13-14px body), `text-base` (16px títulos).
- Tracking en labels de sección: `tracking-wider` + `uppercase`.
- Números monoespaciados: `font-mono` + `tabular-nums`.

### Cómo añadir una tipografía

1. Descargar el WOFF2 (variable si existe, subconjuntos latin y latin-ext) a `src/assets/fonts/`.
2. Declarar sus `@font-face` y su bloque `html[data-font="<id>"]` en `styles/fonts.css`.
3. Registrar el id en `FontFamily`/`FONTS` (`types/preferences.types.ts`), en el tipo espejo y el `@IsIn` del backend, en la lista del script anti-flash de `index.html` y en `FONT_OPTIONS` de `Settings.tsx`.

---

## Scrollbars

### Área principal de contenido (`.scroll-area`)
- Ancho: 10px
- Thumb: `rgba(255,255,255,0.06)` con borde transparente 2px (padding-box)
- Hover: `rgba(255,255,255,0.12)`

### Sidebar (`.scroll-thin`)
- Ancho: 6px
- Thumb: `rgba(255,255,255,0.08)`

### Modal (`.modal-scroll`)
- Ancho: 4px
- Thumb: gradiente `rgba(168,85,247,0.45) → rgba(236,72,153,0.45)`

---

## Movimiento

Toda la animación compartida vive en **`FRONTEND/src/styles/motion.css`**, importado desde `App.css`. Es **independiente del tema**: los tokens `--mo-*` se declaran ahí y ningún archivo de `styles/themes/` los redefine, así que el movimiento es idéntico en Nocturno, Aurora y Solar. No es configurable salvo por el interruptor de apagado.

### Tokens

| Token | Valor | Uso |
|---|---|---|
| `--mo-fast` | `140ms` | Hover y cambios de estado |
| `--mo-base` | `200ms` | Selección de tab, entrada de panel |
| `--mo-slow` | `260ms` | Entrada de página y de modal |
| `--mo-ease` | `cubic-bezier(0.22,1,0.36,1)` | Entradas |
| `--mo-ease-inout` | `cubic-bezier(0.4,0,0.2,1)` | Hover y estado |
| `--mo-rise` | `8px` | Desplazamiento de entrada de vista |

### Clases

| Clase | Qué hace | Dónde |
|---|---|---|
| `.mo-tab` | Transición explícita de color, fondo, borde y sombra; `scale(0.98)` al pulsar. Sustituye a la clase `transition` genérica en los tabs | Pestañas de Configuración, tabs de detalle de servidor, nav del sidebar, selector de vista |
| `.mo-tab-on` | *Pop* de selección (`moPop`) | Rama activa de los tabs que usan `grad-brand` |
| `.nav-active` | Lleva el mismo *pop*, definido en `motion.css` (su aspecto sigue en `App.css`) | Sidebar y pestañas de Configuración |
| `.mo-panel` | Entrada del contenido de un tab: opacidad + 6 px | Panel de cada pestaña |
| `.mo-view` | Entrada de ventana nueva: opacidad + `--mo-rise` | Raíz de página y del detalle de servidor |
| `.animate-fadeIn` / `.animate-slideUp` | Backdrop y caja de modal | `Modal.tsx`, dropdowns |

**Patrón para animar el cambio de tab**: el contenido se monta con `&&`, así que basta con que el panel sea un elemento nuevo. Si los paneles son bloques condicionales hermanos (detalle de servidor), la clase `.mo-panel` en la raíz de cada uno es suficiente; si el contenido son componentes sin raíz propia (Configuración), se envuelve en `<div key={activeTab} className="mo-panel">` para forzar el remontaje. No se anima la salida: exigiría estado de desmontaje en cada sitio.

**Apagado**: Configuración → Aspecto → Movimiento ("Reducir animaciones") escribe `data-reduced-motion="true"` en el `<html>`; `motion.css` reduce ahí toda animación y transición a 1 ms y detiene las auroras. Lo mismo hace `@media (prefers-reduced-motion: reduce)` para quien lo pida desde el sistema operativo. Cualquier animación nueva queda cubierta automáticamente.

### Keyframes propios de componentes (siguen en `App.css`)

| Nombre | Uso |
|---|---|
| `float1/float2/float3` | Auroras de fondo |
| `pulseRing`, `fadeUp`, `blink`, `spin`, `spinR` | Decoración del login |
| `animate-pulse` | Indicadores de estado online |
| `animate-spin` | Spinners de carga |

---

## Cómo añadir un tema

1. **Copiar** `FRONTEND/src/styles/themes/solar.css` (o `dark.css`) a `<id>.css` en la misma carpeta, cambiar el selector a `html[data-theme="<id>"]` y ajustar los valores. No quitar ni añadir variables: la lista debe seguir siendo la misma que la de `dark.css`.
2. `FRONTEND/src/App.css`: añadir `@import "./styles/themes/<id>.css";` junto a los otros, siempre antes de cualquier regla.
3. `FRONTEND/src/types/preferences.types.ts`: añadir el id a `Theme` y a `THEMES` (la tabla `ENUMS` lo lee de ahí).
4. `BACKEND/src/auth/types/user-preferences.type.ts` y `dto/update-preferences.dto.ts`: mismo id en el tipo espejo y en el `@IsIn` — sin esto el `PATCH /auth/preferences` responde 400.
5. `FRONTEND/index.html`: añadir el id a la lista del script anti-flash.
6. `FRONTEND/src/pages/settings/Settings.tsx`: nueva entrada en `THEME_OPTIONS` con su swatch de preview.

Comprobar el contrato antes de dar por cerrado el tema:

```bash
cd FRONTEND/src/styles/themes
diff <(grep -oE '^  --[a-z0-9-]+' dark.css) <(grep -oE '^  --[a-z0-9-]+' <id>.css)
```

---

## Reglas de implementación

1. **No escribir sombras ni bordes a mano.** Nada de `shadow-[...]`, `border-white/NN` ni `style={{ border: … }}`: la elevación sale de `elev-*` o del anidamiento, y el borde de `border-hairline` / `border-line` / `border-edge`. `text-white/NN` sí es correcto — es el canal de tinta.
2. **Sobre una superficie glass, el realce es `.row-hit`**, no `hover:bg-*`: la utilidad sustituye el color del cristal y deja la tarjeta translúcida.
3. **No escribir color literal.** Ni en CSS ni en `style={{…}}`: siempre `var(--token)` o clases Tailwind de las familias ya remapeadas (violet, purple, fuchsia, pink para la marca; emerald, sky, rose, amber para lo semántico). Un `#hex` nuevo en un componente es un bug de tema.
4. **No usar fondos opacos** en paneles de interfaz. Todo panel de UI lleva `.glass` o `.glass-soft`.
5. **No usar `border-radius` menor a `rounded-xl`** en paneles y tarjetas. Elementos inline (badges, pills) pueden usar `rounded-full` o `rounded-md`.
6. **No crear sliders nativos.** Siempre usar el componente `RangeSlider`.
7. **No crear modales custom.** Siempre usar el componente `Modal` existente.
8. **No aplicar fondos opacos propios.** El fondo claro es cosa del tema Solar, que llega por `--surface-rgb` y los tokens: un componente nunca decide por su cuenta que su fondo es claro u oscuro.
9. **Todo componente debe funcionar en los tres temas.** El tema es una preferencia del usuario (Configuración → Aspecto, persistida en la cuenta). Antes de dar por terminado un componente, revisarlo en Nocturno, Aurora y Solar: contraste del texto, badges de estado y tinta sobre botones de marca.
10. **El fondo fixed con auroras** solo se instancia una vez en `AppLayout`. No duplicar en sub-páginas.
11. **Toda nueva página** que use `AppLayout` hereda el fondo automáticamente. No aplicar backgrounds adicionales en `<Outlet />` pages.
12. **Íconos**: usar SVG inline con `stroke="currentColor"`, `strokeWidth={1.75}`, `strokeLinecap="round"`, `strokeLinejoin="round"`. No usar librerías de íconos externas.
