// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Read-model key coverage against the Arlington PDF Model
 * (`_fixtures/arlington/tsv/`, the `tsv/latest` files of the PDF
 * Association's model: ISO 32000-2:2020 with its errata).
 *
 * For each Arlington dictionary or stream object, a dictionary is built
 * holding every key the model lists (a value of each key's first type),
 * the package's typer functions bound to that object are run on it, and a
 * key counts as handled when a bound typer returns and either leaves the
 * key out of the record's `_extras` or — for a typer with no `_extras`
 * channel — gives a different record once the key is removed.
 *
 * One module for both users: the package test
 * (`tests/arlington-read-keys.integration.test.js`) and the
 * `arlington-read-keys` suite of `tools/office-scorecard`, so the two
 * cannot drift. Never shipped (the package `files` exclude `tests/`).
 *
 * @module pdf/tests/_helpers/arlington
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '../../src/main.js';

/** The Arlington columns, in file order. */
export const COLUMNS = Object.freeze([
    'Key', 'Type', 'SinceVersion', 'DeprecatedIn', 'Required', 'IndirectReference',
    'Inheritable', 'DefaultValue', 'PossibleValues', 'SpecialCase', 'Link', 'Note'
]);

/**
 * Split `s` on `sep` where it is not nested in brackets or parentheses.
 * @param {string} s
 * @param {string} sep one character
 * @returns {string[]}
 */
export function splitTop(s, sep) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        if (ch === sep && depth === 0) {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

/**
 * The plain value inside Arlington predicate wrappers: `fn:SinceVersion(2.0,array)`
 * gives `array`; a bare literal is returned as is; anything else gives null.
 * @param {string} token
 * @returns {string|null}
 */
export function unwrap(token) {
    let t = token.trim();
    while (t.startsWith('fn:')) {
        const open = t.indexOf('(');
        if (open < 0 || !t.endsWith(')')) return null;
        const args = splitTop(t.slice(open + 1, -1), ',');
        t = args[args.length - 1].trim();
    }
    if (t === '' || /[\s@()&|<>=!]/.test(t)) return null;
    return t;
}

/** The `[a,b];[c]` alternatives of a column, as lists of raw items. */
export function alternatives(col) {
    if (!col) return [];
    return splitTop(col, ';').map((alt) => {
        const a = alt.trim();
        const body = a.startsWith('[') && a.endsWith(']') ? a.slice(1, -1) : a;
        return body === '' ? [] : splitTop(body, ',').map((x) => x.trim());
    });
}

/**
 * Parse one Arlington TSV file.
 * @param {string} name object name (file name without `.tsv`)
 * @param {string} text
 * @returns {{ name: string, kind: 'dict'|'array', rows: Record<string,string>[] }}
 */
export function parseTsv(name, text) {
    const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
    const header = lines[0].split('\t');
    if (header.join('|') !== COLUMNS.join('|')) {
        throw new Error(`${name}.tsv: unexpected header ${header.join(',')}`);
    }
    const rows = lines.slice(1).map((l) => {
        const cells = l.split('\t');
        /** @type {Record<string,string>} */
        const row = {};
        COLUMNS.forEach((c, i) => { row[c] = cells[i] === undefined ? '' : cells[i]; });
        return row;
    });
    const kind = rows.length > 0 && rows.every((r) => /^\d+\*?$/.test(r.Key)) ? 'array'
        : rows.length > 0 && rows.every((r) => r.Key === '*') ? 'wildcard'
            : rows.some((r) => /^\d+\*?$/.test(r.Key)) && rows.every((r) => /^(\d+\*?|\*)$/.test(r.Key)) ? 'array'
                : 'dict';
    return { name, kind, rows };
}

/**
 * Every `*.tsv` of `dir`, parsed, by object name. An object whose only
 * entry is `*` is a map (`kind: 'map'`) or an array, as the rows linking
 * to it type it (`dictionary` or `array`).
 * @param {string} dir
 * @returns {Map<string, { name: string, kind: 'dict'|'array'|'map', rows: Record<string,string>[] }>}
 */
export function loadModel(dir) {
    if (!existsSync(dir)) throw new Error(`Arlington TSV directory not found: ${dir}`);
    const model = new Map();
    for (const f of readdirSync(dir).sort()) {
        if (!f.endsWith('.tsv')) continue;
        const name = f.slice(0, -4);
        model.set(name, parseTsv(name, readFileSync(join(dir, f), 'utf8')));
    }
    const linkedAs = new Map();
    for (const obj of model.values()) {
        for (const row of obj.rows) {
            const types = splitTop(row.Type, ';').map((x) => unwrap(x));
            alternatives(row.Link).forEach((links, i) => {
                for (const l of links) {
                    const target = unwrap(l);
                    if (target === null || !types[i]) continue;
                    if (!linkedAs.has(target)) linkedAs.set(target, new Set());
                    linkedAs.get(target).add(types[i]);
                }
            });
        }
    }
    for (const obj of model.values()) {
        if (obj.kind !== 'wildcard') continue;
        const as = linkedAs.get(obj.name) || new Set();
        if (as.has('array') && !as.has('dictionary')) obj.kind = 'array';
        else if (as.has('dictionary') && !as.has('array')) obj.kind = 'map';
        // linked only as a name / number tree value: the model's naming says
        else if (/^ArrayOf|Array$/.test(obj.name)) obj.kind = 'array';
        else obj.kind = 'map';
    }
    return model;
}

/**
 * A stream object: it lists the stream dictionary keys of ISO 32000-2
 * Table 5 (`Length`, `Filter`, `DecodeParms`). `Length` and `Filter`
 * alone also name the key length and handler of an encryption dictionary.
 */
export function isStreamObject(obj) {
    const keys = new Set(obj.rows.map((r) => r.Key));
    return keys.has('Length') && keys.has('Filter') && keys.has('DecodeParms');
}

/** Why a key of a dictionary object is not measured, or null when it is. */
export function keyExclusion(row) {
    if (row.Key === '*' || /^\d+\*?$/.test(row.Key)) return 'a wildcard or positional entry, not a named key';
    if (row.SinceVersion.trim().startsWith('fn:Extension(')) {
        return `an extension (${row.SinceVersion.trim()}), not ISO 32000-2`;
    }
    return null;
}

const enc = (s) => new TextEncoder().encode(s);
const ints = (...v) => ({ type: 'array', items: v.map((n) => ({ type: 'int', value: n })) });

/**
 * Values the generic builder cannot derive from the model, where the
 * Arlington row is looser than the ISO 32000-2 text it models. Each one
 * states the clause; the key is still measured, with this value.
 */
export const OVERRIDES = Object.freeze({
    'Signature/ByteRange': {
        why: 'ISO 32000-2 12.8.1 Table 255: pairs of (offset, length) — the model types it as any non-negative integers',
        value: () => ints(0, 10, 20, 10)
    },
    'PageObject/Rotate': {
        why: 'ISO 32000-2 Table 31: a multiple of 90 — the model states it as a predicate the builder does not evaluate',
        value: () => ({ type: 'int', value: 90 })
    },
    'ObjectStream/First': {
        why: 'ISO 32000-2 7.5.7: the byte offset of the first object, after the N integer pairs — the generic integer 1 cannot hold them',
        value: () => ({ type: 'int', value: 4 })
    },
    'Encoding/Differences': {
        why: 'the model types it as an array of codes and names with no required position: one code and one name (ISO 32000-2 9.6.5.1)',
        value: () => ({ type: 'array', items: [{ type: 'int', value: 32 }, { type: 'name', value: 'space' }] })
    },
    'PageTreeNode/Kids': {
        why: 'the page-tree walker types the pages under a node: with no kid there is no page to inherit from it',
        value: () => ({ type: 'array', items: [{ type: 'ref', num: 2, gen: 0 }] })
    },
    'PageTreeNodeRoot/Kids': {
        why: 'the page-tree walker types the pages under a node: with no kid there is no page to inherit from it',
        value: () => ({ type: 'array', items: [{ type: 'ref', num: 2, gen: 0 }] })
    }
});

/**
 * Value builder: a parser-shaped value for a key, from its first
 * Arlington type. `ctx.nextRef` numbers the indirect references.
 */
export function createBuilder(model) {
    let refNum = 100;
    const nextRef = () => ({ type: 'ref', num: refNum++, gen: 0 });

    /**
     * The first literal of a column's alternative, preferring one valid in
     * PDF 2.0 (not under `fn:Deprecated`, `fn:Extension`, `fn:IsPDFVersion`
     * or `fn:BeforeVersion`), else the first literal at all.
     */
    function firstLiteral(row, col, alt, avoid = null) {
        const alts = alternatives(row[col]);
        const list = alts[alt] || alts[0] || [];
        const outdated = /fn:(Deprecated|Extension|IsPDFVersion|BeforeVersion)\(/;
        for (const item of list) {
            const v = unwrap(item);
            if (v !== null && v !== avoid && !outdated.test(item)) return v;
        }
        for (const item of list) {
            const v = unwrap(item);
            if (v !== null && v !== avoid) return v;
        }
        return null;
    }

    function firstType(row) {
        const t = splitTop(row.Type, ';').map((x) => unwrap(x));
        return t.find((x) => x !== null) || 'null';
    }

    function linkOf(row, alt) {
        const v = firstLiteral(row, 'Link', alt);
        return v !== null && model.has(v) ? v : null;
    }

    function isIndirect(row, type) {
        if (type === 'stream') return true;
        const alts = splitTop(row.IndirectReference, ';').map((x) => x.trim().replace(/^\[|\]$/g, ''));
        const first = alts[0] || '';
        return first === 'TRUE' || first.startsWith('fn:MustBeIndirect');
    }

    function scalar(type, literal, dflt) {
        // a generic value never equals the key's default: a typer that
        // applies the default when the key is absent would not tell them apart
        const generic = dflt === '1' ? 2 : 1;
        switch (type) {
            case 'name': return { type: 'name', value: literal !== null ? literal : 'X' };
            case 'integer':
            case 'bitmask': {
                const n = literal !== null && /^-?\d+$/.test(literal) ? Number(literal) : generic;
                return { type: 'int', value: n };
            }
            case 'number': {
                const n = literal !== null && /^-?\d*\.?\d+$/.test(literal) ? Number(literal) : generic;
                return Number.isInteger(n) ? { type: 'int', value: n } : { type: 'real', value: n };
            }
            case 'boolean': return { type: 'bool', value: literal !== null ? literal === 'true' : dflt !== 'true' };
            case 'date': return { type: 'string', value: enc('D:20260101000000Z'), syntax: 'lit' };
            case 'string':
            case 'string-text':
            case 'string-ascii':
            case 'string-byte':
                return { type: 'string', value: enc(literal !== null ? literal : 'x'), syntax: 'lit' };
            case 'rectangle':
                return { type: 'array', items: [0, 0, 100, 100].map((v) => ({ type: 'int', value: v })) };
            case 'matrix':
                return { type: 'array', items: [1, 0, 0, 1, 0, 0].map((v) => ({ type: 'int', value: v })) };
            case 'name-tree': return { type: 'dict', entries: { Names: { type: 'array', items: [] } } };
            case 'number-tree': return { type: 'dict', entries: { Nums: { type: 'array', items: [] } } };
            default: return { type: 'null' };
        }
    }

    /**
     * The required entries of a linked object, `depth` levels down; a map
     * (an object whose only key is `*`, e.g. a font resource map) gets one
     * entry `K1`, so the map is not empty.
     */
    function requiredEntries(name, depth) {
        const obj = model.get(name);
        const entries = {};
        if (!obj || obj.kind === 'array' || depth <= 0) return entries;
        if (obj.kind === 'map') {
            entries.K1 = valueFor(obj.rows[0], depth - 1);
            return entries;
        }
        for (const row of obj.rows) {
            if (keyExclusion(row) !== null || row.Required.trim() !== 'TRUE') continue;
            entries[row.Key] = valueFor(row, depth - 1);
        }
        return entries;
    }

    /**
     * The required positions of a linked array (a repeated `0*`…`n*` group
     * once). A bare `*` entry (any number of items) gives one item when it
     * is a scalar or an indirect reference — an empty array is often what
     * a typer assumes for an absent key — and none when it is a direct
     * array or dictionary, whose shape the model leaves to the owner.
     */
    function arrayItems(name, depth) {
        const obj = model.get(name);
        if (!obj || obj.kind !== 'array' || depth <= 0) return [];
        const items = [];
        for (const row of obj.rows) {
            if (row.Key === '*') {
                const type = firstType(row);
                if (isIndirect(row, type) || (type !== 'array' && type !== 'dictionary')) items.push(valueFor(row, depth - 1));
                continue;
            }
            if (row.Required.trim() !== 'TRUE') continue;
            items.push(valueFor(row, depth - 1));
        }
        return items;
    }

    /**
     * The value of one key: its first type; a possible literal that is not
     * the key's default (preferring one valid in 2.0), else a generic value
     * of the type that is not the default either, else the default; a
     * linked object's required entries.
     */
    function valueFor(row, depth) {
        const types = splitTop(row.Type, ';').map((x) => unwrap(x));
        const alt = Math.max(0, types.findIndex((x) => x !== null));
        const type = firstType(row);
        if (isIndirect(row, type)) return nextRef();
        const dflt = firstLiteral(row, 'DefaultValue', alt);
        const literal = firstLiteral(row, 'PossibleValues', alt, dflt) ?? firstLiteral(row, 'PossibleValues', alt);
        const link = linkOf(row, alt);
        if (type === 'dictionary') return { type: 'dict', entries: link ? requiredEntries(link, depth) : {} };
        if (type === 'array') return { type: 'array', items: link ? arrayItems(link, depth) : [] };
        return scalar(type, literal, dflt);
    }

    /**
     * The object's own value: every included key (D23 a), each with a value
     * of its first type; a stream object as a stream with that dictionary.
     */
    function objectValue(name) {
        const obj = model.get(name);
        const entries = {};
        for (const row of obj.rows) {
            if (keyExclusion(row) !== null) continue;
            const o = OVERRIDES[`${name}/${row.Key}`];
            entries[row.Key] = o ? o.value() : valueFor(row, 2);
        }
        const isStream = isStreamObject(obj);
        const dict = { type: 'dict', entries };
        return isStream ? { type: 'stream', dict, raw: new Uint8Array(0) } : dict;
    }

    return { objectValue, valueFor, nextRef };
}

/** The package runtime with every typer module (core and extras) registered. */
export function createTypers() {
    const rt = new ModuleRuntime();
    for (const m of fw_require) rt.register(m);
    for (const m of modules) rt.register(m);
    for (const m of extras) rt.register(m);
    const get = (name) => rt.resolve(name);
    const annotTypers = {
        Text: get('pdfTextAnnot').typeTextAnnot,
        Link: get('pdfLinkAnnot').typeLinkAnnot,
        FreeText: get('pdfFreeTextAnnot').typeFreeTextAnnot,
        Shape: get('pdfShapeAnnot').typeShapeAnnot,
        Markup: get('pdfMarkupAnnot').typeMarkupAnnot,
        Stamp: get('pdfStampAnnot').typeStampAnnot,
        Ink: get('pdfInkAnnot').typeInkAnnot,
        Popup: get('pdfPopupAnnot').typePopupAnnot,
        FileAttachment: get('pdfFileAttachAnnot').typeFileAttachAnnot,
        Widget: get('pdfWidgetAnnot').typeWidgetAnnot,
        Redact: get('pdfRedactAnnot').typeRedactAnnot,
        Projection: get('pdfProjectionAnnot').typeProjectionAnnot
    };
    const goTo = get('pdfActionGoTo');
    const actionTypers = {
        GoTo: goTo.typeGoTo,
        GoToR: goTo.typeGoToR,
        GoToE: goTo.typeGoToE,
        URI: get('pdfActionUri').typeUri,
        Named: get('pdfActionNamed').typeNamed,
        Launch: get('pdfActionLaunch').typeLaunch
    };
    return { get, annotTypers, actionTypers };
}

const dictOf = (v) => (v.type === 'stream' ? v.dict : v);
const withDict = (v, dict) => (v.type === 'stream' ? { type: 'stream', dict, raw: v.raw } : dict);

/**
 * A binding: `module.function`, optionally with a call shape. `call(fn, value, t)`
 * returns the record to inspect; the default calls `fn(value)`.
 */
const b = (typer, call) => ({ typer, call: call || ((fn, v) => fn(v)) });
const annot = b('pdfAnnot.typeAnnot', (fn, v, t) => fn(v, t.annotTypers));
const action = b('pdfAction.typeAction', (fn, v, t) => fn(v, t.actionTypers));
const extAction = b('pdfFormActionsExtended.typeExtendedAction');
const font = b('pdfFont.typeFont');
const resolverToEmpty = () => ({ type: 'dict', entries: {} });
const colorSpace = (family) => b('pdfColorSpacesExtended.typeColorSpace',
    (fn, v) => fn({ type: 'array', items: [{ type: 'name', value: family }, v] }));
const requirement = b('pdfMisc.typeRequirements', (fn, v) => fn({ type: 'array', items: [v] })[0]);

/** A parser value as the plain object `typeEncryptDict` reads (the package's own `_plainOf` in `sig/sign.js`). */
function plainOf(node) {
    if (!node || typeof node !== 'object') return node;
    switch (node.type) {
        case 'int': case 'real': case 'bool': case 'string': return node.value;
        case 'dict': return Object.fromEntries(Object.keys(node.entries).map((k) => [k, plainOf(node.entries[k])]));
        case 'array': return node.items.map(plainOf);
        default: return node;
    }
}
const encryptDict = b('pdfSecurity.typeEncryptDict', (fn, v) => fn(plainOf(v)));

/**
 * A page-tree node: walked as the tree's root (its kid ref 2 resolves to
 * a page), its `/Count` read, and its inheritable `/Resources` resolved
 * for a page whose `/Parent` is the node.
 */
const aPage = { type: 'dict', entries: { Type: { type: 'name', value: 'Page' }, Parent: { type: 'ref', num: 1, gen: 0 } } };
const nodeResolver = (v) => (r) => (r.num === 1 ? v : aPage);
const pageTreeNode = [
    b('pdfPages.walkPageTree', (fn, v) => fn({ type: 'ref', num: 1, gen: 0 }, nodeResolver(v))),
    b('pdfPages.readPageCount'),
    b('pdfResources.resolvePageResources', (fn, v) => fn(aPage, nodeResolver(v)))
];

const sigRef = b('pdfSigPades.typeReferenceArray', (fn, v) => fn({ type: 'array', items: [v] })[0]);

/**
 * `parseObjectStream(decoded, dict)` on the stream's dictionary, with
 * decoded data holding `/N` objects (`null`) after an offset table that
 * ends at `/First`.
 */
function objStmRecords(fn, v) {
    const e = v.dict.entries;
    const n = e.N && e.N.type === 'int' ? e.N.value : 0;
    const first = e.First && e.First.type === 'int' ? e.First.value : 0;
    const header = Array.from({ length: n }, (_, i) => `${i + 1} ${i * 5}`).join(' ');
    return fn(enc(header.padEnd(first, ' ') + 'null '.repeat(n)), v.dict);
}

/**
 * `parseCrossRefStream(decoded, dict)` on the stream's dictionary, with
 * decoded data of one zero record per entry the dictionary declares
 * (`/W` widths, `/Index` pairs or `[0 /Size]`), as many as it reads.
 */
function xrefRecords(fn, v) {
    const e = v.dict.entries;
    const num = (x) => (x && (x.type === 'int' || x.type === 'real') ? x.value : 0);
    const w = e.W && e.W.type === 'array' ? e.W.items.reduce((s, x) => s + num(x), 0) : 0;
    const idx = e.Index && e.Index.type === 'array' ? e.Index.items.map(num) : [0, num(e.Size)];
    let count = 0;
    for (let i = 1; i < idx.length; i += 2) count += idx[i];
    return fn(new Uint8Array(Math.max(0, w * count)), v.dict);
}

/**
 * Arlington object → the package typers bound to it (hand table). An
 * object absent from this table has no typer: every included key of it
 * counts as not handled.
 */
export const BINDINGS = Object.freeze({
    // Document structure
    Catalog: [b('pdfCatalog.typeCatalog')],
    PageObject: [b('pdfPage.typePage')],
    PageTreeNode: pageTreeNode,
    PageTreeNodeRoot: pageTreeNode,
    FileTrailer: [b('pdfTrailer.typeTrailer')],
    XRefStream: [b('pdfTrailer.typeTrailer', (fn, v) => fn(v.dict)), b('pdfCrossRefStream.parseCrossRefStream', xrefRecords)],
    DocInfo: [b('pdfInfo.typeInfo')],
    LinearizationParameterDict: [b('pdfLinearization.typeLinearizationDict')],
    Resource: [b('pdfResources.typeResources', (fn, v) => fn(v, resolverToEmpty))],
    Metadata: [b('pdfXmp.typeXmpStream')],
    // Annotations
    AnnotText: [annot], AnnotLink: [annot], AnnotFreeText: [annot, b('pdfAnnotExtended.typeAnnotExtended')],
    AnnotLine: [annot], AnnotSquare: [annot], AnnotCircle: [annot], AnnotPolygon: [annot],
    AnnotPolyLine: [annot], AnnotHighlight: [annot], AnnotUnderline: [annot], AnnotSquiggly: [annot],
    AnnotStrikeOut: [annot], AnnotCaret: [annot], AnnotStamp: [annot], AnnotInk: [annot],
    AnnotPopup: [annot], AnnotFileAttachment: [annot], AnnotWidget: [annot], AnnotRedact: [annot],
    AnnotProjection: [annot],
    AnnotSound: [annot, b('pdfAnnotExtended.typeAnnotExtended'), b('pdfLegacyDeprecatedAnnots.typeSoundAnnot')],
    AnnotMovie: [annot, b('pdfAnnotExtended.typeAnnotExtended'), b('pdfLegacyDeprecatedAnnots.typeMovieAnnot')],
    AnnotScreen: [annot, b('pdfAnnotExtended.typeAnnotExtended'), b('pdfLegacyDeprecatedAnnots.typeScreenAnnot')],
    AnnotPrinterMark: [annot, b('pdfAnnotExtended.typeAnnotExtended')],
    AnnotTrapNetwork: [annot, b('pdfAnnotExtended.typeAnnotExtended')],
    AnnotWatermark: [annot, b('pdfAnnotExtended.typeAnnotExtended')],
    Annot3D: [annot, b('pdfAnnotExtended.typeAnnotExtended'), b('pdf3dRichMedia.type3DAnnot')],
    AnnotRichMedia: [annot, b('pdfAnnotExtended.typeAnnotExtended'), b('pdf3dRichMedia.typeRichMediaAnnot')],
    Appearance: [b('pdfAppearance.typeAppearanceStreams')],
    // Interactive forms
    InteractiveForm: [b('pdfAcroForm.typeAcroForm')],
    FieldTx: [b('pdfTextField.typeTextField')],
    FieldChoice: [b('pdfChoiceField.typeChoiceField')],
    FieldBtnCheckbox: [b('pdfButtonField.typeButtonField')],
    FieldBtnPush: [b('pdfButtonField.typeButtonField')],
    FieldBtnRadio: [b('pdfButtonField.typeButtonField')],
    FieldSig: [b('pdfSignatureField.typeSignatureField')],
    // Actions
    ActionGoTo: [action], ActionGoToR: [action], ActionGoToE: [action], ActionLaunch: [action],
    ActionURI: [action], ActionNamed: [action],
    ActionGoToDp: [action], ActionThread: [action], ActionSound: [action], ActionMovie: [action],
    ActionRichMediaExecute: [action],
    // the kinds the opt-in extended typer declares (EXTENDED_ACTION_SUBTYPES)
    ActionHide: [action, extAction], ActionSubmitForm: [action, extAction],
    ActionResetForm: [action, extAction], ActionImportData: [action, extAction],
    ActionSetOCGState: [action, extAction], ActionRendition: [action, extAction],
    ActionTransition: [action, extAction], ActionGoTo3DView: [action, extAction],
    ActionECMAScript: [action, extAction],
    // Logical structure
    StructTreeRoot: [b('pdfStructTree.typeStructTreeRoot')],
    StructElem: [b('pdfStructElement.typeStructElement')],
    StructureAttributesDict: [b('pdfTaggedPdfTyped.typeStructAttribute')],
    // Optional content
    OptContentGroup: [b('pdfOCG.typeOCG')],
    OptContentUsage: [b('pdfOCG.typeUsage')],
    OptContentConfig: [b('pdfOCConfig.typeOCConfig')],
    OptContentUsageApplication: [b('pdfOCConfig.typeUsageApp')],
    // Navigation
    OutlineItem: [b('pdfOutline.typeOutlineItem')],
    // Files and collections
    FileSpecification: [b('pdfFileSpec.typeFileSpec')],
    AFFileSpecification: [b('pdfFileSpec.typeFileSpec')],
    EmbeddedFileStream: [b('pdfEmbeddedFile.typeEmbeddedFile')],
    Collection: [b('pdfCollection.typeCollection'), b('pdfEmbeddedFilesPortfolio.typePortfolio')],
    CollectionSchema: [b('pdfEmbeddedFilesPortfolio.typeSchema')],
    CollectionField: [b('pdfEmbeddedFilesPortfolio.typeSchemaField', (fn, v) => fn('F', v))],
    CollectionSort: [b('pdfEmbeddedFilesPortfolio.typeSort')],
    CollectionItem: [b('pdfEmbeddedFilesPortfolio.typeCollectionItem')],
    Navigator: [b('pdfEmbeddedFilesPortfolio.typeNavigator')],
    // Output intents
    OutputIntents: [b('pdfOutputIntent.typeOutputIntent'), b('pdfXPrepress.typePdfXOutputIntent')],
    // Fonts
    FontType0: [font], FontType1: [font], FontMultipleMaster: [font], FontTrueType: [font],
    FontType3: [font, b('pdfType3.typeType3')],
    FontCIDType0: [font, b('pdfFontCidTyped.typeCIDFont')],
    FontCIDType2: [font, b('pdfFontCidTyped.typeCIDFont')],
    CIDSystemInfo: [b('pdfFontCidTyped.typeCIDSystemInfo')],
    FontFile3OpenType: [b('pdfFontColorTagging.typeFontFile3OpenType')],
    // XObjects
    XObjectImage: [b('pdfImages.typeImageXObject')],
    XObjectImageMask: [b('pdfImages.typeImageXObject')],
    XObjectImageSoftMask: [b('pdfImages.typeImageXObject')],
    XObjectFormType1: [b('pdfImages.typeFormXObject')],
    XObjectFormPrinterMark: [b('pdfImages.typeFormXObject')],
    XObjectFormTrapNet: [b('pdfImages.typeFormXObject')],
    XObjectFormPS: [b('pdfImages.typeXObject')],
    XObjectFormPSpassthrough: [b('pdfImages.typeXObject')],
    ObjectStream: [b('pdfObjStream.parseObjectStream', objStmRecords)],
    Outline: [b('pdfOutline.walkOutline', (fn, v) => fn(v, () => ({ type: 'dict', entries: {
        Title: { type: 'string', value: enc('x'), syntax: 'lit' }, Parent: { type: 'ref', num: 1, gen: 0 } } })))],
    Encoding: [b('pdfFontEncoding.resolveEncoding', (fn, v) => fn(v, (n) => new Array(256).fill(n)))],
    SignatureReferenceDocMDP: [sigRef], SignatureReferenceFieldMDP: [sigRef],
    SignatureReferenceIdentity: [sigRef], SignatureReferenceUR: [sigRef],
    // Graphics
    GraphicsStateParameter: [b('pdfContentOpsExtended.typeExtGState')],
    ShadingType1: [b('pdfShadingTyped.typeShading')], ShadingType2: [b('pdfShadingTyped.typeShading')],
    ShadingType3: [b('pdfShadingTyped.typeShading')], ShadingType4: [b('pdfShadingTyped.typeShading')],
    ShadingType5: [b('pdfShadingTyped.typeShading')], ShadingType6: [b('pdfShadingTyped.typeShading')],
    ShadingType7: [b('pdfShadingTyped.typeShading')],
    FunctionType0: [b('pdfShadingTyped.typeFunction')], FunctionType2: [b('pdfShadingTyped.typeFunction')],
    FunctionType3: [b('pdfShadingTyped.typeFunction')], FunctionType4: [b('pdfShadingTyped.typeFunction')],
    GroupAttributes: [b('pdfTransparencyTyped.typeTransparencyGroup')],
    SoftMaskAlpha: [b('pdfTransparencyTyped.typeSoftMask')],
    SoftMaskLuminosity: [b('pdfTransparencyTyped.typeSoftMask')],
    CalGrayDict: [colorSpace('CalGray')],
    CalRGBDict: [colorSpace('CalRGB')],
    LabDict: [colorSpace('Lab')],
    // Encryption and signatures
    EncryptionStandard: [encryptDict, b('pdfSigAesGcm.typeEncryptForGcm')],
    EncryptionPublicKey: [encryptDict, b('pdfSigAesGcm.typeEncryptForGcm')],
    CryptFilter: [b('pdfSigAesGcm.typeCfEntry')],
    Signature: [b('pdfSignature.typeSignature')],
    DSS: [b('pdfSigPades.typeDSS')],
    DocMDPTransformParameters: [b('pdfMisc.typeDocMdpParams')],
    Permissions: [b('pdfMisc.typePerms')],
    LegalAttestation: [b('pdfMisc.typeLegal')],
    // Document parts, web capture, multimedia
    DPartRoot: [b('pdfDocumentParts.typeDPartRoot')],
    DPart: [b('pdfDocumentParts.typeDPart')],
    DPM: [b('pdfDocumentParts.typeDPM')],
    WebCaptureInfo: [b('pdfMisc.typeSpiderInfo')],
    SoundObject: [b('pdfLegacyDeprecatedAnnots.typeSoundStream')],
    RichMediaContent: [b('pdf3dRichMedia.typeRichMediaContent')],
    '3DActivation': [b('pdf3dRichMedia.type3DActivation')],
    // Requirements (each entry of the catalog's /Requirements array)
    ...Object.fromEntries([
        'Requirements3DMarkup', 'RequirementsAcroFormInteract', 'RequirementsAction',
        'RequirementsAttachment', 'RequirementsAttachmentEditing', 'RequirementsCollection',
        'RequirementsCollectionEditing', 'RequirementsDPartInteract', 'RequirementsDigSig',
        'RequirementsDigSigMDP', 'RequirementsDigSigValidation', 'RequirementsEnableJavaScripts',
        'RequirementsEncryption', 'RequirementsGeospatial2D', 'RequirementsGeospatial3D',
        'RequirementsMarkup', 'RequirementsMultimedia', 'RequirementsNavigation',
        'RequirementsOCAutoStates', 'RequirementsOCInteract', 'RequirementsPRC', 'RequirementsRichMedia',
        'RequirementsSTEP', 'RequirementsSeparationSimulation', 'RequirementsTransitions',
        'RequirementsU3D', 'RequirementsglTF'
    ].map((n) => [n, [requirement]]))
});

/**
 * A canonical text of a typer record, leaving out what merely carries the
 * input back (`raw`, the input value, its dictionary, its `entries`) and,
 * with `omitExtras`, every `_extras` (what a typer kept untyped).
 */
export function canonical(rec, input, omitExtras = false) {
    const skip = new Set([input, dictOf(input), dictOf(input).entries]);
    const seen = new Set();
    const walk = (v) => {
        if (v === null || v === undefined) return String(v);
        if (typeof v === 'function') return 'fn';
        if (typeof v !== 'object') return JSON.stringify(v);
        if (skip.has(v)) return 'input';
        if (seen.has(v)) return 'cycle';
        seen.add(v);
        let s;
        if (v instanceof Uint8Array) s = `bytes(${Array.from(v).join(',')})`;
        else if (v instanceof Map) s = `map{${[...v.entries()].map(([k, x]) => `${walk(k)}:${walk(x)}`).join(',')}}`;
        else if (v instanceof Set) s = `set[${[...v].map(walk).join(',')}]`;
        else if (Array.isArray(v)) s = `[${v.map(walk).join(',')}]`;
        else {
            s = `{${Object.keys(v).sort().filter((k) => k !== 'raw' && !(omitExtras && k === '_extras'))
                .map((k) => `${k}:${walk(v[k])}`).join(',')}}`;
        }
        seen.delete(v);
        return s;
    };
    return walk(rec);
}

function errorCode(e) {
    const code = e && /** @type {{code?: unknown}} */ (e).code;
    return typeof code === 'string' ? code : `untyped ${e && e.name ? e.name : 'error'}: ${String(e && e.message).slice(0, 120)}`;
}

/**
 * Run one binding on an object value. Returns, per key of the value's
 * dictionary, null when the binding handles it, else the reason. With
 * `surfaced`, every typer is judged by the with / without probe on its
 * record minus `_extras`: the key must reach the typed record.
 * @returns {Map<string, string|null>}
 */
export function runBinding(binding, value, t, surfaced = false) {
    const [mod, fnName] = binding.typer.split('.');
    const fn = t.get(mod)[fnName];
    if (typeof fn !== 'function') throw new Error(`no typer ${binding.typer}`);
    const keys = Object.keys(dictOf(value).entries);
    const out = new Map();
    let rec;
    try {
        rec = binding.call(fn, value, t);
    } catch (e) {
        const why = `${binding.typer} throws ${errorCode(e)}`;
        for (const k of keys) out.set(k, why);
        return out;
    }
    const extras = rec && typeof rec === 'object' && rec._extras && typeof rec._extras === 'object' ? rec._extras : null;
    if (extras !== null && !surfaced) {
        for (const k of keys) out.set(k, Object.prototype.hasOwnProperty.call(extras, k) ? 'in _extras' : null);
        return out;
    }
    // No `_extras` channel (or `surfaced`): the key is handled when
    // removing it, or replacing its value by `null`, changes what the typer
    // returns (a different record, or a throw where it returned).
    const full = canonical(rec, value, surfaced);
    const differs = (entries) => {
        const probe = withDict(value, { type: 'dict', entries });
        try {
            return canonical(binding.call(fn, probe, t), probe, surfaced) !== full;
        } catch {
            return true;
        }
    };
    for (const k of keys) {
        const without = { ...dictOf(value).entries };
        delete without[k];
        const nulled = { ...dictOf(value).entries, [k]: { type: 'null' } };
        const kept = extras !== null && Object.prototype.hasOwnProperty.call(extras, k);
        out.set(k, differs(without) || differs(nulled) ? null : kept ? 'in _extras' : 'no effect on the record');
    }
    return out;
}

/**
 * The whole measure over a model. `opts.surfaced` counts a key only when
 * it reaches a typed record (see `runBinding`); the default is the ruled
 * `_extras` test.
 * @returns {{
 *   cases: { case: string, ok: boolean, detail?: string }[],
 *   skipped: { case: string, reason: string }[],
 *   bound: string[], unbound: string[]
 * }}
 */
export function measure(model, bindings = BINDINGS, opts = {}) {
    const surfaced = opts.surfaced === true;
    const t = createTypers();
    const builder = createBuilder(model);
    const cases = [];
    const skipped = [];
    const bound = [];
    const unbound = [];
    for (const name of Object.keys(bindings)) {
        if (!model.has(name)) throw new Error(`binding for an object the model does not have: ${name}`);
        if (model.get(name).kind !== 'dict') throw new Error(`binding for a ${model.get(name).kind} object: ${name}`);
    }
    for (const [name, obj] of model) {
        if (obj.kind === 'array') {
            skipped.push({ case: name, reason: 'an array object: its entries are positions, typed inside their owner' });
            continue;
        }
        if (obj.kind === 'map') {
            skipped.push({ case: name, reason: 'a map: entries under arbitrary names, no named key' });
            continue;
        }
        const included = obj.rows.filter((r) => keyExclusion(r) === null);
        if (included.length === 0) {
            skipped.push({ case: name, reason: 'no ISO 32000-2 named key (only extensions or wildcard entries)' });
            continue;
        }
        for (const r of obj.rows) {
            const why = keyExclusion(r);
            if (why !== null) skipped.push({ case: `${name}/${r.Key}`, reason: why });
        }
        const list = bindings[name];
        if (!list) {
            unbound.push(name);
            for (const r of included) cases.push({ case: `${name}/${r.Key}`, ok: false, detail: 'no typer' });
            continue;
        }
        bound.push(name);
        const value = builder.objectValue(name);
        const results = list.map((bd) => runBinding(bd, value, t, surfaced));
        for (const r of included) {
            const reasons = results.map((m) => m.get(r.Key));
            if (reasons.some((x) => x === null)) cases.push({ case: `${name}/${r.Key}`, ok: true });
            else cases.push({ case: `${name}/${r.Key}`, ok: false, detail: reasons.join('; ') });
        }
    }
    return { cases, skipped, bound, unbound };
}
