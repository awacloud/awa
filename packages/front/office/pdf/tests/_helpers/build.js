// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test helpers — minimal PDF builder used by every
 * integration + sibling test that needs a real byte stream.
 *
 * `buildSyntax` produces small standalone bytes for syntax-only tests.
 * `buildDocument` assembles a complete PDF 2.0 with a configurable
 * page set.
 *
 * `bootstrapPdf()` materialises a fully-wired `pdf` instance via
 * `ModuleRuntime` from `src/main.js` 4-arrays — used by tests that
 * previously did `pdf.factory(_pdfErrors_TD1)` (now invalid because
 * `pdf.js` is strict factory-only with 13 declared deps).
 *
 * @module pdf/tests/_helpers/build
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '../../src/main.js';

const te = new TextEncoder();

let _rtSingleton  = null;
let _pdfDeps      = null;

/**
 * Build (lazily, then cache) a `ModuleRuntime` populated with the four
 * arrays of `src/main.js` (`fw_require + modules + extras + bundle`).
 */
export function getRuntime() {
    if (_rtSingleton) return _rtSingleton;
    const rt = new ModuleRuntime();
    for (const m of fw_require)  rt.register(m);
    for (const m of pkg_require) rt.register(m);
    for (const m of modules)     rt.register(m);
    for (const m of extras)      rt.register(m);
    for (const m of bundle)      rt.register(m);
    _rtSingleton = rt;
    return rt;
}

/**
 * Return a **fresh** `pdf` api instance — each call materialises a new
 * one by re-invoking `pdf.factory(...deps)` with deps cached from the
 * runtime. Use this for tests that mutate the api via `.use(...)` and
 * need isolation from other tests.
 *
 * The mainline production pattern is `runtime.resolve('pdf')` which
 * caches the api inside the runtime.
 */
export function bootstrapPdf() {
    if (!_pdfDeps) {
        const rt   = getRuntime();
        const desc = [...modules, ...bundle, ...extras].find(m => m && m.name === 'pdf');
        _pdfDeps = { desc, deps: desc.dependencies.map(name => rt.resolve(name)) };
    }
    return _pdfDeps.desc.factory(..._pdfDeps.deps);
}

/**
 * Concatenate `(string | Uint8Array)[]` into a single `Uint8Array`.
 */
export function concat(parts) {
    let n = 0;
    const arr = parts.map(p => p instanceof Uint8Array ? p : te.encode(p));
    for (const a of arr) n += a.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const a of arr) { out.set(a, o); o += a.length; }
    return out;
}

/**
 * Build a classical xref entry line (20 bytes exactly).
 */
export function xrefEntry(offset, gen, free) {
    const off = String(offset).padStart(10, '0');
    const g   = String(gen).padStart(5, '0');
    return `${off} ${g} ${free ? 'f' : 'n'} \n`;
}

/**
 * Build a minimal PDF 2.0 document with one page per `pageContents`
 * entry. Each entry is the raw bytes of a content stream (default:
 * empty).
 *
 * Returns the full bytes, ready to be fed to `pdf.read()`.
 *
 * The shape is:
 *
 *   1 0 obj  Catalog          /Type /Catalog /Pages 2 0 R
 *   2 0 obj  Pages root       /Type /Pages /Kids [3 0 R ...] /Count N
 *   3..(2+N) obj  Page        /Type /Page /Parent 2 0 R /MediaBox ... /Contents (3+N+i) 0 R
 *   (3+N) .. obj  Contents    raw stream
 *
 * @param {object} [opts]
 * @param {string[]} [opts.pages] — content stream payloads per page.
 * @param {[number,number,number,number]} [opts.mediaBox=[0,0,612,792]]
 * @param {string} [opts.version='2.0']
 * @returns {Uint8Array}
 */
export function buildDocument(opts) {
    opts = opts || {};
    const pages = opts.pages || [''];
    const N = pages.length;
    const box = opts.mediaBox || [0, 0, 612, 792];
    const ver = opts.version || '2.0';

    const pageObjStart = 3;
    const contentObjStart = pageObjStart + N;
    const totalObjs = 2 + 2 * N;

    const parts = [];
    const offsets = [];

    // Header — version + 4-byte binary marker comment per §7.5.2
    parts.push(`%PDF-${ver}\n`);
    parts.push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

    function bytesSoFar() {
        let n = 0;
        for (const p of parts) n += p instanceof Uint8Array ? p.length : te.encode(p).length;
        return n;
    }

    // 1 0 obj Catalog
    offsets[1] = bytesSoFar();
    parts.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 2 0 obj Pages root
    offsets[2] = bytesSoFar();
    const kids = Array.from({ length: N }, (_, i) => `${pageObjStart + i} 0 R`).join(' ');
    parts.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${N} >>\nendobj\n`);

    // Page leaves
    for (let i = 0; i < N; i++) {
        const num = pageObjStart + i;
        const cNum = contentObjStart + i;
        offsets[num] = bytesSoFar();
        parts.push(
            `${num} 0 obj\n` +
            `<< /Type /Page /Parent 2 0 R ` +
                `/MediaBox [${box.join(' ')}] /Contents ${cNum} 0 R >>\n` +
            `endobj\n`);
    }

    // Content streams
    for (let i = 0; i < N; i++) {
        const num = contentObjStart + i;
        const data = pages[i];
        offsets[num] = bytesSoFar();
        parts.push(
            `${num} 0 obj\n` +
            `<< /Length ${data.length} >>\nstream\n` +
            data +
            `\nendstream\nendobj\n`);
    }

    // xref
    const xrefOff = bytesSoFar();
    let xref = `xref\n0 ${totalObjs + 1}\n`;
    xref += xrefEntry(0, 65535, true);
    for (let i = 1; i <= totalObjs; i++) {
        xref += xrefEntry(offsets[i], 0, false);
    }
    parts.push(xref);

    // trailer
    parts.push(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\n`);
    parts.push(`startxref\n${xrefOff}\n%%EOF\n`);

    return concat(parts);
}

/**
 * Convenience for syntax-only tests : wrap a single object in a tiny
 * stand-alone PDF.
 */
export function buildSyntax(objSrc, opts) {
    return buildDocument({ pages: [objSrc], ...opts });
}
