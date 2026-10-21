// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML number formats (ECMA-376 §18.8.30–31) for
 * display: the built-in ids and the common custom codes — sections
 * (`pos;neg;zero;text`), `0` / `#` / `?` digits, thousands separators,
 * percent, scientific, quoted and escaped literals, `[$€-40C]` currency
 * tags, colour tags (ignored), and date / time codes over the 1900 serial.
 *
 * Separators follow the viewer's locale (`Intl.NumberFormat`), as a
 * spreadsheet application follows the reader's system. An XLSX stores raw
 * values; ODS cells already carry their display text and never come here.
 * No `@awacloud/*` package evaluates SpreadsheetML formats today; this
 * module is a promotion candidate for `@awacloud/ooxml`.
 *
 * @module viewer/render/numfmt
 */

/** Built-in number formats (§18.8.30). */
export const BUILTIN = Object.freeze({
    0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
    9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
    14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
    18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm',
    37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
    45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@'
});

/** Excel 1900 serial → UTC `Date` (the 1900 leap-year bug folded in). */
export function serialToDate(serial) {
    const days = serial >= 60 ? serial - 1 : serial;
    return new Date(Date.UTC(1899, 11, 31) + Math.round(days * 86400000));
}

/**
 * Split a format code into its `;` sections, quotes and escapes respected.
 * @param {string} code
 */
function sections(code) {
    const out = [''];
    let quoted = false;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (ch === '"') quoted = !quoted;
        if (ch === '\\' && !quoted) { out[out.length - 1] += ch + (code[++i] ?? ''); continue; }
        if (ch === ';' && !quoted) { out.push(''); continue; }
        out[out.length - 1] += ch;
    }
    return out;
}

/** Strip bracket tags, keeping a `[$sym-lcid]` currency symbol as a literal. */
function stripTags(sec) {
    return sec.replace(/\[\$([^\]-]*)(-[^\]]*)?\]/g, (_, sym) => (sym ? `"${sym}"` : ''))
        .replace(/\[(?!h\]|hh\]|m\]|mm\]|s\]|ss\])[^\]]*\]/gi, '');
}

const DATE_TOKEN = /(yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p|\[h+\]|\[m+\]|\[s+\])/gi;

/** True when a section is a date/time format (outside quotes). */
function isDate(sec) {
    const bare = sec.replace(/"[^"]*"/g, '').replace(/\\./g, '');
    return /[dyhs]|(^|[^0#?])m/i.test(bare) && !/[0#?]/.test(bare.replace(/\.0+/g, ''));
}

/**
 * Format a date/time section.
 * @param {number} serial
 * @param {string} sec
 * @param {Formats} fx
 */
function formatDate(serial, sec, fx) {
    const d = serialToDate(serial);
    const hours12 = /am\/pm|a\/p/i.test(sec);
    const tokens = [];
    // Tokenise: literals, quoted strings, date tokens.
    let i = 0;
    while (i < sec.length) {
        if (sec[i] === '"') { const j = sec.indexOf('"', i + 1); tokens.push({ lit: sec.slice(i + 1, j < 0 ? undefined : j) }); i = j < 0 ? sec.length : j + 1; continue; }
        if (sec[i] === '\\') { tokens.push({ lit: sec[i + 1] ?? '' }); i += 2; continue; }
        DATE_TOKEN.lastIndex = i;
        const m = DATE_TOKEN.exec(sec);
        if (m && m.index === i) { tokens.push({ tok: m[0] }); i += m[0].length; continue; }
        tokens.push({ lit: sec[i] }); i++;
    }
    // `m` / `mm` right after an hour or before seconds is minutes.
    tokens.forEach((t, k) => {
        if (!t.tok || !/^m{1,2}$/i.test(t.tok)) return;
        const prev = tokens.slice(0, k).reverse().find((x) => x.tok);
        const next = tokens.slice(k + 1).find((x) => x.tok);
        if ((prev && /^\[?h/i.test(prev.tok)) || (next && /^\[?s/i.test(next.tok))) t.minute = true;
    });
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const month = (style) => fx.date({ month: style, timeZone: 'UTC' }).format(d);
    const weekday = (style) => fx.date({ weekday: style, timeZone: 'UTC' }).format(d);
    const totalHours = Math.floor(serial * 24);
    return tokens.map((t) => {
        if (t.lit !== undefined) return t.lit;
        const tok = t.tok.toLowerCase();
        if (t.minute) return tok.length === 2 ? pad(d.getUTCMinutes()) : String(d.getUTCMinutes());
        switch (tok) {
            case 'yyyy': return String(d.getUTCFullYear());
            case 'yy': return pad(d.getUTCFullYear() % 100);
            case 'mmmmm': return month('narrow');
            case 'mmmm': return month('long');
            case 'mmm': return month('short');
            case 'mm': return pad(d.getUTCMonth() + 1);
            case 'm': return String(d.getUTCMonth() + 1);
            case 'dddd': return weekday('long');
            case 'ddd': return weekday('short');
            case 'dd': return pad(d.getUTCDate());
            case 'd': return String(d.getUTCDate());
            case 'hh': case 'h': {
                let hr = d.getUTCHours();
                if (hours12) hr = hr % 12 || 12;
                return tok === 'hh' ? pad(hr) : String(hr);
            }
            case 'ss': return pad(d.getUTCSeconds());
            case 's': return String(d.getUTCSeconds());
            case 'am/pm': return d.getUTCHours() < 12 ? 'AM' : 'PM';
            case 'a/p': return d.getUTCHours() < 12 ? 'A' : 'P';
            default:
                if (/^\[h+\]$/.test(tok)) return String(totalHours);
                if (/^\[m+\]$/.test(tok)) return String(Math.floor(serial * 1440));
                if (/^\[s+\]$/.test(tok)) return String(Math.floor(serial * 86400));
                return t.tok;
        }
    }).join('');
}

/**
 * Read a number section once: its literals around one numeric
 * placeholder run, and what the run asks for.
 * @param {string} sec
 */
function numberPlan(sec) {
    // Literals: quoted text, escapes, and anything outside the digit run.
    const body = sec.replace(/_./g, ' ').replace(/\*./g, '');
    const percent = (body.replace(/"[^"]*"/g, '').match(/%/g) || []).length;
    // Find the digit run with quoted text masked (same length, so indices hold).
    const masked = body.replace(/"[^"]*"/g, (q) => q.replace(/[0#?.,]/g, ' ')).replace(/\\./g, '  ');
    const lit = (str) => str.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1');
    const m = /[0#?][0#?,.]*([eE][+-]0+)?/.exec(masked);
    if (!m) return { text: lit(body) };
    const run = m[0];
    const [intPart, fracPart = ''] = run.replace(/[eE].*$/, '').split('.');
    return {
        before: lit(body.slice(0, m.index)),
        after: lit(body.slice(m.index + run.length)),
        percent,
        sci: /[eE][+-]/.test(body),
        expDigits: (run.match(/[eE][+-](0+)/) || ['', '00'])[1].length,
        decimals: (fracPart.match(/[0#?]/g) || []).length,
        minDecimals: (fracPart.match(/0/g) || []).length,
        grouping: /,[0#?]/.test(intPart),
        // Trailing commas scale by 1000 each.
        scaleCommas: (intPart.match(/,+$/) || [''])[0].length,
        minInt: (intPart.match(/0/g) || []).length
    };
}

/**
 * Format a number section: literals around one numeric placeholder run.
 * @param {number} value absolute value already chosen for the section
 * @param {string} sec
 * @param {Formats} fx
 */
function formatNumber(value, sec, fx) {
    const p = fx.memo(`n${sec}`, () => numberPlan(sec));
    if (p.text !== undefined) return p.text;
    const v = (value * 100 ** p.percent) / 1000 ** p.scaleCommas;
    let text;
    if (p.sci) {
        const exp = v === 0 ? 0 : Math.floor(Math.log10(Math.abs(v)));
        const mant = v / 10 ** exp;
        text = fx.number({ minimumFractionDigits: p.minDecimals, maximumFractionDigits: p.decimals }).format(mant)
            + 'E' + (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(p.expDigits, '0');
    } else {
        text = fx.number({
            useGrouping: p.grouping, minimumIntegerDigits: Math.max(1, p.minInt),
            minimumFractionDigits: p.minDecimals, maximumFractionDigits: p.decimals
        }).format(v);
        if (p.minInt === 0 && /^0(?=\D)/.test(text) && p.decimals > 0) text = text.slice(1);
    }
    return p.before + text + p.after;
}

/**
 * @typedef {{locale: string, number: (o: Intl.NumberFormatOptions) => Intl.NumberFormat,
 *   date: (o: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat,
 *   memo: <T>(key: string, make: () => T) => T}} Formats
 */

/**
 * The `Intl` formatters of one locale, each built once: a sheet formats
 * thousands of cells, and building a formatter costs far more than using
 * it (57,000 cells took 750 ms with one formatter per cell).
 * @param {string} locale
 * @returns {Formats}
 */
export function createFormats(locale) {
    /** @type {Map<string, any>} */
    const cache = new Map();
    const get = (Kind, opts) => {
        const key = `${Kind === Intl.NumberFormat ? 'n' : 'd'}${JSON.stringify(opts)}`;
        let f = cache.get(key);
        if (!f) { f = new Kind(locale, opts); cache.set(key, f); }
        return f;
    };
    /** @type {Map<string, any>} */
    const plans = new Map();
    /** A format code is read once: its sections, kinds and number plans. */
    const memo = (key, make) => {
        if (!plans.has(key)) plans.set(key, make());
        return plans.get(key);
    };
    return { locale, number: (o) => get(Intl.NumberFormat, o), date: (o) => get(Intl.DateTimeFormat, o), memo };
}

/**
 * Display text of a numeric cell value under a format code.
 *
 * @param {number} value
 * @param {string|null|undefined} code a format code, or `null` for General
 * @param {string|Formats} locale BCP 47 locale for separators and month names,
 *   or the formatters of one (`createFormats`), to share across many cells
 * @param {boolean} [date1904] the workbook counts days from 1904 (Mac Excel)
 * @returns {string}
 */
export function formatValue(value, code, locale, date1904 = false) {
    if (!Number.isFinite(value)) return String(value);
    const fx = typeof locale === 'string' ? createFormats(locale) : locale;
    const general = () => {
        const abs = Math.abs(value);
        if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) return value.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E');
        return fx.number({ maximumFractionDigits: 10, useGrouping: false }).format(value);
    };
    if (!code || /^general$/i.test(code)) return general();
    const secs = fx.memo(`s${code}`, () => sections(code).map(stripTags));
    // A negative value shown by its own section carries no sign (the section
    // spells it, e.g. parentheses); shown by the first section, it gets "-".
    let index = 0;
    if (value < 0 && secs.length > 1) index = 1;
    else if (value === 0 && secs.length > 2) index = 2;
    const sec = /** @type {string} */ (secs[index]);
    const signed = value < 0 && index === 0;
    if (/^general$/i.test(sec.trim())) return general();
    if (sec.trim() === '@') return general();
    try {
        // 1904 system: day 0 is 1904-01-01, 1462 days after the 1900 epoch.
        if (fx.memo(`d${sec}`, () => isDate(sec))) return formatDate(date1904 ? value + 1462 : value, sec, fx);
        const out = formatNumber(Math.abs(value), sec, fx);
        return signed ? '-' + out : out;
    } catch {
        return general();
    }
}
