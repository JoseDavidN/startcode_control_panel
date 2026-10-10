import { unzipSync, strFromU8 } from 'fflate';

/* Lectura de Word (.docx) y Excel (.xlsx) para la vista previa, sin
   librerías de ofimática: los dos son un ZIP de XML, que fflate abre y
   DOMParser lee. Se extrae solo lo que la vista pinta (texto, negritas,
   títulos, listas, tablas y celdas); el formato fino se pierde. Los formatos
   binarios antiguos (.doc, .xls) no son ZIP y se rechazan con un mensaje. */

export class UnsupportedFileError extends Error {}

async function unzip(blob: Blob): Promise<Record<string, Uint8Array>> {
  try {
    return unzipSync(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new UnsupportedFileError('El archivo no es un documento de Office moderno (.docx o .xlsx).');
  }
}

function parseXml(files: Record<string, Uint8Array>, path: string): Document | null {
  const data = files[path];
  return data ? new DOMParser().parseFromString(strFromU8(data), 'application/xml') : null;
}

/** Hijos con este nombre local, sin depender del prefijo del espacio de nombres. */
const childrenNamed = (el: Element, name: string) => Array.from(el.children).filter(c => c.localName === name);
const firstNamed = (el: Element, name: string) => Array.from(el.children).find(c => c.localName === name);
const descendants = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name));

/* ── Word ─────────────────────────────────────────────────────────── */

export interface DocRun { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
export type DocBlock =
  | { kind: 'paragraph'; style: 'title' | 'h1' | 'h2' | 'h3' | 'normal'; list: boolean; runs: DocRun[] }
  | { kind: 'table'; rows: string[][] };

/** Un `w:b` o `w:i` sin `w:val`, o con un valor distinto de falso, está activo. */
const on = (el: Element | undefined) => {
  const val = el?.getAttribute('w:val');
  return Boolean(el) && val !== '0' && val !== 'false';
};

function paragraph(p: Element): DocBlock {
  const pPr = firstNamed(p, 'pPr');
  const styleId = (pPr && firstNamed(pPr, 'pStyle')?.getAttribute('w:val'))?.toLowerCase() ?? '';
  const style = styleId === 'title' ? 'title'
    : /heading1|ttulo1|titulo1/.test(styleId) ? 'h1'
      : /heading2|ttulo2|titulo2/.test(styleId) ? 'h2'
        : /heading[3-9]|ttulo[3-9]|titulo[3-9]/.test(styleId) ? 'h3'
          : 'normal';
  const list = Boolean(pPr && firstNamed(pPr, 'numPr'));
  const runs: DocRun[] = [];
  /* Los runs pueden ir dentro de hipervínculos o campos: se recorren todos. */
  for (const r of descendants(p, 'r')) {
    const rPr = firstNamed(r, 'rPr');
    let text = '';
    for (const c of Array.from(r.children)) {
      if (c.localName === 't') text += c.textContent ?? '';
      else if (c.localName === 'tab') text += '\t';
      else if (c.localName === 'br') text += '\n';
    }
    if (!text) continue;
    runs.push({
      text,
      bold: on(rPr && firstNamed(rPr, 'b')),
      italic: on(rPr && firstNamed(rPr, 'i')),
      underline: Boolean(rPr && firstNamed(rPr, 'u') && firstNamed(rPr, 'u')?.getAttribute('w:val') !== 'none'),
    });
  }
  return { kind: 'paragraph', style, list, runs };
}

export async function readDocx(blob: Blob): Promise<DocBlock[]> {
  const files = await unzip(blob);
  const doc = parseXml(files, 'word/document.xml');
  const body = doc && descendants(doc, 'body')[0];
  if (!body) throw new UnsupportedFileError('El documento no tiene contenido legible.');
  const blocks: DocBlock[] = [];
  for (const el of Array.from(body.children)) {
    if (el.localName === 'p') blocks.push(paragraph(el));
    else if (el.localName === 'tbl') {
      const rows = childrenNamed(el, 'tr').map(tr =>
        childrenNamed(tr, 'tc').map(tc => descendants(tc, 't').map(t => t.textContent ?? '').join('')));
      blocks.push({ kind: 'table', rows });
    }
  }
  return blocks;
}

/* ── Excel ────────────────────────────────────────────────────────── */

export interface Sheet { name: string; rows: string[][] }

/** Tope de la vista previa por hoja: una hoja enorme no debe bloquear la ventana. */
export const SHEET_MAX_ROWS = 1_000;
export const SHEET_MAX_COLS = 60;

/** "AB12" → 27 (columna, desde 0). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(blob: Blob): Promise<Sheet[]> {
  const files = await unzip(blob);
  const workbook = parseXml(files, 'xl/workbook.xml');
  if (!workbook) throw new UnsupportedFileError('El libro no tiene hojas legibles.');

  const shared = parseXml(files, 'xl/sharedStrings.xml');
  const strings = shared ? descendants(shared, 'si').map(si => descendants(si, 't').map(t => t.textContent ?? '').join('')) : [];

  /* Cada hoja apunta a su archivo por la relación r:id del libro. */
  const rels = parseXml(files, 'xl/_rels/workbook.xml.rels');
  const targets = new Map(rels ? descendants(rels, 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']) : []);

  return descendants(workbook, 'sheet').map((sheetEl, i) => {
    const name = sheetEl.getAttribute('name') ?? `Hoja ${i + 1}`;
    const relId = sheetEl.getAttribute('r:id') ?? sheetEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = targets.get(relId) ?? `worksheets/sheet${i + 1}.xml`;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheet = parseXml(files, path);
    const rows: string[][] = [];
    if (sheet) {
      for (const row of descendants(sheet, 'row')) {
        const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
        if (r >= SHEET_MAX_ROWS) break;
        const cells: string[] = rows[r] ?? [];
        childrenNamed(row, 'c').forEach((c, idx) => {
          const ref = c.getAttribute('r');
          const col = ref ? columnIndex(ref) : idx;
          if (col >= SHEET_MAX_COLS) return;
          const type = c.getAttribute('t');
          const v = firstNamed(c, 'v')?.textContent ?? '';
          cells[col] = type === 's' ? strings[Number(v)] ?? ''
            : type === 'inlineStr' ? descendants(c, 't').map(t => t.textContent ?? '').join('')
              : type === 'b' ? (v === '1' ? 'VERDADERO' : 'FALSO')
                : v;
        });
        rows[r] = cells;
      }
    }
    /* Filas y celdas vacías intermedias como texto vacío, para pintar la rejilla. */
    const width = Math.max(0, ...rows.map(r => r?.length ?? 0));
    return { name, rows: Array.from(rows, r => Array.from({ length: width }, (_, c) => r?.[c] ?? '')) };
  });
}
