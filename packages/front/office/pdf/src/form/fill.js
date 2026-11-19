// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfFormFill` — fill an AcroForm and save it, as an
 * incremental update (ISO 32000-2 §12.7, §7.5.6).
 *
 * `fill(bytes, values)` → `Uint8Array`: `bytes` followed by an update that
 * sets the fields `values` names. `values` maps a field's fully qualified
 * name (its ancestors' and its own `/T`, joined by `.`) to its value.
 *
 * - **Text** (`Tx`): a string. `/V` is written as a PDF text string (ASCII
 *   as is, else UTF-16BE). Each widget gets a generated `/AP /N` stream: a
 *   Form XObject the size of its `/Rect`, in a `/Tx BMC … EMC` block, with
 *   the `/DA` (the field's, inherited, else the AcroForm's) font, size and
 *   colour; one line, left-aligned, 2 points in, vertically centred. A
 *   size of 0 is auto: (height − 4) × 0.7, held to 4–12. The font is the
 *   AcroForm `/DR` resource the `/DA` names, else a Helvetica Type 1. The
 *   text is encoded in WinAnsi, a character outside it written `?`; a
 *   password field (`Ff` bit 14) shows `*` per character.
 * - **Check box** (`Btn`, neither radio nor push button): `true` or
 *   `false`. `/V` and each widget's `/AS` become its on-state (the
 *   widget's `/AP /N` key other than `/Off`) or `/Off`.
 * - **Radio** (`Btn`, `Ff` bit 16): an export-state name, or `null` for
 *   none. `/V` becomes it; each widget's `/AS` is it when the widget has
 *   that state, else `/Off`.
 * - **Choice** (`Ch`): a string, or an array of strings for a multi-select
 *   (`Ff` bit 22). With `/Opt` and not editable (`Ff` bit 19), each value
 *   must be one of its options (export or display value).
 * - The AcroForm gets `/NeedAppearances true` (its own object, or the
 *   catalog when it is direct there).
 *
 * The prior bytes are kept, so an earlier signature's byte range is
 * intact. Errors are `ContractError`s: `pdf/form/bad-values`,
 * `pdf/form/no-acroform`, `pdf/form/unknown-field`, `pdf/form/bad-value`,
 * `pdf/form/signature-field`, `pdf/form/encrypted`; a document that does
 * not read throws `readDocument`'s error.
 *
 * Strict factory body, worker-safe.
 *
 * @module pdf/form/fill
 */

import { pdfErrors } from '../errors.js';
import { pdfDocument } from '../document/document.js';
import { pdfFieldTree } from './fieldTree.js';
import { pdfIncrementalWriter } from '../document/incrementalWriter.js';

export const pdfFormFill = {
    name: 'pdfFormFill',
    dependencies: ['pdfErrors', 'pdfDocument', 'pdfFieldTree', 'pdfIncrementalWriter'],
    deps: [pdfErrors, pdfDocument, pdfFieldTree, pdfIncrementalWriter],
    factory(errors, documentMod, fieldTreeMod, incrementalMod) {
        const { ContractError } = errors;
        const te = new TextEncoder();
        const name = (value) => ({ type: 'name', value });
        const int = (value) => ({ type: 'int', value });
        const ref = (num) => ({ type: 'ref', num, gen: 0 });
        const isDict = (v) => !!(v && v.type === 'dict');
        const fail = (code, message, context) => { throw new ContractError(code, message, context ? { context } : undefined); };

        /** CP1252's 0x80–0x9F code points. */
        const CP1252 = new Map([[0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
            [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
            [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A],
            [0x203A, 0x9B], [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F]]);

        /** A PDF text string: ASCII as is, else UTF-16BE with its BOM. */
        function textString(s) {
            if (/^[\x20-\x7E]*$/.test(s)) return { type: 'string', value: te.encode(s), syntax: 'lit' };
            const out = [0xFE, 0xFF];
            for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out.push(c >> 8, c & 0xFF); }
            return { type: 'string', value: new Uint8Array(out), syntax: 'hex' };
        }

        /** `s` in WinAnsi, a literal string's escaped bytes; a character outside it as `?`. */
        function winAnsiLiteral(s) {
            const out = [];
            for (const ch of s) {
                const cp = ch.codePointAt(0);
                let b = cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF) ? cp : CP1252.get(cp);
                if (b === undefined) b = 0x3F;
                if (b === 0x28 || b === 0x29 || b === 0x5C) out.push(0x5C);
                out.push(b);
            }
            return out;
        }

        const num = (v) => (v && (v.type === 'int' || v.type === 'real') ? v.value : 0);

        /**
         * Fill the fields `values` names, saved as an incremental update (module header).
         *
         * @param {Uint8Array} bytes
         * @param {Object<string, string|boolean|string[]|null>} values
         * @returns {Uint8Array}
         */
        function fill(bytes, values) {
            if (!values || typeof values !== 'object' || Array.isArray(values))
                fail('pdf/form/bad-values', 'fill expects { fieldName: value }');
            // Strict: the fill is an incremental update, chained to the
            // base's own cross-reference section, never to a rebuilt view.
            const doc = documentMod.readDocument(bytes, { allowEncrypted: true, recoverXref: false });
            if (doc.trailer && doc.trailer.encrypt) fail('pdf/form/encrypted', 'fill does not update an encrypted document');
            const resolve = doc.resolve;
            const rootRef = doc.trailer.root;
            const catalog = resolve({ type: 'ref', num: rootRef.num, gen: rootRef.gen });
            const afNode = catalog.entries.AcroForm;
            const af = afNode ? resolve(afNode) : null;
            if (!isDict(af)) fail('pdf/form/no-acroform', 'the document has no AcroForm');
            const fieldsArr = resolve(af.entries.Fields);
            const roots = fieldsArr && fieldsArr.type === 'array' ? fieldsArr.items.filter((r) => r.type === 'ref').map((r) => ({ num: r.num, gen: r.gen })) : [];
            const nodes = fieldTreeMod.walkFieldTree(roots, resolve);

            // The terminal fields by fully qualified name.
            const byName = new Map();
            for (const n of nodes) {
                if (!n.terminal) continue;
                const parts = [...n.ancestors, n.node].map((d) => d.entries.T).filter((t) => t && t.type === 'string');
                const full = parts.map((t) => decode(t.value)).join('.');
                byName.set(full, n);
            }

            const updates = new Map(); // num → { num, gen, value }
            let next = doc.trailer.size;
            const current = (r) => (updates.has(r.num) ? updates.get(r.num).value : resolve({ type: 'ref', num: r.num, gen: r.gen }));
            const put = (r, value) => updates.set(r.num, { num: r.num, gen: r.gen | 0, value });
            const add = (value) => { const n = next++; updates.set(n, { num: n, gen: 0, value }); return n; };

            const dr = af.entries.DR ? resolve(af.entries.DR) : null;
            const drFonts = isDict(dr) && dr.entries.Font ? resolve(dr.entries.Font) : null;
            let helvetica = null;

            for (const [full, value] of Object.entries(values)) {
                const f = byName.get(full);
                if (!f) fail('pdf/form/unknown-field', `no field named ${full}`, { name: full });
                const inherited = (k) => fieldTreeMod.getInherited(f.node, f.ancestors, k);
                const ft = inherited('FT');
                const ff = num(inherited('Ff'));
                const fieldRef = f.ref;
                const widgets = f.node.entries.Subtype && f.node.entries.Subtype.value === 'Widget'
                    ? [fieldRef]
                    : ((f.node.entries.Kids && f.node.entries.Kids.items) || []).filter((k) => k.type === 'ref').map((k) => ({ num: k.num, gen: k.gen }));
                const setField = (entries) => put(fieldRef, { ...current(fieldRef), entries: { ...current(fieldRef).entries, ...entries } });
                const setWidget = (w, entries) => put(w, { ...current(w), entries: { ...current(w).entries, ...entries } });
                const stateOf = (w) => {
                    const ap = current(w).entries.AP && resolve(current(w).entries.AP);
                    const n = ap && isDict(ap) && ap.entries.N ? resolve(ap.entries.N) : null;
                    return isDict(n) ? Object.keys(n.entries).filter((k) => k !== 'Off') : [];
                };
                const kind = ft && ft.value;
                if (kind === 'Sig') fail('pdf/form/signature-field', `${full} is a signature field`, { name: full });
                if (kind === 'Tx') {
                    if (typeof value !== 'string') fail('pdf/form/bad-value', `${full} takes a string`, { name: full });
                    setField({ V: textString(value) });
                    const daNode = inherited('DA') || af.entries.DA;
                    const da = daNode && daNode.type === 'string' ? decode(daNode.value) : '/Helv 0 Tf 0 g';
                    const shown = (ff & (1 << 13)) ? '*'.repeat([...value].length) : value;
                    for (const w of widgets) {
                        const rect = resolve(current(w).entries.Rect);
                        const xs = rect && rect.type === 'array' ? rect.items.map(num) : [0, 0, 0, 0];
                        const width = Math.abs(xs[2] - xs[0]), height = Math.abs(xs[3] - xs[1]);
                        const m = /\/([^\s/]+)\s+([\d.]+)\s+Tf/.exec(da);
                        const fontName = m ? m[1] : 'Helv';
                        let size = m ? Number(m[2]) : 0;
                        if (!size) size = Math.min(12, Math.max(4, Math.round((height - 4) * 0.7 * 10) / 10));
                        const rest = m ? da.replace(m[0], '') : da;
                        let font = drFonts && isDict(drFonts) ? drFonts.entries[fontName] : undefined;
                        if (!font) {
                            if (helvetica === null) helvetica = add({ type: 'dict', entries: { Type: name('Font'), Subtype: name('Type1'), BaseFont: name('Helvetica'), Encoding: name('WinAnsiEncoding') } });
                            font = ref(helvetica);
                        }
                        const ty = Math.max(0, (height - size) / 2 + size * 0.22);
                        const fmt = (v) => String(Math.round(v * 1000) / 1000);
                        const content = [
                            ...te.encode(`/Tx BMC\nq\nBT\n${rest.trim() ? rest.trim() + '\n' : ''}/${fontName} ${fmt(size)} Tf\n2 ${fmt(ty)} Td\n(`),
                            ...winAnsiLiteral(shown),
                            ...te.encode(') Tj\nET\nQ\nEMC\n')
                        ];
                        const raw = new Uint8Array(content);
                        const ap = add({
                            type: 'stream',
                            dict: { type: 'dict', entries: {
                                Type: name('XObject'), Subtype: name('Form'),
                                BBox: { type: 'array', items: [int(0), int(0), { type: 'real', value: width }, { type: 'real', value: height }] },
                                Resources: { type: 'dict', entries: { Font: { type: 'dict', entries: { [fontName]: font } } } },
                                Length: int(raw.length)
                            } },
                            raw
                        });
                        setWidget(w, { AP: { type: 'dict', entries: { N: ref(ap) } } });
                    }
                } else if (kind === 'Btn') {
                    if (ff & (1 << 16)) fail('pdf/form/bad-value', `${full} is a push button`, { name: full });
                    if (ff & (1 << 15)) {
                        if (value !== null && typeof value !== 'string') fail('pdf/form/bad-value', `${full} takes a state name or null`, { name: full });
                        const states = new Set(widgets.flatMap(stateOf));
                        if (value !== null && !states.has(value)) fail('pdf/form/bad-value', `${full} has no state ${value}`, { name: full, value });
                        setField({ V: name(value === null ? 'Off' : value) });
                        for (const w of widgets) setWidget(w, { AS: name(value !== null && stateOf(w).includes(value) ? value : 'Off') });
                    } else {
                        if (typeof value !== 'boolean') fail('pdf/form/bad-value', `${full} takes true or false`, { name: full });
                        const on = widgets.map((w) => stateOf(w)[0] || 'Yes');
                        setField({ V: name(value ? on[0] : 'Off') });
                        widgets.forEach((w, k) => setWidget(w, { AS: name(value ? on[k] : 'Off') }));
                    }
                } else if (kind === 'Ch') {
                    const multi = !!(ff & (1 << 21));
                    const list = Array.isArray(value) ? value : [value];
                    if (!list.every((v) => typeof v === 'string') || (Array.isArray(value) && !multi) || list.length === 0)
                        fail('pdf/form/bad-value', `${full} takes ${multi ? 'a string or an array of strings' : 'a string'}`, { name: full });
                    const opt = f.node.entries.Opt ? resolve(f.node.entries.Opt) : null;
                    if (opt && opt.type === 'array' && !(ff & (1 << 18))) {
                        const allowed = new Set();
                        for (const o of opt.items) {
                            const it = resolve(o);
                            if (it && it.type === 'string') allowed.add(decode(it.value));
                            else if (it && it.type === 'array') for (const x of it.items) if (x.type === 'string') allowed.add(decode(x.value));
                        }
                        for (const v of list) if (!allowed.has(v)) fail('pdf/form/bad-value', `${full} has no option ${v}`, { name: full, value: v });
                    }
                    setField({ V: Array.isArray(value) ? { type: 'array', items: list.map(textString) } : textString(value) });
                } else {
                    fail('pdf/form/bad-value', `${full} has no fillable type`, { name: full });
                }
            }

            // NeedAppearances on the AcroForm (its object, or the catalog that holds it).
            if (afNode.type === 'ref') put(afNode, { ...current(afNode), entries: { ...current(afNode).entries, NeedAppearances: { type: 'bool', value: true } } });
            else put(rootRef, { ...catalog, entries: { ...catalog.entries, AcroForm: { ...af, entries: { ...af.entries, NeedAppearances: { type: 'bool', value: true } } } } });

            return incrementalMod.appendIncremental(bytes, { updates: [...updates.values()] });
        }

        /** A text string's bytes as text (UTF-16BE with a BOM, else Latin-1). */
        function decode(b) {
            if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) {
                let s = '';
                for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
                return s;
            }
            let s = '';
            for (const c of b) s += String.fromCharCode(c);
            return s;
        }

        return { fill };
    }
};
