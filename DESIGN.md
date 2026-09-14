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

Las animaciones float1/float2/float3 están definidas en `App.css`.

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
| `--surface-rgb` + `--glass-alpha` / `--glass-soft-alpha` / `--glass-input-alpha` | Base de `.glass`, `.glass-soft`, `.glass-input` |
| `--sheen-*` | Gradiente de brillo superior de los paneles |
| `--hairline`, `--hairline-soft`, `--hairline-strong`, `--inset-hi` | Bordes y línea interior |
| `--shadow-panel`, `--shadow-modal` | Sombras de paneles y modales |
| `--ink` | Texto base del documento |
| `--brand-1/2`, `--brand-1-rgb`/`--brand-2-rgb`, `--brand-light-1/2` | Gradiente de marca y variante clara (sliders, texto con gradiente) |
| `--on-brand` | Tinta sobre superficies `.grad-brand` |
| `--track`, `--knob`, `--scroll-thumb*`, `--chk-*`, `--select-bg`, `--focus-halo` | Controles: sliders, toggles, scrollbars, checkbox, select, foco |

### Remapeo de utilidades de Tailwind

Tailwind v4 compila cada utilidad de color a `var(--color-*)`, así que cada tema redefine esas variables y retiñe la app sin tocar las clases de los componentes:

- **`--color-white` es el canal de tinta/overlay sobre la superficie**, no "blanco". En Solar vale `#2a1a0c`, de modo que `text-white/55`, `bg-white/[0.06]` y `border-white/[0.06]` se convierten en tinta, tinte y hairline oscuros. Para blanco real sobre la marca está `--on-brand`; para el dot de un toggle, `--knob`.
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

## Clases CSS de Glass (`App.css`)

### `.glass` — paneles principales
Sidebar, área de contenido principal, modales.
```css
.glass {
  background-color: rgba(8, 3, 20, 0.62);
  background-image: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(28px) saturate(200%);
  -webkit-backdrop-filter: blur(28px) saturate(200%);
  border: 1px solid rgba(255,255,255,0.09);
  box-shadow:
    0 1px 0 0 rgba(255,255,255,0.07) inset,
    0 24px 60px -24px rgba(0,0,0,0.7),
    0 1px 2px rgba(0,0,0,0.5);
}
```

### `.glass-soft` — paneles anidados
Tarjetas dentro de paneles glass, chips de usuario, secciones de settings.
```css
.glass-soft {
  background-color: rgba(8, 3, 20, 0.40);
  background-image: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.07);
}
```

### `.glass-input` — inputs y selects
```css
.glass-input {
  background-color: rgba(8, 3, 20, 0.30);
  background-image: linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 100%);
  border: 1px solid rgba(255,255,255,0.09);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.glass-input:focus-within {
  border-color: rgba(168,85,247,0.5);
  box-shadow: 0 0 0 4px rgba(168,85,247,0.12);
}
```

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
background: linear-gradient(135deg, rgba(168,85,247,0.28), rgba(236,72,153,0.28));
border: 1px solid rgba(255,255,255,0.14);
box-shadow: 0 8px 24px -8px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.12);
```

---

## Componentes

### Botón primario (`.grad-brand`)
```tsx
<button className="grad-brand text-white text-sm font-semibold px-4 h-10 rounded-xl
  shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)]
  hover:shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] transition">
  Guardar
</button>
```

### Botón secundario (glass)
```tsx
<button className="glass-soft text-white/85 text-sm font-medium px-4 h-10 rounded-xl
  hover:bg-white/[0.07] transition">
  Cancelar
</button>
```

### Botón fantasma
```tsx
<button className="text-white/70 hover:text-white hover:bg-white/[0.06] text-sm px-4 h-10 rounded-xl transition">
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
- Track on: `.grad-brand` + `shadow-[0_4px_14px_-4px_rgba(168,85,247,0.7)]`
- Track off: `bg-white/10 border border-white/10`
- Dot: `bg-white rounded-full` con `translate-x-5` cuando está on

### Slider (rango)
**Siempre usar el componente `RangeSlider`** de `Settings.tsx`, nunca `<input type="range">` nativo. El componente superpone un input invisible sobre visuals custom para consistencia cross-browser.

Thumb: `linear-gradient(135deg, #c084fc 0%, #f472b6 100%)` con `box-shadow: 0 0 0 4px rgba(168,85,247,0.22)`.
Track filled: `linear-gradient(135deg, #a855f7 0%, #ec4899 100%)`.
Track empty: `rgba(255,255,255,0.08)`.

### Progress bar
```tsx
<div className="bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
  <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full
    relative overflow-hidden transition-all duration-700" style={{ width: `${value}%` }}>
    {/* shimmer con @keyframes shine */}
  </div>
</div>
```
Gradientes según métrica: CPU `emerald→teal` (normal) / `rose→orange` (alto), RAM `sky→blue`, Disco `violet→fuchsia`.

### Card (panel de contenido)
```tsx
<div className="glass rounded-2xl relative grain p-5">
  {/* contenido */}
</div>
```
Siempre `rounded-2xl`. Nunca `rounded-md` ni `rounded-lg` en paneles principales.

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
<button className="w-11 h-11 rounded-xl glass-soft text-white/75
  hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition">
  <Icon />
</button>
```

### Modal
Usar el componente `Modal` en `src/components/common/Modal.tsx`.
- Backdrop: `bg-black/60 backdrop-blur-md`
- Contenedor: `glass rounded-2xl grain` con `max-h-[88vh] flex flex-col`
- Header: `shrink-0`
- Body: `overflow-y-auto modal-scroll flex-1 min-h-0`
- Tamaños: `sm=max-w-md`, `md=max-w-2xl`, `lg=max-w-3xl`, `xl=max-w-5xl`

### Separador de sección
```tsx
<div className="border-t border-white/[0.06]" />
```

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
            ├── div.glass.rounded-2xl.rounded-b-none  ← chrome bar (traffic lights + URL)
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

### Tokens

| Token | Uso |
|---|---|
| `--font-ui` | Familia de toda la interfaz; la consumen `html, body, #root` y los toasts |
| `--font-mono` | **Siempre JetBrains Mono**: métricas, IPs y logs (`font-mono`) quedan monoespaciados con cualquier elección |
| `--font-sans` | Sigue a `--font-ui` para que la utilidad `font-sans` no se salga del sistema |

- No fijar `font-family` en un componente: usar `var(--font-ui)` o la utilidad `font-mono`.
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
| `shine` | Shimmer en barras de progreso |
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

1. **No escribir color literal.** Ni en CSS ni en `style={{…}}`: siempre `var(--token)` o clases Tailwind de las familias ya remapeadas (violet, purple, fuchsia, pink para la marca; emerald, sky, rose, amber para lo semántico). Un `#hex` nuevo en un componente es un bug de tema.
2. **No usar fondos opacos** en paneles de interfaz. Todo panel de UI lleva `.glass` o `.glass-soft`.
3. **No usar `border-radius` menor a `rounded-xl`** en paneles y tarjetas. Elementos inline (badges, pills) pueden usar `rounded-full` o `rounded-md`.
4. **No crear sliders nativos.** Siempre usar el componente `RangeSlider`.
5. **No crear modales custom.** Siempre usar el componente `Modal` existente.
6. **No aplicar fondos opacos propios.** El fondo claro es cosa del tema Solar, que llega por `--surface-rgb` y los tokens: un componente nunca decide por su cuenta que su fondo es claro u oscuro.
7. **Todo componente debe funcionar en los tres temas.** El tema es una preferencia del usuario (Configuración → Aspecto, persistida en la cuenta). Antes de dar por terminado un componente, revisarlo en Nocturno, Aurora y Solar: contraste del texto, badges de estado y tinta sobre botones de marca.
8. **El fondo fixed con auroras** solo se instancia una vez en `AppLayout`. No duplicar en sub-páginas.
9. **Toda nueva página** que use `AppLayout` hereda el fondo automáticamente. No aplicar backgrounds adicionales en `<Outlet />` pages.
10. **Íconos**: usar SVG inline con `stroke="currentColor"`, `strokeWidth={1.75}`, `strokeLinecap="round"`, `strokeLinejoin="round"`. No usar librerías de íconos externas.
