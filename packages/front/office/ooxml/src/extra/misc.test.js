// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Exhaustive roundtrip tests for the residual misc top-up modules.
 *
 * Each misc module is a long-tail catch-all : 130-632 LOC, 47-298
 * elements. Tests iterate over the full `ELEMENTS` table to guarantee
 * every entry is parseable AND renderable AND flagged `_passthrough:
 * true` (so consumers can distinguish catch-all from fully-typed
 * extras).
 */
import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';

import { wmlMisc } from './wml-misc.js';
import { dmlMainMisc } from './dml-main-misc.js';
import { pmlMisc } from './pml-misc.js';
import { dmlChartMisc } from './dml-chart-misc.js';
import { mathMisc } from './math-misc.js';
import { smlMisc } from './sml-misc.js';

const xml = ooxmlXml.factory();

/** @param {{factory:(x:any)=>{ELEMENTS:string[],parseElement:Function,renderElement:Function}}} mod */
function makeModule(mod) {
    return mod.factory(xml);
}

function suite(name, mod, expectedMin) {
    describe(name, () => {
        const m = makeModule(mod);

        test('exposes a non-empty ELEMENTS catalog', () => {
            expect(Array.isArray(m.ELEMENTS)).toBe(true);
            expect(m.ELEMENTS.length).toBeGreaterThanOrEqual(expectedMin);
        });

        test('every element parses with the expected shape', () => {
            for (const qname of m.ELEMENTS) {
                const local = qname.includes(':') ? qname.split(':')[1] : qname;
                const el = xml.el(qname, { foo: 'bar' });
                const p = m.parseElement(el);
                expect(p).not.toBeNull();
                expect(p.kind).toBe(local);
                expect(p._passthrough).toBe(true);
                expect(p.attrs).toEqual({ foo: 'bar' });
            }
        });

        test('every element renders back with name + attrs preserved', () => {
            for (const qname of m.ELEMENTS) {
                const local = qname.includes(':') ? qname.split(':')[1] : qname;
                const el = xml.el(qname, { foo: 'bar' });
                const back = m.renderElement(m.parseElement(el));
                expect(back).not.toBeNull();
                expect(back.name).toBe(qname);
                expect(back.attrs.foo).toBe('bar');
            }
        });

        test('children are preserved verbatim through roundtrip', () => {
            const sample = m.ELEMENTS[0];
            const child = xml.el('child', {}, [xml.text('hello')]);
            const el = xml.el(sample, {}, [child]);
            const back = m.renderElement(m.parseElement(el));
            expect(back.children.length).toBe(1);
            expect(back.children[0].name).toBe('child');
            expect(xml.textContent(back.children[0])).toBe('hello');
        });

        test('unknown elements return null (no false positives)', () => {
            const out = m.parseElement(xml.el('w:zzNotInCatalog', {}));
            // Each module's switch returns null on default; some have
            // their own prefix and reject foreign ones — both fine.
            expect(out === null || out === undefined).toBe(true);
        });

        test('non-element input is rejected', () => {
            expect(m.parseElement(null)).toBeNull();
            expect(m.parseElement({ type: 'text', value: 'hi' })).toBeNull();
        });

        // AUDIT2 M4 — broader attribute sampling. Seeded PRNG makes the
        // test reproducible across runs. Each element gets a random
        // bag of (attr name, value) pairs that must survive roundtrip.
        test('random attribute samples survive roundtrip', () => {
            const rand = mulberry32(0xC0FFEE ^ name.length);
            const ATTR_VOCAB = ['val', 'w:val', 'r:id', 'name', 'id',
                'type', 'descr', 'r', 'l', 'cx', 'cy', 'algn'];
            const VALUE_VOCAB = ['0', '1', 'true', 'false', '',
                'auto', 'on', 'off', 'value with space', '<>&"\''];
            const sample = m.ELEMENTS.filter((_, i) => rand() < 0.1);
            // Always test at least 5 elements even on small catalogs.
            const targets = sample.length >= 5 ? sample : m.ELEMENTS.slice(0, 5);
            for (const qname of targets) {
                const attrs = {};
                const n = 1 + Math.floor(rand() * 4);
                for (let i = 0; i < n; i++) {
                    const k = ATTR_VOCAB[Math.floor(rand() * ATTR_VOCAB.length)];
                    const v = VALUE_VOCAB[Math.floor(rand() * VALUE_VOCAB.length)];
                    attrs[k] = v;
                }
                const back = m.renderElement(m.parseElement(xml.el(qname, attrs)));
                expect(back).not.toBeNull();
                expect(back.name).toBe(qname);
                for (const k of Object.keys(attrs)) {
                    expect(back.attrs[k]).toBe(attrs[k]);
                }
            }
        });
    });
}

// Seeded PRNG (Mulberry32) — reproducible across runs. Returns 32-bit
// floats in [0, 1). Lightweight enough to inline in the test file.
function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t = (t + 0x6D2B79F5) >>> 0;
        let r = t;
        r = Math.imul(r ^ (r >>> 15), r | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return (((r ^ (r >>> 14)) >>> 0) / 4294967296);
    };
}

suite('extra/wml-misc',       wmlMisc,       250);
suite('extra/dml-main-misc',  dmlMainMisc,   180);
suite('extra/pml-misc',       pmlMisc,        80);
suite('extra/dml-chart-misc', dmlChartMisc,  120);
suite('extra/math-misc',      mathMisc,       40);
suite('extra/sml-misc',       smlMisc,       100);
