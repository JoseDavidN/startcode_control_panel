import { strToU8, zipSync } from 'fflate';

/**
 * Exportación de una tabla de resultados a CSV y XLSX.
 *
 * El XLSX se arma a mano (SpreadsheetML mínimo: una hoja, cabecera fija con
 * filtro, textos en línea) y se comprime con fflate: una librería de hojas de
 * cálculo completa pesaría cientos de KB para escribir una tabla.
 *
 * El estilo de la tabla sigue al tema activo (`sheetThemeFromCss`): cabecera
 * con el color de marca y su tinta, y filas alternas teñidas de la marca
 * sobre blanco, que es como se lee una hoja de cálculo.
 */

export type TableCell = unknown;

export interface ExportTable {
	columns: string[];
	rows: TableCell[][];
}

const cellText = (v: TableCell): string =>
	v === null || v === undefined ? ''
		: typeof v === 'object' ? JSON.stringify(v)
		: String(v as string | number | boolean);

/* ── CSV ───────────────────────────────────────────────────────────── */

/** RFC 4180 con BOM para que Excel lea bien tildes y eñes. */
export function toCsv({ columns, rows }: ExportTable): Blob {
	const escape = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
	const lines = [columns, ...rows].map(r => r.map(v => escape(cellText(v))).join(','));
	return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

/* ── XLSX ──────────────────────────────────────────────────────────── */

/** Colores de la hoja en hex `RRGGBB`. */
export interface SheetTheme {
	header: string;
	headerText: string;
	stripe: string;
	text: string;
	border: string;
}

const DEFAULT_SHEET_THEME: SheetTheme = {
	header: 'A855F7', headerText: 'FFFFFF', stripe: 'F6EEFE', text: '1F1B2E', border: 'E5D4FD',
};

const parseHex = (value: string): [number, number, number] | null => {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
	if (!m) return null;
	const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
	return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const toHex = (rgb: number[]) => rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Mezcla `color` sobre blanco con la opacidad dada. */
const tint = (rgb: [number, number, number], alpha: number) => toHex(rgb.map(c => 255 + (c - 255) * alpha));

/**
 * Colores de la hoja a partir de los tokens del tema activo (`--brand-1`,
 * `--on-brand`). Fuera del navegador, o si un token no es hex, usa Nocturno.
 */
export function sheetThemeFromCss(): SheetTheme {
	if (typeof document === 'undefined') return DEFAULT_SHEET_THEME;
	const css = getComputedStyle(document.documentElement);
	const brand = parseHex(css.getPropertyValue('--brand-1'));
	const onBrand = parseHex(css.getPropertyValue('--on-brand'));
	if (!brand || !onBrand) return DEFAULT_SHEET_THEME;
	return {
		header: toHex(brand),
		headerText: toHex(onBrand),
		stripe: tint(brand, 0.09),
		text: DEFAULT_SHEET_THEME.text,
		border: tint(brand, 0.28),
	};
}

/* Índices de estilo de celda (`cellXfs` en styles.xml). */
const STYLE_HEADER = 1;
const STYLE_ROW = 2;
const STYLE_ROW_STRIPE = 3;

/* Caracteres de control que XML 1.0 no admite. */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const xml = (s: string) =>
	s.replace(INVALID_XML, '')
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 0 → A, 25 → Z, 26 → AA. */
function columnRef(index: number): string {
	let n = index + 1;
	let ref = '';
	while (n > 0) {
		const m = (n - 1) % 26;
		ref = String.fromCharCode(65 + m) + ref;
		n = Math.floor((n - 1) / 26);
	}
	return ref;
}

function cellXml(value: TableCell, ref: string, style = 0): string {
	const s = style ? ` s="${style}"` : '';
	/* Vacía pero con estilo: si no, el hueco rompe la franja y el borde. */
	if (value === null || value === undefined) return `<c r="${ref}"${s}/>`;
	/* Solo los números de verdad van como número; los enteros grandes llegan
	   como texto desde el backend y así conservan todos sus dígitos. */
	if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
	if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
	return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(cellText(value))}</t></is></c>`;
}

export function toXlsx(
	{ columns, rows }: ExportTable,
	sheetName = 'Resultados',
	theme: SheetTheme = DEFAULT_SHEET_THEME,
): Blob {
	const header = `<row r="1" ht="22" customHeight="1">${columns.map((c, i) => cellXml(c, `${columnRef(i)}1`, STYLE_HEADER)).join('')}</row>`;
	/* Filas alternas: la primera de datos teñida, la siguiente en blanco. */
	const body = rows.map((row, r) => {
		const style = r % 2 === 0 ? STYLE_ROW_STRIPE : STYLE_ROW;
		const cells = columns.map((_, c) => cellXml(row[c], `${columnRef(c)}${r + 2}`, style)).join('');
		return `<row r="${r + 2}">${cells}</row>`;
	}).join('');
	const lastRef = `${columnRef(Math.max(columns.length - 1, 0))}${rows.length + 1}`;

	/* Ancho aproximado por columna según el texto más largo (tope 60). */
	const widths = columns.map((c, i) => {
		const longest = rows.reduce((max, row) => Math.max(max, cellText(row[i]).length), c.length);
		return Math.min(60, Math.max(8, longest + 2));
	});
	const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;

	const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols}<sheetData>${header}${body}</sheetData><autoFilter ref="A1:${lastRef}"/></worksheet>`;

	const files: Record<string, Uint8Array> = {
		'[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
		'_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
		'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
		'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
		'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF${theme.headerText}"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF${theme.text}"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${theme.header}"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${theme.stripe}"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF${theme.border}"/></left><right style="thin"><color rgb="FF${theme.border}"/></right><top style="thin"><color rgb="FF${theme.border}"/></top><bottom style="thin"><color rgb="FF${theme.border}"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
		'xl/worksheets/sheet1.xml': strToU8(sheet),
	};

	return new Blob([zipSync(files)], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	});
}
