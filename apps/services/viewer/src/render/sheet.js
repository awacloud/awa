// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview XLSX and ODS → a sheets View: one grid per visible sheet,
 * column letters and row numbers as sticky headers, column widths and row
 * heights, merged cells, cell styles (font, fill, borders, alignment,
 * wrapping), and values shown as the file last saved them — XLSX values
 * through `numfmt.js`, ODS cells with the display text they carry.
 *
 * Both formats are first reduced to one `Grid`, then painted by the same
 * code. Very large sheets are cut at `MAX_ROWS` × `MAX_COLS`, and at
 * `MAX_CELLS` painted cells (a wide sheet shows fewer rows); the cut is
 * recorded.
 *
 * @module viewer/render/sheet
 */
import { h } from './dom.js';
import { fontStack } from './flow.js';
import { createFormats, formatValue, BUILTIN } from './numfmt.js';
import { applyCss, cellCss, createOdfStyles, textCss } from './odf-style.js';
import { createOmissions, hexColour, lengthPx } from './view.js';
import { breathe } from './clock.js';

/** Rows / columns painted per sheet, at most. */
const MAX_ROWS = 2000;
const MAX_COLS = 200;
/** Cells painted per sheet, at most: beyond, the browser's table layout stalls. */
const MAX_CELLS = 100_000;
/**
 * Rows painted at once: the first slice is in the sheet when the View is
 * shown, the rest follow a slice per event-loop turn (a 46,000-cell sheet
 * held the page for 1.2 s in one block).
 */
const ROW_SLICE = 250;
/** An empty styled cell repeated more than this is filler (a whole-column style), not content. */
const FILLER_REPEAT = 100;
const DEFAULT_COL = 64;
const HEADER_W = 44;

/**
 * @typedef {{text: string, css: Record<string, string>, numeric: boolean,
 *   colspan?: number, rowspan?: number, link?: string|null}} GridCell
 * @typedef {{name: string, nRows: number, nCols: number, colWidths: number[], hiddenCols?: Set<number>,
 *   hiddenRows?: Set<number>, rowHeights: (number|null)[], cells: Map<number, Map<number, GridCell>>,
 *   covered: Set<string>, truncated: boolean, empty: boolean}} Grid
 */

/** Column letters: 0 → A, 26 → AA. */
export function columnName(i) {
    let n = i + 1;
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
}

/** `B12` → `{row: 11, col: 1}`. */
export function parseRef(ref) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(String(ref || '').trim());
    if (!m) return null;
    let col = 0;
    for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { row: Number(m[2]) - 1, col: col - 1 };
}

/**
 * Paint one grid: the header now; its rows once `start` is called (the
 * sheet is shown), the first `ROW_SLICE` at once and the others in later
 * slices (`cancel` stops them). A workbook of thirty sheets paints the one
 * shown, not three million cells.
 * @param {Grid} grid
 * @param {{t: (k: string, p?: object) => string}} ctx
 * @returns {{element: HTMLElement, width: number, cancel: () => void, start: () => void}}
 */
function paintGrid(grid, ctx) {
    const table = h('table', { class: 'awv-grid' });
    // Hidden columns are left out, as the spreadsheet does (letters keep their gaps).
    const hidden = grid.hiddenCols || new Set();
    const shown = [];
    for (let c = 0; c < grid.nCols; c++) if (!hidden.has(c)) shown.push(c);
    const widths = shown.map((c) => grid.colWidths[c] || DEFAULT_COL);
    const total = HEADER_W + widths.reduce((a, b) => a + b, 0);
    table.style.width = `${total}px`;
    table.append(h('caption', { class: 'awv-visually-hidden', text: grid.name }));
    table.append(h('colgroup', {}, [h('col', { style: { width: `${HEADER_W}px` } }), ...widths.map((w) => h('col', { style: { width: `${w.toFixed(0)}px` } }))]));
    const head = h('tr', {}, [h('th', { class: 'awv-grid-corner', 'aria-hidden': 'true' })]);
    for (const c of shown) head.append(h('th', { scope: 'col', class: 'awv-grid-col' }, columnName(c)));
    /** Columns a span covers once the hidden ones are left out. */
    const visibleSpan = (c, span) => { let n = 0; for (let k = c; k < c + span; k++) if (!hidden.has(k)) n++; return n; };
    // Hidden rows likewise (row numbers keep their gaps).
    const hiddenRows = grid.hiddenRows || new Set();
    const visibleRows = (r, span) => { let n = 0; for (let k = r; k < r + span; k++) if (!hiddenRows.has(k)) n++; return n; };
    table.append(h('thead', {}, head));
    const body = h('tbody');
    /** @param {number} r @returns {HTMLElement|null} */
    const rowEl = (r) => {
        if (hiddenRows.has(r)) return null;
        const tr = h('tr');
        const rh = grid.rowHeights[r];
        if (rh) tr.style.height = `${rh.toFixed(0)}px`;
        tr.append(h('th', { scope: 'row', class: 'awv-grid-row' }, String(r + 1)));
        const row = grid.cells.get(r);
        for (const c of shown) {
            if (grid.covered.has(`${r},${c}`)) continue;
            const cell = row ? row.get(c) : null;
            const span = cell?.colspan && cell.colspan > 1 ? visibleSpan(c, cell.colspan) : 1;
            const rspan = cell?.rowspan && cell.rowspan > 1 ? visibleRows(r, cell.rowspan) : 1;
            const td = h('td', { colspan: span > 1 ? span : null, rowspan: rspan > 1 ? rspan : null });
            if (cell) {
                if (cell.numeric) td.style.textAlign = 'right';
                applyCss(td, cell.css);
                // Text runs over empty neighbours, as in a spreadsheet.
                const next = row?.get(c + 1);
                if (cell.text && !cell.numeric && !cell.css.whiteSpace && (!next || !next.text) && !cell.colspan) td.classList.add('awv-overflow');
                td.append(cell.link ? h('a', { href: cell.link, target: '_blank', rel: 'noopener noreferrer' }, cell.text) : cell.text);
            }
            tr.append(td);
        }
        return tr;
    };
    let next = 0;
    let timer = /** @type {ReturnType<typeof setTimeout>|0} */ (0);
    const slice = () => {
        const end = Math.min(grid.nRows, next + ROW_SLICE);
        const rows = document.createDocumentFragment();
        for (; next < end; next++) { const tr = rowEl(next); if (tr) rows.append(tr); }
        body.append(rows);
        timer = next < grid.nRows ? setTimeout(slice, 0) : 0;
    };
    let started = false;
    const start = () => { if (!started) { started = true; slice(); } };
    table.append(body);
    const wrap = h('div', { class: 'awv-sheet' }, table);
    if (grid.empty) wrap.prepend(h('p', { class: 'awv-sheet-empty', text: ctx.t('view.emptySheet') }));
    return { element: wrap, width: total, cancel: () => clearTimeout(timer), start };
}

/** Trim a grid to its last non-empty row / column, within the caps. */
function extent(cells) {
    let nRows = 0;
    let nCols = 0;
    for (const [r, row] of cells) {
        for (const [c, cell] of row) {
            if (!cell.text && !cell.css.backgroundColor && !cell.css.borderTop && !cell.css.borderBottom) continue;
            nRows = Math.max(nRows, r + (cell.rowspan || 1));
            nCols = Math.max(nCols, c + (cell.colspan || 1));
        }
    }
    return { nRows, nCols };
}

/**
 * Finish a grid: compute its extent, apply the caps, mark covered cells.
 * @param {Omit<Grid, 'nRows'|'nCols'|'covered'|'truncated'|'empty'>} g
 * @returns {Grid}
 */
function finish(g) {
    // Spans are clamped to the painted area first: a hostile merge such as
    // A1:XFD1048576 must not walk 17 billion cells.
    let clamped = false;
    for (const [r, row] of g.cells) {
        for (const [c, cell] of row) {
            const rs = cell.rowspan ? Math.max(1, Math.min(cell.rowspan, MAX_ROWS - r)) : undefined;
            const cs = cell.colspan ? Math.max(1, Math.min(cell.colspan, MAX_COLS - c)) : undefined;
            if (rs !== cell.rowspan || cs !== cell.colspan) clamped = true;
            cell.rowspan = rs;
            cell.colspan = cs;
        }
    }
    const { nRows, nCols } = extent(g.cells);
    const empty = nRows === 0;
    const covered = new Set();
    for (const [r, row] of g.cells) {
        if (r >= MAX_ROWS) continue;
        for (const [c, cell] of row) {
            if (c >= MAX_COLS) continue;
            for (let dr = 0; dr < (cell.rowspan || 1); dr++) {
                for (let dc = 0; dc < (cell.colspan || 1); dc++) if (dr || dc) covered.add(`${r + dr},${c + dc}`);
            }
        }
    }
    // A margin of empty cells around the content, as a spreadsheet shows.
    const cols = Math.min(Math.max(nCols + 3, 12), MAX_COLS);
    const rowCap = Math.min(MAX_ROWS, Math.floor(MAX_CELLS / cols));
    return {
        ...g, covered, empty,
        nRows: Math.min(Math.max(nRows + 10, 30), rowCap),
        nCols: cols,
        truncated: clamped || nRows > rowCap || nCols > MAX_COLS
    };
}

/** Build the sheets View from grids. */
function sheetsView(grids, ctx, meta, omissions) {
    /** @type {(() => void)[]} */
    const cancels = [];
    const sheets = grids.map((g) => {
        if (g.truncated) omissions.add('sheet/truncated');
        const { element, cancel, width, start } = paintGrid(g, ctx);
        cancels.push(cancel);
        // Its natural width, so "Fit width" fits the sheet shown; its rows
        // painted when it is first shown (`prepare`, called by the stage).
        return { name: g.name, element, width, prepare: start };
    });
    // Every sheet hidden (or none at all): say so rather than show nothing.
    if (!sheets.length) {
        sheets.push({ name: ctx.t('view.sheets'), element: h('p', { class: 'awv-sheet-empty', text: ctx.t('view.emptyDocument') }) });
    }
    return {
        kind: 'sheets',
        title: meta.title || ctx.name,
        meta,
        width: undefined,
        sheets,
        omissions: omissions.list(),
        /** Stops the rows still to paint. */
        dispose() { for (const cancel of cancels) cancel(); }
    };
}

// ── XLSX ─────────────────────────────────────────────────────────────────

/** The legacy indexed palette (0–63; 64/65 are the system fore/back colours). */
const INDEXED = [
    '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
    '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
    '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
    '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
    '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
    '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
    '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
    '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'
];

/** SpreadsheetML theme index order (§18.8.3): light/dark swapped against DrawingML. */
const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

/** Apply a SpreadsheetML tint (−1…1) to `#rrggbb` through HSL lightness. */
export function tint(hex, t) {
    if (!t) return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) / 255; let g = ((n >> 8) & 255) / 255; let b = (n & 255) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    let hue = 0; let sat = 0; let lum = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
        hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        hue /= 6;
    }
    lum = t < 0 ? lum * (1 + t) : lum * (1 - t) + t;
    const f = (p, q, x) => {
        if (x < 0) x += 1; if (x > 1) x -= 1;
        if (x < 1 / 6) return p + (q - p) * 6 * x;
        if (x < 1 / 2) return q;
        if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
        return p;
    };
    if (sat === 0) { r = g = b = lum; } else {
        const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
        const p = 2 * lum - q;
        r = f(p, q, hue + 1 / 3); g = f(p, q, hue); b = f(p, q, hue - 1 / 3);
    }
    const to = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
}

/** The 12 theme colours as `#rrggbb`, from a `pptxTheme` model. */
function themeColours(theme) {
    const colors = theme?.clrScheme?.colors || {};
    return THEME_ORDER.map((key) => {
        // `{srgb: 'RRGGBB'}` or `{sysClr: {val, lastClr}}` (pptxTheme model).
        const c = colors[key];
        const v = typeof c === 'string' ? c : (c?.srgb || c?.sysClr?.lastClr || null);
        return hexColour(v) || (key.startsWith('dk') ? '#000000' : '#ffffff');
    });
}

/** A SpreadsheetML colour object → `#rrggbb` or null. */
function xlsxColour(c, theme) {
    if (!c) return null;
    if (c.rgb) return tint(hexColour(String(c.rgb).slice(-6)) || '#000000', Number(c.tint) || 0);
    if (c.theme !== undefined && theme[Number(c.theme)]) return tint(/** @type {string} */ (theme[Number(c.theme)]), Number(c.tint) || 0);
    if (c.indexed !== undefined) {
        const i = Number(c.indexed);
        if (i === 64) return null; // system foreground: inherit
        if (INDEXED[i]) return `#${INDEXED[i].toLowerCase()}`;
    }
    return null;
}

const XLSX_BORDERS = Object.freeze({
    thin: '1px solid', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted',
    double: '3px double', hair: '1px dotted', mediumDashed: '2px dashed', dashDot: '1px dashed',
    mediumDashDot: '2px dashed', dashDotDot: '1px dotted', mediumDashDotDot: '2px dotted', slantDashDot: '2px dashed'
});

/**
 * @param {Uint8Array} bytes
 * @param {import('./index.js').RenderContext} ctx
 */
export async function renderXlsx(bytes, ctx) {
    const { xlsx, theme: themeMod } = await ctx.engine('xlsx');
    const d = xlsx.read(bytes);
    // The parse is one block (the package's); the grids are the next one.
    await breathe();
    const wb = d.workbook;
    const omissions = createOmissions();
    const st = wb.styles || {};
    const themePart = d.package?.parts?.['/xl/theme/theme1.xml'];
    let theme = themeColours(themeMod.defaults());
    if (themePart) { try { theme = themeColours(themeMod.parse(themePart)); } catch { /* default theme */ } }
    const numFmts = new Map((st.numFmts || []).map((f) => [Number(f.id), f.formatCode]));
    const defaultFont = (st.fonts || [])[0] || {};
    // One set of number / date formatters for every cell of the workbook.
    const formats = createFormats(ctx.locale || 'en');
    const shared = wb.sharedStrings || [];
    // The 1904 date system (`workbookPr date1904`) is not typed: read it raw.
    const wbPart = d.package?.parts?.['/xl/workbook.xml'];
    const wbXml = wbPart ? (typeof wbPart === 'string' ? wbPart : new TextDecoder().decode(wbPart)) : '';
    const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(wbXml);

    /** Cell style index → {css, format}. */
    const styleCache = new Map();
    function styleOf(s) {
        const key = Number(s) || 0;
        if (styleCache.has(key)) return styleCache.get(key);
        const xf = (st.cellXfs || [])[key] || {};
        /** @type {Record<string, string>} */
        const css = {};
        const font = (st.fonts || [])[Number(xf.fontId) || 0] || {};
        if (font !== defaultFont) {
            if (font.bold) css.fontWeight = '700';
            if (font.italic) css.fontStyle = 'italic';
            const deco = [];
            if (font.underline && font.underline !== 'none') deco.push('underline');
            if (font.strike) deco.push('line-through');
            if (deco.length) css.textDecoration = deco.join(' ');
            if (font.size && font.size !== defaultFont.size) css.fontSize = `${Number(font.size)}pt`;
            if (font.name && font.name !== defaultFont.name) css.fontFamily = /** @type {string} */ (fontStack(font.name));
        }
        const fc = xlsxColour(font.color, theme);
        if (fc && fc !== '#000000') css.color = fc;
        const fill = (st.fills || [])[Number(xf.fillId) || 0];
        if (fill && fill.patternType && fill.patternType !== 'none') {
            const bg = xlsxColour(fill.fgColor, theme) || xlsxColour(fill.bgColor, theme);
            if (bg && fill.patternType !== 'gray125') css.backgroundColor = bg;
        }
        const border = (st.borders || [])[Number(xf.borderId) || 0] || {};
        for (const side of ['top', 'right', 'bottom', 'left']) {
            const b = border[side];
            const style = b && XLSX_BORDERS[/** @type {keyof typeof XLSX_BORDERS} */ (b.style)];
            if (style) css[`border${side[0].toUpperCase()}${side.slice(1)}`] = `${style} ${xlsxColour(b.color, theme) || '#000000'}`;
        }
        const al = xf.alignment || {};
        if (al.horizontal && al.horizontal !== 'general') css.textAlign = al.horizontal === 'centerContinuous' ? 'center' : al.horizontal === 'distributed' ? 'justify' : al.horizontal;
        if (al.vertical) css.verticalAlign = al.vertical === 'center' ? 'middle' : al.vertical === 'distributed' ? 'middle' : al.vertical;
        if (al.wrapText) css.whiteSpace = 'pre-wrap';
        if (al.indent) css.paddingLeft = `${Number(al.indent) * 9 + 4}px`;
        const id = Number(xf.numFmtId) || 0;
        const out = { css, format: numFmts.get(id) || BUILTIN[/** @type {keyof typeof BUILTIN} */ (id)] || null };
        styleCache.set(key, out);
        return out;
    }

    const grids = [];
    let formulas = 0;
    for (const sheet of wb.sheets || []) {
        if (sheet.state === 'hidden' || sheet.state === 'veryHidden') continue;
        /** @type {Map<number, Map<number, GridCell>>} */
        const cells = new Map();
        (sheet.rows || []).forEach((row, ri) => {
            (row || []).forEach((cell, ci) => {
                if (!cell) return;
                const pos = parseRef(cell.ref) || { row: ri, col: ci };
                if (pos.row >= MAX_ROWS * 2 || pos.col >= MAX_COLS * 2) return;
                const { css, format } = styleOf(cell.s);
                let value = cell.value;
                if (cell.t === 's' && typeof value === 'number') value = shared[value];
                if (value && typeof value === 'object') value = value.text ?? (value.runs || []).map((r) => r.text ?? r.value ?? '').join('');
                if (cell.formula) formulas++;
                let text;
                let numeric = false;
                if (value === null || value === undefined || value === '') text = '';
                else if (cell.t === 'b') text = value === true || value === 1 || value === '1' ? 'TRUE' : 'FALSE';
                else if (cell.t === 'e') text = String(value);
                else if (typeof value === 'number' || (cell.t === 'n' && value !== '' && Number.isFinite(Number(value)))) {
                    text = formatValue(Number(value), format, formats, date1904);
                    numeric = true;
                } else text = String(value);
                if (!text && !css.backgroundColor && !css.borderTop && !css.borderBottom && !css.borderLeft && !css.borderRight) return;
                if (!cells.has(pos.row)) cells.set(pos.row, new Map());
                // General alignment: numbers right, text left, booleans and errors centred.
                const centred = (cell.t === 'b' || cell.t === 'e') && !css.textAlign;
                /** @type {Map<number, GridCell>} */ (cells.get(pos.row)).set(pos.col, {
                    text, css: centred ? { ...css, textAlign: 'center' } : css, numeric: numeric && !css.textAlign
                });
            });
        });
        for (const range of sheet.merges || []) {
            const [a, b] = String(range).split(':').map(parseRef);
            if (!a || !b) continue;
            if (!cells.has(a.row)) cells.set(a.row, new Map());
            const row = /** @type {Map<number, GridCell>} */ (cells.get(a.row));
            const cell = row.get(a.col) || { text: '', css: {}, numeric: false };
            cell.rowspan = b.row - a.row + 1;
            cell.colspan = b.col - a.col + 1;
            row.set(a.col, cell);
        }
        for (const link of sheet.hyperlinks || []) {
            const pos = parseRef(String(link.ref || '').split(':')[0]);
            const target = link.target || link.url || null;
            const cell = pos ? cells.get(pos.row)?.get(pos.col) : null;
            if (cell && target && /^(https?:|mailto:)/i.test(target)) cell.link = target;
        }
        const colWidths = [];
        const hiddenCols = new Set();
        for (const col of sheet.cols || []) {
            const w = Number(col.width);
            // `min` / `max` are 1-based and bounded: a hostile range must not loop.
            const last = Math.min(MAX_COLS, Number(col.max));
            for (let c = Math.max(0, Number(col.min) - 1); c < last; c++) {
                if (col.hidden) hiddenCols.add(c);
                else if (Number.isFinite(w)) colWidths[c] = Math.round(w * 7 + 5);
            }
        }
        // Row heights (points) and hidden rows: `rowProps` entries name their row by `r` (1-based).
        const rowHeights = [];
        const hiddenRows = new Set();
        for (const rp of Object.values(sheet.rowProps || {})) {
            const r = Number(rp?.r) - 1;
            if (!Number.isInteger(r) || r < 0 || r >= MAX_ROWS * 2) continue;
            if (rp.hidden) hiddenRows.add(r);
            else if (Number(rp.height) > 0) rowHeights[r] = Math.min(Number(rp.height), 409) * 96 / 72;
        }
        if ((sheet.drawings || []).length) omissions.add('sheet/image');
        grids.push(finish({ name: sheet.name, colWidths, hiddenCols, hiddenRows, rowHeights, cells }));
    }
    if (formulas) omissions.add('sheet/formula', formulas);
    return sheetsView(grids, ctx, { title: undefined }, omissions);
}

// ── ODS ──────────────────────────────────────────────────────────────────

/** Visible text of an ODF paragraph element tree (`text:s`, tabs, breaks). */
function odfText(nodes) {
    let s = '';
    for (const n of nodes || []) {
        if (n.type === 'text') s += n.value || '';
        else if (n.name === 'text:s') s += ' '.repeat(Math.min(1000, Number(n.attrs?.['text:c']) || 1));
        else if (n.name === 'text:tab') s += '\t';
        else if (n.name === 'text:line-break') s += '\n';
        else if (n.children) s += odfText(n.children);
    }
    return s;
}

/**
 * @param {Uint8Array} bytes
 * @param {import('./index.js').RenderContext} ctx
 */
export async function renderOds(bytes, ctx) {
    const { ods } = await ctx.engine('ods');
    const d = ods.read(bytes);
    await breathe();
    const omissions = createOmissions();
    const styles = createOdfStyles(d);
    const face = (n) => styles.face(n);
    const grids = [];
    let formulas = 0;
    for (const table of d.spreadsheet?.tables || []) {
        /** @type {Map<number, Map<number, GridCell>>} */
        const cells = new Map();
        const colWidths = [];
        // `table:visibility` `collapse` or `filter` hides a column or a row, as the spreadsheet does.
        const shownAs = (v) => !v || v === 'visible';
        const hiddenCols = new Set();
        let c0 = 0;
        for (const col of table.columns || []) {
            const w = lengthPx(styles.resolve(col.styleName, 'table-column').tableColumn?.['column-width']);
            for (let k = 0; k < Number(col.repeated || 1) && c0 < MAX_COLS; k++, c0++) {
                colWidths[c0] = w || DEFAULT_COL;
                if (!shownAs(col.visibility)) hiddenCols.add(c0);
            }
        }
        const rowHeights = [];
        const hiddenRows = new Set();
        let r = 0;
        for (const row of table.rows || []) {
            const rowReps = Number(row.repeated || 1) || 1;
            const reps = Math.min(rowReps, MAX_ROWS * 2 - r);
            const rh = lengthPx(styles.resolve(row.styleName, 'table-row').tableRow?.['row-height']);
            const rowShown = shownAs(row.visibility);
            // The row's cells, resolved once for all its repeats.
            /** @type {{at: number, n: number, cell: GridCell}[]} */
            const placed = [];
            let c = 0;
            for (const cell of row.cells || []) {
                const creps = Math.min(Number(cell.repeated || 1) || 1, MAX_COLS * 2 - c);
                if (creps <= 0) break;
                if (cell.covered) { c += creps; continue; }
                const text = (cell.children || []).filter((x) => x.name === 'text:p' || x.name === 'text:h').map((p) => odfText(p.children)).join('\n');
                if (cell.formula) formulas += creps * reps;
                // Whole-column or whole-row styling repeated a million times is filler.
                if (!text && (rowReps > FILLER_REPEAT || Number(cell.repeated || 1) > FILLER_REPEAT)) { c += creps; continue; }
                const cs = styles.resolve(cell.styleName, 'table-cell');
                const css = { ...cellCss(cs.tableCell), ...textCss(cs.text, face) };
                const align = cs.paragraph?.['text-align'];
                if (align) css.textAlign = align === 'start' ? 'left' : align === 'end' ? 'right' : align;
                if (cs.tableCell?.['wrap-option'] === 'wrap') css.whiteSpace = 'pre-wrap';
                if (!text && !css.backgroundColor && !css.borderTop && !css.borderBottom) { c += creps; continue; }
                placed.push({
                    at: c, n: creps,
                    cell: {
                        text, css,
                        numeric: !align && /^(float|percentage|currency|date|time)$/.test(cell.valueType || ''),
                        colspan: Number(cell.colSpan) || undefined,
                        rowspan: Number(cell.rowSpan) || undefined
                    }
                });
                c += creps;
            }
            for (let k = 0; k < reps; k++, r++) {
                if (rh) rowHeights[r] = rh;
                if (!rowShown && r < MAX_ROWS) hiddenRows.add(r);
                for (const p of placed) {
                    if (!cells.has(r)) cells.set(r, new Map());
                    // Each repeat is its own cell (spans are clamped per cell in finish()).
                    for (let j = 0; j < p.n; j++) /** @type {Map<number, GridCell>} */ (cells.get(r)).set(p.at + j, { ...p.cell });
                }
            }
            if (r >= MAX_ROWS * 2) break;
        }
        grids.push(finish({ name: table.name || ctx.t('view.sheetN', { n: grids.length + 1 }), colWidths, hiddenCols, hiddenRows, rowHeights, cells }));
    }
    if (formulas) omissions.add('sheet/formula', formulas);
    return sheetsView(grids, ctx, { title: d.meta?.title || undefined, author: d.meta?.creator || undefined }, omissions);
}

