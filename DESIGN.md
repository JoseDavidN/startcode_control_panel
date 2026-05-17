# Sistema de Diseño — StartCode Panel

Glassmorphism oscuro enfocado en aplicación de escritorio. Este archivo es la fuente de verdad de diseño. Toda nueva pantalla, componente o modificación visual **debe** seguir estas reglas sin excepción.

---

## Principios

- **Un solo modo**: siempre oscuro, nunca hay toggle de tema.
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

## Paleta de colores

| Token | Valor | Uso |
|---|---|---|
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

- Font: `Inter` (importada desde Google Fonts o sistema), fallback `system-ui, sans-serif`
- Color base: `#f4f1ff`
- Tamaños frecuentes: `text-xs` (10-12px labels), `text-sm` (13-14px body), `text-base` (16px títulos)
- Tracking en labels de sección: `tracking-wider` + `uppercase`
- Números monoespaciados: `font-mono` + `tabular-nums`

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

## Animaciones

| Nombre | Uso |
|---|---|
| `float1/float2/float3` | Auroras de fondo |
| `shine` | Shimmer en barras de progreso |
| `fadeIn` (160ms) | Aparición de overlays/modales |
| `slideUp` (220ms, cubic-bezier 0.22,1,0.36,1) | Entrada de paneles de modal |
| `animate-pulse` | Indicadores de estado online |
| `animate-spin` | Spinners de carga |

---

## Reglas de implementación

1. **No usar colores hardcoded arbitrarios.** Siempre usar los tokens de la paleta o clases Tailwind alineadas con la paleta (violet, fuchsia, pink, emerald, sky, rose, amber).
2. **No usar fondos opacos** en paneles de interfaz. Todo panel de UI lleva `.glass` o `.glass-soft`.
3. **No usar `border-radius` menor a `rounded-xl`** en paneles y tarjetas. Elementos inline (badges, pills) pueden usar `rounded-full` o `rounded-md`.
4. **No crear sliders nativos.** Siempre usar el componente `RangeSlider`.
5. **No crear modales custom.** Siempre usar el componente `Modal` existente.
6. **No aplicar fondos blancos, grises o claros** a ningún elemento de la UI.
7. **No personalizar el tema** (dark mode toggle, cambio de colores por preferencia del usuario). El diseño es siempre el mismo.
8. **El fondo fixed con auroras** solo se instancia una vez en `AppLayout`. No duplicar en sub-páginas.
9. **Toda nueva página** que use `AppLayout` hereda el fondo automáticamente. No aplicar backgrounds adicionales en `<Outlet />` pages.
10. **Íconos**: usar SVG inline con `stroke="currentColor"`, `strokeWidth={1.75}`, `strokeLinecap="round"`, `strokeLinejoin="round"`. No usar librerías de íconos externas.
