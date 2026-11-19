// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfMerge` — copy pages from several PDF documents into a
 * new one.
 *
 * `merge(sources, opts?)` → `Uint8Array`, the chosen pages in order.
 *
 * - A source is a `Uint8Array` (all its pages) or `{ bytes, pages }`
 *   (0-based page indices, in the order wanted; a page given twice is
 *   copied twice). `opts.version` (`'x.y'`) defaults to the highest
 *   source version.
 * - **A page** is copied with its dictionary and every object it
 *   reaches, renumbered; an object several copied pages of one source
 *   share is written once. The inheritable attributes the page lacks
 *   (`Resources`, `MediaBox`, `CropBox`, `Rotate`, ISO 32000 §7.7.3.4) are
 *   taken from its nearest ancestor that has them. A stream keeps its raw
 *   bytes and filters, its `/Length` made direct.
 * - **Not carried**: the sources' catalogs (outlines, structure trees,
 *   AcroForm, names) and Info dictionaries. So a page drops
 *   `/StructParents` and its `Widget` annotations (form fields need the
 *   AcroForm), and an annotation drops `/StructParent`. A reference to a
 *   source page that is not copied, to a `Pages` node or to the catalog
 *   becomes null in an array and is removed from a dictionary; a
 *   reference to a copied page points to its copy.
 *
 * `sources` not a non-empty array, or a source of another shape, throws
 * `ContractError` `pdf/merge/bad-sources`; a page index that is not the
 * source's, `pdf/merge/bad-page`; an encrypted source (one the empty
 * password opens), `pdf/merge/encrypted-source`, since its pages would be
 * written unencrypted. A source that does not read (an encrypted one that
 * needs a password, a malformed one) throws `readDocument`'s error.
 *
 * Strict factory body, worker-safe.
 *
 * @module pdf/document/merge
 */

import { pdfErrors } from '../errors.js';
import { pdfDocument } from './document.js';
import { pdfPages } from './pages.js';
import { pdfWriter } from './writer.js';

export const pdfMerge = {
    name: 'pdfMerge',
    dependencies: ['pdfErrors', 'pdfDocument', 'pdfPages', 'pdfWriter'],
    deps: [pdfErrors, pdfDocument, pdfPages, pdfWriter],
    factory(errors, documentMod, pagesMod, writerMod) {
        const { ContractError } = errors;
        const INHERITED = ['Resources', 'MediaBox', 'CropBox', 'Rotate'];
        const DROP_ON_PAGE = new Set(['Parent', 'StructParents', 'B']);
        const key = (r) => `${r.num}:${r.gen | 0}`;

        function checkSources(sources) {
            const bad = () => { throw new ContractError('pdf/merge/bad-sources', 'merge expects a non-empty array of Uint8Array or { bytes, pages }'); };
            if (!Array.isArray(sources) || sources.length === 0) bad();
            return sources.map((s) => {
                if (s instanceof Uint8Array) return { bytes: s, pages: null };
                if (!s || typeof s !== 'object' || !(s.bytes instanceof Uint8Array)) bad();
                if (s.pages !== undefined && !Array.isArray(s.pages)) bad();
                return { bytes: s.bytes, pages: s.pages === undefined ? null : s.pages };
            });
        }

        const versionValue = (v) => { const [a, b] = String(v).split('.').map(Number); return a * 10 + (b || 0); };

        /**
         * Copy pages from several documents into a new one (module header).
         *
         * @param {Array<Uint8Array|{bytes: Uint8Array, pages?: number[]}>} sources
         * @param {{version?: string}} [opts]
         * @returns {Uint8Array}
         * @throws {ContractError} `pdf/merge/bad-sources`, `pdf/merge/bad-page`.
         */
        function merge(sources, opts) {
            const list = checkSources(sources);
            const o = opts || {};
            const indirects = [];
            let next = 3;
            const pageRefs = [];
            let version = o.version || null;

            for (const src of list) {
                const doc = documentMod.readDocument(src.bytes);
                // An encrypted source (one the empty password opens) would
                // land in an unencrypted output: refused by name.
                if (doc.trailer && doc.trailer.encrypt) {
                    throw new ContractError('pdf/merge/encrypted-source',
                        'merge does not take an encrypted source: its pages would be written unencrypted');
                }
                const resolve = doc.resolve;
                if (!o.version && (!version || versionValue(doc.version) > versionValue(version))) version = doc.version;
                const refs = pagesMod.walkPageTree(doc.catalog.pages, resolve);
                const chosen = src.pages === null ? refs.map((_, i) => i) : src.pages;
                for (const i of chosen) {
                    if (!Number.isInteger(i) || i < 0 || i >= refs.length)
                        throw new ContractError('pdf/merge/bad-page', `no page ${i} in a source of ${refs.length}`, { context: { index: i, pages: refs.length } });
                }
                // The objects that are no copy's to reach: the catalog, the Pages nodes, the pages not chosen.
                const pageKeys = new Set(refs.map(key));
                const blocked = new Set();
                if (doc.trailer && doc.trailer.root) blocked.add(key(doc.trailer.root));
                for (const r of refs) {
                    let p = resolve({ type: 'ref', num: r.num, gen: r.gen });
                    const seen = new Set();
                    while (p && p.type === 'dict' && p.entries.Parent && p.entries.Parent.type === 'ref' && !seen.has(key(p.entries.Parent))) {
                        seen.add(key(p.entries.Parent));
                        blocked.add(key(p.entries.Parent));
                        p = resolve(p.entries.Parent);
                    }
                }
                const copied = new Map(); // source key → new num
                const pageCopies = new Map(); // source page key → new num of its (first) copy
                const writtenPages = new Set();
                const chosenKeys = new Set(chosen.map((i) => key(refs[i])));

                const copyRef = (r) => {
                    const k = key(r);
                    if (pageKeys.has(k)) return chosenKeys.has(k) ? pageCopies.get(k) || reservePage(k) : null;
                    if (blocked.has(k)) return null;
                    if (copied.has(k)) return copied.get(k);
                    const num = next++;
                    copied.set(k, num);
                    indirects.push({ num, gen: 0, value: null });
                    const slot = indirects[indirects.length - 1];
                    slot.value = copyValue(resolve(r));
                    return num;
                };
                // A copied page is reserved before its dictionary is copied, so that references to it resolve.
                const reservePage = (k) => {
                    const num = next++;
                    pageCopies.set(k, num);
                    return num;
                };

                function copyValue(v, inArray) {
                    if (!v || typeof v !== 'object') return v;
                    switch (v.type) {
                        case 'ref': {
                            const num = copyRef(v);
                            return num === null ? (inArray ? { type: 'null' } : undefined) : { type: 'ref', num, gen: 0 };
                        }
                        case 'array':
                            return { ...v, items: v.items.map((x) => copyValue(x, true)) };
                        case 'dict':
                            return { ...v, entries: copyEntries(v.entries) };
                        case 'stream': {
                            const entries = copyEntries(v.dict.entries);
                            entries.Length = { type: 'int', value: v.raw.length };
                            return { ...v, dict: { ...v.dict, entries }, raw: v.raw };
                        }
                        default:
                            return v;
                    }
                }
                function copyEntries(entries, skip) {
                    const out = {};
                    for (const [k, x] of Object.entries(entries)) {
                        if (skip && skip.has(k)) continue;
                        if (k === 'StructParent') continue;
                        const c = copyValue(x, false);
                        if (c !== undefined) out[k] = c;
                    }
                    return out;
                }
                const isWidget = (a) => {
                    const d = resolve(a);
                    return !!(d && d.type === 'dict' && d.entries.Subtype && d.entries.Subtype.value === 'Widget');
                };

                for (const i of chosen) {
                    const r = refs[i];
                    const k = key(r);
                    const dict = resolve({ type: 'ref', num: r.num, gen: r.gen });
                    const entries = { ...dict.entries };
                    // The inheritable attributes from the nearest ancestor that has them.
                    for (const name of INHERITED) {
                        if (entries[name] !== undefined) continue;
                        let p = dict;
                        const seen = new Set();
                        while (p && p.entries && p.entries.Parent && p.entries.Parent.type === 'ref' && !seen.has(key(p.entries.Parent))) {
                            seen.add(key(p.entries.Parent));
                            p = resolve(p.entries.Parent);
                            if (p && p.type === 'dict' && p.entries[name] !== undefined) { entries[name] = p.entries[name]; break; }
                        }
                    }
                    if (entries.Annots) {
                        const annots = resolve(entries.Annots);
                        const kept = annots && annots.type === 'array' ? annots.items.filter((a) => !isWidget(a)) : [];
                        if (kept.length) entries.Annots = { type: 'array', items: kept };
                        else delete entries.Annots;
                    }
                    // The first copy of a page takes its reserved number (references point to it); a page given
                    // again is copied again under a new one.
                    let num;
                    if (!pageCopies.has(k)) num = reservePage(k);
                    else if (!writtenPages.has(k)) num = pageCopies.get(k);
                    else num = next++;
                    writtenPages.add(k);
                    const value = { type: 'dict', entries: { ...copyEntries(entries, DROP_ON_PAGE), Parent: { type: 'ref', num: 2, gen: 0 } } };
                    indirects.push({ num, gen: 0, value });
                    pageRefs.push(num);
                }
            }

            indirects.push({ num: 1, gen: 0, value: { type: 'dict', entries: { Type: { type: 'name', value: 'Catalog' }, Pages: { type: 'ref', num: 2, gen: 0 } } } });
            indirects.push({ num: 2, gen: 0, value: { type: 'dict', entries: {
                Type: { type: 'name', value: 'Pages' },
                Kids: { type: 'array', items: pageRefs.map((num) => ({ type: 'ref', num, gen: 0 })) },
                Count: { type: 'int', value: pageRefs.length }
            } } });
            const written = writerMod.writeDocument({ indirects, root: { num: 1, gen: 0 }, version: version || '2.0' });
            return written instanceof Uint8Array ? written : written.bytes;
        }

        return { merge };
    }
};
