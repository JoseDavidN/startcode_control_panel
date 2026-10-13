/* Estilos compartidos de las gráficas del dashboard (recharts). Fuera del
   render: recharts compara las props por identidad. Solo tokens del tema. */

export const TOOLTIP_STYLE = {
  background: 'rgb(var(--surface-rgb) / 0.92)',
  border: '1px solid var(--hairline)',
  borderRadius: 12,
  color: 'var(--ink)',
  fontSize: 12,
};
export const TOOLTIP_LABEL_STYLE = { color: 'var(--ink)', fontWeight: 600, marginBottom: 2 };
export const TOOLTIP_CURSOR = { fill: 'var(--tint-hover)' };
export const AXIS_TICK = { fontSize: 11 };
export const AXIS_STYLE = { fill: 'currentColor' };
