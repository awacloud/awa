// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * CSV (Comma-Separated Values, RFC 4180) import/export for tabular data.
 * String-based API - compose with `utf8` for byte I/O.
 *
 * Parse and stringify between :
 *   - CSV text ↔ array of arrays (default)
 *   - CSV text ↔ array of objects (header mode)
 *
 * Default dialect is RFC 4180 : delimiter `,`, double-quote escaping, CRLF
 * line endings on output. Parse is tolerant : accepts LF, CR, CRLF line
 * endings, optional BOM, optional trailing newline. Custom dialects (TSV,
 * semicolon-CSV, etc.) via the `delimiter`/`quote`/`newline` options.
 *
 * @example
 * const csv = registry.resolve('csv');
 *
 * // Array mode
 * csv.parse('a,b,c\n1,2,3');
 * // [['a','b','c'], ['1','2','3']]
 *
 * // Object mode (first row → field names)
 * csv.parse('name,age\nAlice,30\nBob,25', { header: true, cast: true });
 * // [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]
 *
 * // Export
 * csv.stringify([{ name: 'Alice', age: 30 }]);
 * // 'name,age\r\nAlice,30\r\n'
 */
/**
 * @typedef {object} CsvAPI
 * @property {(text: string, options?: { delimiter?: string, quote?: string, header?: boolean | string[], skipEmpty?: boolean, trim?: boolean, cast?: boolean, comment?: string | null, skipLines?: number }) => any[][] | Record<string, any>[]} parse
 * @property {(data: any[][] | Record<string, any>[], options?: { delimiter?: string, quote?: string, newline?: string, header?: boolean | string[] }) => string} stringify
 */
export const csv = {
    name: 'csv',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /**
     * Factory function that creates a CSV codec instance.
     * @returns {CsvAPI}
     */
    factory() {

        // ---------- value casting ----------

        const INT_RE = /^-?\d+$/;
        const FLOAT_RE = /^-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/;

        function castValue(s) {
            if (s === '') return '';
            if (s === 'true') return true;
            if (s === 'false') return false;
            if (s === 'null') return null;
            if (INT_RE.test(s)) {
                const n = Number(s);
                if (Number.isSafeInteger(n)) return n;
                // Fallback : too large for safe integer → keep as string
                return s;
            }
            if (FLOAT_RE.test(s)) return Number(s);
            return s;
        }

        // ---------- parse ----------

        /**
         * Parse CSV text into a list of rows.
         *
         * @param {string} text
         * @param {Object} [options]
         * @param {string} [options.delimiter=','] Field separator (e.g. '\t' for TSV, ';' for EU-CSV).
         * @param {string} [options.quote='"'] Quote character (RFC 4180 doubling rule).
         * @param {boolean|string[]} [options.header=false] If `true`, consume first row as field names and return array of objects. If a string[], use as column names and keep all rows as data.
         * @param {boolean} [options.skipEmpty=true] Skip blank lines.
         * @param {boolean} [options.trim=false] Trim whitespace around unquoted fields.
         * @param {boolean} [options.cast=false] Auto-detect and convert numeric / boolean / null literals.
         * @param {string|null} [options.comment=null] If set, lines starting with this character are skipped (after leading whitespace).
         * @param {number} [options.skipLines=0] Skip the first N non-empty, non-comment lines (useful for files with a preamble).
         * @returns {any[][]|Object[]} Array of rows, each row is either an array of fields or an object keyed by header.
         * @throws {Error} On unterminated quoted field at end of input.
         */
        function parse(text, options) {
            options = options || {};
            const delimiter = options.delimiter || ',';
            const quote = options.quote || '"';
            const skipEmpty = options.skipEmpty !== false;
            const trim = !!options.trim;
            const cast = !!options.cast;
            const comment = options.comment || null;
            const skipLines = options.skipLines | 0;

            if (delimiter.length !== 1) throw new Error('csv: delimiter must be a single character');
            if (quote.length !== 1) throw new Error('csv: quote must be a single character');

            // Strip UTF-8 BOM if present.
            let start = 0;
            if (text.charCodeAt(0) === 0xfeff) start = 1;

            const rows = [];
            let field = '';
            let row = [];
            let fieldWasQuoted = false;
            let inQuotes = false;
            const len = text.length;
            let skipped = 0;

            const pushField = () => {
                row.push((trim && !fieldWasQuoted) ? field.trim() : field);
                field = '';
                fieldWasQuoted = false;
            };

            const pushRow = () => {
                pushField();
                const isBlank = row.length === 1 && row[0] === '';
                if (isBlank && skipEmpty) { row = []; return; }
                if (comment !== null && row.length > 0 &&
                    (trim ? row[0].trimStart() : row[0]).charAt(0) === comment) {
                    row = [];
                    return;
                }
                if (skipped < skipLines) {
                    skipped++;
                    row = [];
                    return;
                }
                rows.push(row);
                row = [];
            };

            let i = start;
            while (i < len) {
                const c = text[i];

                if (inQuotes) {
                    if (c === quote) {
                        if (text[i + 1] === quote) { field += quote; i += 2; continue; }
                        inQuotes = false;
                        i++;
                        continue;
                    }
                    field += c;
                    i++;
                    continue;
                }

                if (c === quote && field === '') {
                    inQuotes = true;
                    fieldWasQuoted = true;
                    i++;
                    continue;
                }

                if (c === delimiter) { pushField(); i++; continue; }

                if (c === '\r') {
                    pushRow();
                    i += (text[i + 1] === '\n') ? 2 : 1;
                    continue;
                }
                if (c === '\n') { pushRow(); i++; continue; }

                field += c;
                i++;
            }

            if (inQuotes) throw new Error('csv: unterminated quoted field');

            // Trailing field / row (no final newline).
            if (field !== '' || row.length > 0) pushRow();

            if (cast) {
                for (let r = 0; r < rows.length; r++) {
                    const curr = rows[r];
                    for (let j = 0; j < curr.length; j++) curr[j] = castValue(curr[j]);
                }
            }

            // Header mode
            if (options.header) {
                let keys;
                if (Array.isArray(options.header)) {
                    keys = options.header;
                } else {
                    if (rows.length === 0) return [];
                    keys = rows.shift();
                    if (cast) for (let j = 0; j < keys.length; j++) keys[j] = String(keys[j]);
                }
                const out = new Array(rows.length);
                for (let r = 0; r < rows.length; r++) {
                    const obj = {};
                    const curr = rows[r];
                    for (let j = 0; j < keys.length; j++) obj[keys[j]] = curr[j];
                    out[r] = obj;
                }
                return out;
            }

            return rows;
        }

        // ---------- stringify ----------

        function formatValue(v) {
            if (v === null || v === undefined) return '';
            if (v instanceof Date) return v.toISOString();
            if (typeof v === 'bigint') return v.toString();
            return String(v);
        }

        /**
         * Encode rows into CSV text.
         *
         * - Rows may be arrays (array-of-arrays mode) or objects (object mode).
         * - In object mode, a header row is emitted by default using the keys
         *   of the first object (or `options.header` if provided as string[]).
         * - Fields containing delimiter, quote, or line breaks are quoted and
         *   embedded quotes are doubled.
         * - `null`/`undefined` → empty field ; `Date` → ISO string ; `BigInt` → decimal.
         *
         * @param {Array<Array<any>>|Array<Object>} data
         * @param {Object} [options]
         * @param {string} [options.delimiter=','] Field separator.
         * @param {string} [options.quote='"'] Quote character.
         * @param {string} [options.newline='\r\n'] Record separator.
         * @param {boolean|string[]} [options.header] In object mode: `false` to suppress header row, string[] to force column order. In array mode: string[] to emit that header before rows.
         * @returns {string} CSV text (always terminated with `newline`).
         */
        function stringify(data, options) {
            options = options || {};
            const delimiter = options.delimiter || ',';
            const quote = options.quote || '"';
            const newline = options.newline || '\r\n';

            if (!data || data.length === 0) return '';

            const firstIsObject = !Array.isArray(data[0])
                && typeof data[0] === 'object'
                && data[0] !== null
                && !(data[0] instanceof Date);

            let keys = null;
            let rows;

            if (firstIsObject) {
                keys = Array.isArray(options.header) ? options.header : Object.keys(data[0]);
                rows = new Array(data.length);
                for (let i = 0; i < data.length; i++) {
                    const r = data[i];
                    const arr = new Array(keys.length);
                    for (let j = 0; j < keys.length; j++) arr[j] = r[keys[j]];
                    rows[i] = arr;
                }
            } else {
                rows = data;
                if (Array.isArray(options.header)) keys = options.header;
            }

            const mustQuote = (s) => (
                s.indexOf(delimiter) >= 0 ||
                s.indexOf(quote) >= 0 ||
                s.indexOf('\n') >= 0 ||
                s.indexOf('\r') >= 0
            );
            const qStr = quote;
            const qEsc = quote + quote;
            const escape = (s) => {
                if (mustQuote(s)) return qStr + s.split(qStr).join(qEsc) + qStr;
                return s;
            };

            const lines = [];
            const emitHeader = keys && options.header !== false;
            if (emitHeader) {
                const head = new Array(keys.length);
                for (let j = 0; j < keys.length; j++) head[j] = escape(String(keys[j]));
                lines.push(head.join(delimiter));
            }

            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const out = new Array(r.length);
                for (let j = 0; j < r.length; j++) out[j] = escape(formatValue(r[j]));
                lines.push(out.join(delimiter));
            }

            return lines.join(newline) + newline;
        }

        return { parse, stringify };
    }
};
