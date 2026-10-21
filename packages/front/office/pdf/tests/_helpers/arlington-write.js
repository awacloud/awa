// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Writer conformance against the Arlington PDF Model
 * (`_fixtures/arlington/vendor/tsv/`, the `tsv/latest` files: ISO
 * 32000-2:2020 with its errata).
 *
 * A written document is walked from its trailer, each key's value
 * following the Arlington `Link` of the type it has, and every key a
 * visited dictionary or stream holds is checked against its model row:
 * the object lists it, its `SinceVersion` holds for PDF 2.0, its value has
 * one of the key's types valid in 2.0 and, when the possible values of
 * that type are literals, one of them. Every required key the object does
 * not hold is a failing case too. The `fn:` predicates are evaluated only
 * where they state versions; the others are not evaluated (counted, never
 * guessed).
 *
 * One module for both users: the package test
 * (`tests/arlington-write-conformance.integration.test.js`) and the
 * `arlington-write-conformance` suites of `tools/office-scorecard`, which
 * also measure oconv's md → pdf output with it. Never shipped (the package
 * `files` exclude `tests/`).
 *
 * @module pdf/tests/_helpers/arlington-write
 */

import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../../src/main.js';
import { alternatives, keyExclusion, splitTop } from './arlington.js';

/** The version the writers emit (`%PDF-2.0`) and every predicate is evaluated for. */
export const PDF_VERSION = 2.0;

/** Index of the bracket closing the one opened at `open`, or -1. */
function closeOf(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        if (s[i] === '(' || s[i] === '[') depth++;
        else if (s[i] === ')' || s[i] === ']') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** Split `s` at a two-character operator (`||`, `&&`) outside brackets. */
function splitOp(s, op) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        if (depth === 0 && s.startsWith(op, i)) {
            out.push(cur);
            cur = '';
            i += op.length - 1;
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
}

const or3 = (vs) => (vs.some((v) => v === true) ? true : vs.every((v) => v === false) ? false : null);
const and3 = (vs) => (vs.some((v) => v === false) ? false : vs.every((v) => v === true) ? true : null);

/** `fn:Name(args)` spanning the whole of `s`, or null. */
function call(s) {
    const m = /^fn:(\w+)\(/.exec(s);
    if (!m || closeOf(s, m[0].length - 1) !== s.length - 1) return null;
    return { name: m[1], args: splitTop(s.slice(m[0].length, -1), ',').map((a) => a.trim()) };
}

/**
 * An Arlington predicate (a `Required` or `SinceVersion` cell) evaluated
 * for a PDF 2.0 file: `true`, `false`, or `null` when it is not evaluated.
 * Evaluated: version numbers, `TRUE` / `FALSE`, `||`, `&&`, parentheses,
 * `fn:Eval`, `fn:IsRequired`, `fn:SinceVersion`, `fn:BeforeVersion`,
 * `fn:IsPDFVersion`, `fn:Deprecated` (its value: deprecation is not
 * checked) and `fn:Extension` (false: not ISO 32000-2). Anything else
 * (presence, value comparisons, array lengths …) gives `null`.
 * @param {string} expr
 * @returns {boolean|null}
 */
export function evaluate(expr) {
    let s = expr.trim();
    while (s.startsWith('(') && closeOf(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
    if (s === '') return null;
    const ors = splitOp(s, '||');
    if (ors.length > 1) return or3(ors.map(evaluate));
    const ands = splitOp(s, '&&');
    if (ands.length > 1) return and3(ands.map(evaluate));
    if (s === 'TRUE' || s === 'true') return true;
    if (s === 'FALSE' || s === 'false') return false;
    if (/^\d+\.\d+$/.test(s)) return Number(s) <= PDF_VERSION;
    const c = call(s);
    if (c === null) return null;
    const version = Number(c.args[0]);
    const rest = () => (c.args.length > 1 ? evaluate(c.args.slice(1).join(',')) : true);
    switch (c.name) {
        case 'Eval':
        case 'IsRequired':
            return c.args.length === 1 ? evaluate(c.args[0]) : null;
        case 'SinceVersion': return and3([version <= PDF_VERSION, rest()]);
        case 'BeforeVersion': return and3([PDF_VERSION < version, rest()]);
        case 'IsPDFVersion': return and3([version === PDF_VERSION, rest()]);
        case 'Deprecated': return c.args.length > 1 ? evaluate(c.args[1]) : true;
        case 'Extension': return false;
        default: return null;
    }
}

/**
 * One item of a `Type`, `PossibleValues` or `Link` list: its literal
 * (null for a predicate such as `fn:Eval(@Size>0)`) and whether it is
 * valid in 2.0 (`true`, `false`, or `null` when a condition on it is not
 * evaluated).
 * @param {string} token
 * @returns {{ value: string|null, valid: boolean|null }}
 */
export function listItem(token) {
    const t = token.trim();
    if (!t.startsWith('fn:')) return { value: t === '' || /[\s@()&|<>=!]/.test(t) ? null : t, valid: true };
    const c = call(t);
    if (c === null || c.args.length < 2) return { value: null, valid: null };
    const inner = listItem(c.args[c.args.length - 1]);
    const version = Number(c.args[0]);
    switch (c.name) {
        case 'SinceVersion': return { value: inner.value, valid: and3([version <= PDF_VERSION, inner.valid]) };
        case 'BeforeVersion': return { value: inner.value, valid: and3([PDF_VERSION < version, inner.valid]) };
        case 'IsPDFVersion': return { value: inner.value, valid: and3([version === PDF_VERSION, inner.valid]) };
        case 'Deprecated': return inner;
        case 'Extension': return { value: inner.value, valid: false };
        // a value required under a condition is still a possible value
        case 'RequiredValue': return inner;
        default: return { value: null, valid: null };
    }
}

const dictOf = (v) => (v && v.type === 'stream' ? v.dict : v);
const isDictLike = (v) => v && (v.type === 'dict' || v.type === 'stream');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const textOf = (bytes) => new TextDecoder('latin1').decode(bytes);
const isNumber = (v) => v && (v.type === 'int' || v.type === 'real');
const DATE = /^D:\d{4}(\d{2}(\d{2}(\d{2}(\d{2}(\d{2}([+\-Z](\d{2}('\d{2}'?)?)?)?)?)?)?)?)?$/;

/** The model's name of a parser value's type. */
export function typeName(v) {
    switch (v.type) {
        case 'int': return 'integer';
        case 'real': return 'number';
        case 'bool': return 'boolean';
        case 'dict': return 'dictionary';
        default: return v.type;
    }
}

/**
 * Whether a (resolved) parser value has the Arlington type `type`.
 * `resolve` dereferences the items of a rectangle or matrix.
 */
export function typeMatches(type, v, resolve) {
    const items = () => (v.type === 'array' ? v.items.map((x) => (x && x.type === 'ref' ? resolve(x) : x)) : []);
    switch (type) {
        case 'array': return v.type === 'array';
        case 'bitmask':
        case 'integer': return v.type === 'int';
        case 'boolean': return v.type === 'bool';
        case 'date': return v.type === 'string' && DATE.test(textOf(v.value));
        case 'dictionary':
        case 'name-tree':
        case 'number-tree': return v.type === 'dict';
        case 'name': return v.type === 'name';
        case 'null': return v.type === 'null';
        case 'number': return isNumber(v);
        case 'rectangle': return v.type === 'array' && v.items.length === 4 && items().every(isNumber);
        case 'matrix': return v.type === 'array' && v.items.length === 6 && items().every(isNumber);
        case 'stream': return v.type === 'stream';
        case 'string':
        case 'string-byte':
        case 'string-text': return v.type === 'string';
        case 'string-ascii': return v.type === 'string' && v.value.every((b) => b < 0x80);
        default: return false;
    }
}

/** Whether a parser value equals a possible-value literal of the model. */
export function literalEquals(v, lit) {
    switch (v.type) {
        case 'name': return v.value === lit;
        case 'int':
        case 'real': return /^-?\d*\.?\d+$/.test(lit) && Number(lit) === v.value;
        case 'bool': return lit === String(v.value);
        case 'string': return textOf(v.value) === lit;
        default: return false;
    }
}

/** The row of a dictionary key, or of the object's `*` row, or null. */
function rowFor(obj, key) {
    return obj.rows.find((r) => r.Key === key) || obj.rows.find((r) => r.Key === '*') || null;
}

/** The row typing position `i` of an array object (`n`, a repeated `n*` group, or `*`). */
function arrayRow(obj, i) {
    const exact = obj.rows.find((r) => r.Key === String(i));
    if (exact) return exact;
    const group = obj.rows.filter((r) => /^\d+\*$/.test(r.Key));
    if (group.length > 0) {
        const base = Number(group[0].Key.slice(0, -1));
        if (i >= base) return group[(i - base) % group.length];
    }
    return obj.rows.find((r) => r.Key === '*') || null;
}

/**
 * The type alternatives of a row with their possible values and links:
 * `{ type, valid, values, links }` per alternative of the `Type` cell.
 */
function typeAlternatives(row) {
    const types = splitTop(row.Type, ';').map(listItem);
    const values = alternatives(row.PossibleValues);
    const links = alternatives(row.Link);
    return types.map((t, i) => ({
        type: t.value,
        valid: t.valid,
        values: (values.length === types.length ? values[i] : []).map(listItem),
        links: (links.length === types.length ? links[i] : []).map(listItem)
    }));
}

/** The alternative of `row` a value has (preferring one valid in 2.0), or null. */
function matchAlternative(row, v, resolve) {
    const alts = typeAlternatives(row).filter((a) => a.type !== null && typeMatches(a.type, v, resolve));
    return alts.find((a) => a.valid === true) || alts.find((a) => a.valid === null) || alts[0] || null;
}

/**
 * The possible-value verdict of a value for one alternative: `'ok'`,
 * `'none'` (no literal list), `'unevaluated'` (the list holds a predicate
 * and no literal matched), or the failing reason.
 */
function valueVerdict(alt, v) {
    if (alt.values.length === 0) return 'none';
    const hit = alt.values.find((x) => x.value !== null && literalEquals(v, x.value));
    if (hit) return hit.valid === false ? `value ${shown(v)} is not valid in PDF 2.0` : 'ok';
    if (alt.values.some((x) => x.value === null)) return 'unevaluated';
    return `value ${shown(v)} is not among ${alt.values.map((x) => x.value).join(', ')}`;
}

function shown(v) {
    switch (v.type) {
        case 'name': return `/${v.value}`;
        case 'string': return `(${textOf(v.value).slice(0, 24)})`;
        default: return String(v.value);
    }
}

/**
 * Pick the Arlington object a value links to among `candidates`: those
 * whose required keys with literal possible values the value holds with
 * one of them come first, then the most present keys known minus required
 * keys absent and unknown keys, then the first.
 */
export function chooseLink(model, candidates, v, resolve) {
    const named = candidates.filter((n) => model.has(n));
    if (named.length <= 1 || !isDictLike(v)) return named[0] || null;
    const entries = dictOf(v).entries;
    let best = null;
    for (const name of named) {
        const obj = model.get(name);
        let fits = true;
        let score = 0;
        for (const row of obj.rows) {
            if (keyExclusion(row) !== null) continue;
            const present = has(entries, row.Key);
            if (present) score++;
            if (evaluate(row.Required) !== true) continue;
            if (!present) {
                score--;
                const lits = typeAlternatives(row).flatMap((a) => a.values).filter((x) => x.value !== null);
                if (lits.length > 0) fits = false;
                continue;
            }
            const value = deref(entries[row.Key], resolve);
            const alt = matchAlternative(row, value, resolve);
            if (alt === null) fits = false;
            else if (!['ok', 'none', 'unevaluated'].includes(valueVerdict(alt, value))) fits = false;
        }
        for (const k of Object.keys(entries)) if (rowFor(obj, k) === null) score--;
        if (best === null || (fits && !best.fits) || (fits === best.fits && score > best.score)) best = { name, fits, score };
    }
    return best.name;
}

function deref(v, resolve) {
    if (!v || v.type !== 'ref') return v;
    try {
        return resolve(v) || { type: 'null' };
    } catch {
        // an unresolvable reference is the null object (ISO 32000-2 7.3.10)
        return { type: 'null' };
    }
}

/**
 * The parameter dictionary a `/DecodeParms` (`/FDecodeParms`) entry is
 * for, named after the stream's single `/Filter` (`/FFilter`): every
 * filter-parameter object of the model shares its keys with another one,
 * so only the filter tells `FilterFlateDecode` from `FilterLZWDecode`.
 */
function filterParams(entries, key, resolve) {
    if (key !== 'DecodeParms' && key !== 'FDecodeParms') return null;
    const f = deref(entries[key === 'DecodeParms' ? 'Filter' : 'FFilter'], resolve);
    return f && f.type === 'name' ? `Filter${f.value}` : null;
}

/** Whether `key` is present on the dictionary or, `Inheritable`, on one of its `/Parent` ancestors. */
function presentOrInherited(dict, key, inheritable, resolve) {
    let d = dict;
    for (let depth = 0; d && depth < 32; depth++) {
        if (has(d.entries, key)) return true;
        if (!inheritable || !d.entries.Parent) return false;
        d = dictOf(deref(d.entries.Parent, resolve));
        if (!isDictLike(d)) return false;
    }
    return false;
}

/**
 * Check one written document against the model.
 * @param {Map<string, object>} model `loadModel(dir)`
 * @param {{ id: string, bytes: Uint8Array }} doc
 * @param {{ read: (bytes: Uint8Array) => object }} pdf the package's `pdf` API
 * @returns {{
 *   cases: { case: string, ok: boolean, detail?: string }[],
 *   skipped: { case: string, reason: string }[],
 *   unevaluated: string[], objects: string[]
 * }}
 */
export function checkDocument(model, doc, pdf) {
    const read = pdf.read(doc.bytes);
    const resolve = read._raw.resolve;
    const cases = [];
    const skipped = [];
    const unevaluated = [];
    const objects = [];
    const visited = new Set();
    const queue = [];
    const sections = read.xref.sections;
    const newest = sections.length > 0 ? sections[0].kind : 'table';
    queue.push({ value: read.trailer.raw, name: newest === 'stream' ? 'XRefStream' : 'FileTrailer', where: 'trailer' });

    /**
     * Queue the object a value links to, through `row`'s alternative for
     * it; `prefer` names the candidate the context designates.
     */
    function follow(row, raw, where, prefer = null) {
        const v = deref(raw, resolve);
        const alt = matchAlternative(row, v, resolve);
        if (alt === null || alt.type === 'name-tree' || alt.type === 'number-tree') return;
        const links = alt.links.filter((l) => l.value !== null && l.valid !== false).map((l) => l.value);
        const name = prefer !== null && links.includes(prefer) && model.has(prefer) ? prefer : chooseLink(model, links, v, resolve);
        if (name === null) return;
        queue.push({ value: raw, name, where: raw && raw.type === 'ref' ? `${raw.num} ${raw.gen} R` : where });
    }

    while (queue.length > 0) {
        const { value, name, where } = queue.shift();
        if (value && value.type === 'ref') {
            const key = `${value.num} ${value.gen}`;
            if (visited.has(key)) continue;
            visited.add(key);
        }
        const v = deref(value, resolve);
        const obj = model.get(name);
        if (obj.kind === 'array') {
            if (v.type === 'array') {
                v.items.forEach((item, i) => {
                    const row = arrayRow(obj, i);
                    if (row) follow(row, item, `${where}[${i}]`);
                });
            }
            continue;
        }
        if (!isDictLike(v)) continue;
        const entries = dictOf(v).entries;
        if (obj.kind === 'map') {
            for (const k of Object.keys(entries)) follow(obj.rows[0], entries[k], `${where}/${k}`);
            continue;
        }
        objects.push(`${doc.id} ${where} ${name}`);
        for (const k of Object.keys(entries)) {
            const label = `${doc.id} ${where} ${name}/${k}`;
            const row = rowFor(obj, k);
            if (row === null) {
                cases.push({ case: label, ok: false, detail: `not a key of ${name}` });
                continue;
            }
            const since = evaluate(row.SinceVersion);
            if (since === false) {
                cases.push({ case: label, ok: false, detail: `not ISO 32000-2 for PDF 2.0 (SinceVersion ${row.SinceVersion})` });
                continue;
            }
            const val = deref(entries[k], resolve);
            const alt = matchAlternative(row, val, resolve);
            if (alt === null) {
                cases.push({ case: label, ok: false, detail: `a ${typeName(val)}, the model types it ${row.Type}` });
                continue;
            }
            if (alt.valid === false) {
                cases.push({ case: label, ok: false, detail: `a ${alt.type}, a type not valid in PDF 2.0 (${row.Type})` });
                continue;
            }
            const verdict = valueVerdict(alt, val);
            if (verdict !== 'ok' && verdict !== 'none' && verdict !== 'unevaluated') {
                cases.push({ case: label, ok: false, detail: verdict });
                continue;
            }
            if (since === null || alt.valid === null || verdict === 'unevaluated') unevaluated.push(label);
            cases.push({ case: label, ok: true });
            follow(row, entries[k], `${where}/${k}`, filterParams(entries, k, resolve));
        }
        for (const row of obj.rows) {
            if (keyExclusion(row) !== null || has(entries, row.Key)) continue;
            const required = evaluate(row.Required);
            if (required === false) continue;
            const label = `${doc.id} ${where} ${name}/${row.Key}`;
            if (presentOrInherited(dictOf(v), row.Key, row.Inheritable.trim() === 'TRUE', resolve)) continue;
            if (required === null) skipped.push({ case: label, reason: `absent; required by a predicate not evaluated (${row.Required})` });
            else cases.push({ case: label, ok: false, detail: 'required, absent' });
        }
    }
    return { cases, skipped, unevaluated, objects };
}

/** Check several documents; the outcomes of each are prefixed by its id. */
export function checkDocuments(model, docs, pdf) {
    const out = { cases: [], skipped: [], unevaluated: [], objects: [] };
    for (const d of docs) {
        const r = checkDocument(model, d, pdf);
        out.cases.push(...r.cases);
        out.skipped.push(...r.skipped);
        out.unevaluated.push(...r.unevaluated);
        out.objects.push(...r.objects);
    }
    return out;
}

/** The pdf package runtime, its writers and the fonts parser included. */
export function pdfRuntime() {
    const rt = new ModuleRuntime();
    for (const m of [...fw_require, ...pkg_require, ...modules]) rt.register(m);
    return rt;
}

/**
 * Liberation Sans Regular, reused by path from oconv-fonts (SIL OFL 1.1;
 * provenance: `oconv-fonts/vendor/liberation/`).
 */
export const LIBERATION_SANS = new URL('../../../oconv-fonts/vendor/liberation/LiberationSans-Regular.ttf', import.meta.url);

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const codePoints = (s) => [...new Set([...s].map((c) => c.codePointAt(0)))];

/**
 * The documents the pdf package's writers emit for this measure, each
 * `{ id, writer, bytes }`: `pdfBuilder` from scratch, and `pdf.write` of
 * what `pdf.read` gives back for two of them. Reproducible: fixed `/ID`,
 * no clock.
 */
export function pdfDocuments(rt = pdfRuntime()) {
    const pdf = rt.resolve('pdf');
    const { builder } = rt.resolve('pdfBuilder');
    const embed = rt.resolve('pdfFontEmbed');
    const face = rt.resolve('fonts').read(new Uint8Array(readFileSync(LIBERATION_SANS)));
    const id = '000102030405060708090a0b0c0d0e0f';

    const blank = builder().addPage().build();

    const standard14 = builder()
        .addPage({ mediaBox: [0, 0, 595, 842], cropBox: [10, 10, 585, 832], rotate: 90 })
        .addFont({ name: 'F1', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding' })
        .addFont({ name: 'F2', baseFont: 'Times-Roman' })
        .addContent('BT /F1 12 Tf 72 700 Td (Page one) Tj /F2 10 Tf 0 -14 Td (Times) Tj ET')
        .addPage()
        .addFont({ name: 'F1', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding' })
        .addContent('BT /F1 12 Tf 72 700 Td (Page two) Tj ET')
        .addMetadata({
            Title: 'Writer conformance', Author: 'awa', Subject: 'Arlington', Keywords: 'pdf, 2.0',
            Creator: 'pdfBuilder', Producer: '@awacloud/pdf',
            CreationDate: 'D:20261014120000Z', ModDate: 'D:20261014120000Z'
        })
        .setId(id)
        .build();

    // Standard 14 faces with the opt-in metrics, a symbolic face among them
    const lookup14 = rt.resolve('standard14Lookup');
    const standard14Metrics = builder()
        .addPage()
        .addFont({ name: 'F1', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding', standard14: lookup14 })
        .addFont({ name: 'F2', baseFont: 'Times-Roman', encoding: 'WinAnsiEncoding', standard14: lookup14 })
        .addFont({ name: 'F3', baseFont: 'Symbol', standard14: lookup14 })
        .addContent('BT /F1 12 Tf 72 700 Td (Metrics) Tj /F2 10 Tf 0 -14 Td (Times) Tj /F3 10 Tf 0 -14 Td (abg) Tj ET')
        .setId(id)
        .build();

    const simpleText = 'Hello, world';
    const cidText = 'Привет, мир';
    const simple = embed.embedSimple(face, codePoints(simpleText));
    const cid = embed.embedCid(face, codePoints(cidText));
    const embedded = builder()
        .addPage()
        .addFont({ name: 'F1', embedded: simple })
        .addFont({ name: 'F2', embedded: cid })
        .addContent(`BT /F1 12 Tf 72 700 Td <${hex(simple.encode(simpleText))}> Tj /F2 12 Tf 0 -16 Td <${hex(cid.encode(cidText))}> Tj ET`)
        .setId(id)
        .build();

    const image = builder()
        .addPage()
        .addImage({
            name: 'Im0', width: 2, height: 2, colorSpace: 'DeviceRGB', bitsPerComponent: 8,
            data: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]),
            sMask: { width: 2, height: 2, colorSpace: 'DeviceGray', bitsPerComponent: 8, data: new Uint8Array([255, 128, 64, 0]) }
        })
        .addContent('q 100 0 0 100 72 600 cm /Im0 Do Q')
        .setId(id)
        .build();

    return [
        { id: 'builder-blank', writer: 'pdfBuilder', bytes: blank },
        { id: 'builder-standard-14', writer: 'pdfBuilder', bytes: standard14 },
        { id: 'builder-standard-14-metrics', writer: 'pdfBuilder', bytes: standard14Metrics },
        { id: 'builder-embedded', writer: 'pdfBuilder', bytes: embedded },
        { id: 'builder-image', writer: 'pdfBuilder', bytes: image },
        { id: 'write-standard-14', writer: 'pdf.write', bytes: pdf.write(pdf.read(standard14)) },
        { id: 'write-embedded', writer: 'pdf.write', bytes: pdf.write(pdf.read(embedded)) }
    ];
}
