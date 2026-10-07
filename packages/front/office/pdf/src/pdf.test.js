// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdf } from './pdf.js';
import { buildDocument, bootstrapPdf, getRuntime } from '../tests/_helpers/build.js';

const { ContractError } = getRuntime().resolve('pdfErrors');

describe('pdf module', () => {
    test('module shape', () => {
        expect(pdf.name).toBe('pdf');
        expect(pdf.dependencies).toEqual([
            'pdfErrors', 'pdfShared',
            'pdfTokenizer', 'pdfParserObj', 'pdfParser',
            'pdfXref', 'pdfTrailer', 'pdfSerializer',
            'pdfCatalog', 'pdfPages', 'pdfPage',
            'pdfDocument', 'pdfWriter'
        ]);
        expect(pdf.factory.toString()).toContain('function');
    });

    test('factory returns an api with read + header + use', () => {
        const api = bootstrapPdf();
        expect(typeof api.read).toBe('function');
        expect(typeof api.header).toBe('function');
        expect(typeof api.use).toBe('function');
    });
});

describe('pdf.read', () => {
    test('reads a fixture document', () => {
        const api = bootstrapPdf();
        const doc = api.read(buildDocument({ pages: ['a', 'b'] }));
        expect(doc.pages.length).toBe(2);
        expect(doc.version).toBe('2.0');
    });
});

describe('pdf.use — extension hook', () => {
    test('runs the register function and merges new methods', () => {
        const api = bootstrapPdf();
        api.use({
            name: 'demo',
            register(self) {
                return {
                    hello: () => 'world'
                };
            }
        });
        expect(api.hello()).toBe('world');
        expect(api.usedExtension('demo')).toBe(true);
    });

    test('is idempotent — second use is a no-op', () => {
        const api = bootstrapPdf();
        let calls = 0;
        const ext = {
            name: 'count',
            register() { calls++; return { tick: () => 1 }; }
        };
        api.use(ext);
        api.use(ext);
        api.use(ext);
        expect(calls).toBe(1);
        expect(api.tick()).toBe(1);
    });

    test('rejects malformed extension', () => {
        const api = bootstrapPdf();
        expect(() => api.use(null)).toThrow(ContractError);
        expect(() => api.use({ name: 'x' })).toThrow(ContractError);
        expect(() => api.use({ register: () => null })).toThrow(ContractError);
    });

    test('extension cannot override .use', () => {
        const api = bootstrapPdf();
        api.use({
            name: 'attack',
            register() { return { use: () => 'hijacked' }; }
        });
        // The original .use is preserved — calling it with bad input
        // still throws ContractError, proving the attack didn't replace
        // the method.
        expect(() => api.use('not-an-ext')).toThrow(ContractError);
    });
});

describe('pdf.write � opts (strict / onSkipped / skippedObjects)', () => {
    const { RenderError, ParseError } = getRuntime().resolve('pdfErrors');
    const { writeDocument, assembleIndirects } = getRuntime().resolve('pdfWriter');

    // Frozen copy of the pre-opts `write(model)` body (HEAD), pinned here so
    // byte-identity is asserted against the old behaviour, not a re-derivation.
    function headWrite(model) {
        if (model && model._raw && typeof model._raw.resolve === 'function') {
            return writeDocument({
                indirects: assembleIndirects(model),
                root: model.catalog.pages
                    ? { num: model.trailer.root.num, gen: model.trailer.root.gen }
                    : model.trailer.root,
                info: model.trailer.info,
                id:   model.trailer.id,
                version: '2.0'
            });
        }
        return writeDocument(model);
    }

    function freshDoc(api) {
        return api.read(buildDocument({ pages: ['a', 'b', 'c'] }));
    }

    // Wrap a real Document so `resolve` throws for the given object numbers
    // and evict them from the resolved cache, as a damaged file would.
    function breakObject(doc, failing) {
        const realResolve = doc._raw.resolve;
        const raw = {
            indirects: doc._raw.indirects,
            resolve(ref) {
                if (failing.has(ref.num)) throw failing.get(ref.num);
                return realResolve(ref);
            }
        };
        for (const n of failing.keys()) raw.indirects.delete(`${n}:0`);
        return { xref: doc.xref, trailer: doc.trailer, catalog: doc.catalog, _raw: raw };
    }

    function lastInUseNum(doc) {
        return Object.keys(doc.xref.entries)
            .filter((k) => !doc.xref.entries[k].free).map(Number).sort((x, y) => x - y).pop();
    }

    test('write(doc) without opts is byte-identical to HEAD, skippedObjects is [] and hidden', () => {
        const api = bootstrapPdf();
        const out = api.write(freshDoc(api));
        const head = headWrite(freshDoc(api));
        expect(out).toEqual(head);
        expect(Array.from(out)).toEqual(Array.from(head));
        expect(out.skippedObjects).toEqual([]);
        expect(Array.isArray(out.skippedObjects)).toBe(true);
        expect(Object.keys(out)).not.toContain('skippedObjects');
        expect(Object.getOwnPropertyDescriptor(out, 'skippedObjects').enumerable).toBe(false);
        expect(JSON.stringify(out)).toBe(JSON.stringify(head));
    });

    test('clean document: strict and onSkipped change nothing and onSkipped is not called', () => {
        const api = bootstrapPdf();
        let calls = 0;
        const out = api.write(freshDoc(api), { strict: true, onSkipped() { calls++; } });
        expect(Array.from(out)).toEqual(Array.from(headWrite(freshDoc(api))));
        expect(out.skippedObjects).toEqual([]);
        expect(calls).toBe(0);
    });

    test('lenient: skippedObjects lists the unresolvable entry and onSkipped fires exactly once', () => {
        const api = bootstrapPdf();
        const doc = freshDoc(api);
        const n = lastInUseNum(doc);
        const broken = breakObject(doc, new Map([[n, new ParseError('pdf/parser/bad-object', 'boom')]]));
        const seen = [];
        const out = api.write(broken, { onSkipped(list) { seen.push(list); } });
        expect(out.skippedObjects).toEqual([{ num: n, gen: 0, code: 'pdf/parser/bad-object' }]);
        expect(Object.keys(out)).not.toContain('skippedObjects');
        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual(out.skippedObjects);
        // onSkipped receives a copy: mutating it never touches the exposed list.
        seen[0].pop();
        expect(out.skippedObjects).toHaveLength(1);
        expect(new TextDecoder('latin1').decode(out).startsWith('%PDF-2.0')).toBe(true);
    });

    test('lenient without onSkipped, and a non-function onSkipped is ignored', () => {
        const api = bootstrapPdf();
        const doc = freshDoc(api);
        const n = lastInUseNum(doc);
        const failing = () => new Map([[n, new Error('plain')]]);
        const a = api.write(breakObject(freshDoc(api), failing()));
        expect(a.skippedObjects).toEqual([{ num: n, gen: 0, code: 'unknown' }]);
        const b = api.write(breakObject(freshDoc(api), failing()), { onSkipped: 'nope' });
        expect(b.skippedObjects).toEqual(a.skippedObjects);
        expect(Array.from(b)).toEqual(Array.from(a));
    });

    test('strict: true throws pdf/writer/unresolvable-objects with context.objects, onSkipped not called', () => {
        const api = bootstrapPdf();
        const doc = freshDoc(api);
        const n = lastInUseNum(doc);
        const broken = breakObject(doc, new Map([[n, new ParseError('pdf/xref/truncated', 'x')]]));
        let calls = 0;
        let err;
        try { api.write(broken, { strict: true, onSkipped() { calls++; } }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(RenderError);
        expect(err.code).toBe('pdf/writer/unresolvable-objects');
        expect(err.context.objects).toEqual([{ num: n, gen: 0, code: 'pdf/xref/truncated' }]);
        expect(calls).toBe(0);
    });

    test('strict with a non-boolean truthy value is lenient', () => {
        const api = bootstrapPdf();
        const doc = freshDoc(api);
        const n = lastInUseNum(doc);
        const broken = breakObject(doc, new Map([[n, new Error('plain')]]));
        const out = api.write(broken, { strict: 'yes' });
        expect(out.skippedObjects).toHaveLength(1);
        const broken1 = breakObject(freshDoc(api), new Map([[n, new Error('plain')]]));
        expect(api.write(broken1, { strict: 1 }).skippedObjects).toHaveLength(1);
    });

    test('non-object opts are tolerated', () => {
        const api = bootstrapPdf();
        for (const o of [null, undefined, 'strict', 0, true]) {
            const out = api.write(freshDoc(api), o);
            expect(Array.from(out)).toEqual(Array.from(headWrite(freshDoc(api))));
            expect(out.skippedObjects).toEqual([]);
        }
    });

    test('WriteModel path ignores opts and carries skippedObjects: []', () => {
        const api = bootstrapPdf();
        const doc = freshDoc(api);
        const wm = {
            indirects: assembleIndirects(doc),
            root: { num: doc.trailer.root.num, gen: doc.trailer.root.gen },
            version: '2.0'
        };
        let calls = 0;
        const plain = api.write(wm);
        const withOpts = api.write(wm, { strict: true, onSkipped() { calls++; } });
        expect(plain.skippedObjects).toEqual([]);
        expect(withOpts.skippedObjects).toEqual([]);
        expect(Object.keys(withOpts)).not.toContain('skippedObjects');
        expect(Array.from(withOpts)).toEqual(Array.from(plain));
        expect(Array.from(plain)).toEqual(Array.from(writeDocument(wm)));
        expect(calls).toBe(0);
    });
});
