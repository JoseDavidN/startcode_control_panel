import { dirname } from 'path';

/**
 * Barrera de salida: el asistente ayuda con los servidores y bases del
 * usuario, no con StartCode Panel por dentro. Aunque el prompt lo prohíbe,
 * un modelo puede deducir y escribir dónde está instalado el panel (por
 * ejemplo, el `.env` del backend). Aquí se ocultan esas rutas en lo que
 * responde el modelo, antes de guardarlo y de reenviarlo como historial.
 */
export const PANEL_PATH_MASK = '[ruta interna del panel]';

/** Rutas absolutas con al menos dos niveles: `/app` (Docker) sola no se toca, chocaría con rutas de los servidores. */
const isSpecific = (p: string) => p.split('/').filter(Boolean).length >= 2;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildRules(installDirs: string[]): RegExp[] {
  const dirs = [...new Set(installDirs.filter(d => d && d.startsWith('/') && isSpecific(d)))]
    /* La más larga primero: el directorio del backend antes que el del repositorio. */
    .sort((a, b) => b.length - a.length);
  return [
    ...dirs.map(d => new RegExp(`${escape(d)}(?=[/\\s'"\`)\\]:,.;]|$)[^\\s'"\`)\\],;]*`, 'g')),
    /* Cualquier copia del proyecto: …/startcode_panel/BACKEND/.env, …/startcode-panel/FRONTEND/src… */
    /(?:~|\.{1,2})?(?:\/[\w.-]+)*\/startcode[_-]?panel\/(?:BACKEND|FRONTEND|backend|frontend)(?:\/[^\s'"`)\],;]*)?/g,
  ];
}

let rules = buildRules([process.cwd(), dirname(process.cwd())]);

/** Solo para tests: fija los directorios de instalación. */
export function setPanelInstallDirs(dirs: string[]): void {
  rules = buildRules(dirs);
}

export function hidePanelInternals(text: string): string {
  let out = text;
  for (const re of rules) out = out.replace(re, PANEL_PATH_MASK);
  return out;
}

const OMITTED_NOTE = '_(Se omitieron indicaciones sobre archivos internos de StartCode Panel: sus ajustes se cambian desde la interfaz del panel.)_';

/**
 * Para las respuestas: además de ocultar las rutas, quita los párrafos y
 * bloques de código que hablaban de ellas. Una instrucción como «edita el
 * .env en [ruta]» sin la ruta sigue siendo una instrucción sobre el panel.
 */
export function stripPanelInstructions(text: string): string {
  const masked = hidePanelInternals(text);
  if (!masked.includes(PANEL_PATH_MASK)) return masked;

  /* Bloques de código enteros y, fuera de ellos, párrafos separados por línea en blanco. */
  const parts = masked.split(/(```[\s\S]*?(?:```|$))/g);
  const kept: string[] = [];
  let removed = false;
  for (const part of parts) {
    if (part.startsWith('```')) {
      if (part.includes(PANEL_PATH_MASK)) removed = true;
      else kept.push(part);
      continue;
    }
    const paragraphs = part.split(/\n{2,}/);
    const ok = paragraphs.filter(p => !p.includes(PANEL_PATH_MASK));
    if (ok.length !== paragraphs.length) removed = true;
    kept.push(ok.join('\n\n'));
  }
  const out = kept.join('').replace(/\n{3,}/g, '\n\n').trim();
  return removed ? `${out}\n\n${OMITTED_NOTE}`.trim() : out;
}

