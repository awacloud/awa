// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { textList } from './list.js';
import { textParagraph } from './paragraph.js';
import { textStyleRegistry } from './style-registry.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

// --- Full-runtime helper (odt.write/odt.read) for the end-to-end test ---
// Uses the package's own aggregator (`main.js`) rather than hand-listing the
// dependency closure, so this test tracks the live registration set instead
// of a snapshot of it (see `odt.test.js`/`gen-odt-fixtures.js` precedent).
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';

function build() {
    const xml = fwXml.factory();
    const para = textParagraph.factory(xml);
    const l = textList.factory(xml, para);
    return { xml, para, l };
}

/** A real `textStyleRegistry` factory instance, for round-trips through the
 *  live write/read seam (not a stand-in). */
function reg(xml) {
    return textStyleRegistry.factory(xml);
}

function buildOdt() {
    const runtime = new ModuleRuntime();
    for (const m of [...fw_require, ...modules]) runtime.register(m);
    return runtime.resolve('odt');
}

describe('textList module', () => {
    test('factory shape', () => {
        expect(textList.name).toBe('textList');
        expect(textList.dependencies).toEqual(['xml', 'textParagraph']);
        expect(typeof textList.factory).toBe('function');
    });

    describe('parseList', () => {
        test('typed items + style', () => {
            const { xml, l } = build();
            const el = xml.parse('<text:list text:style-name="L1"><text:list-item><text:p>A</text:p></text:list-item><text:list-item><text:p>B</text:p></text:list-item></text:list>');
            const list = l.parseList(el);
            expect(list.type).toBe('list');
            expect(list.styleName).toBe('L1');
            expect(list.items).toHaveLength(2);
            expect(list.items[0].children[0].runs[0].value).toBe('A');
        });

        test('nested list', () => {
            const { xml, l } = build();
            const el = xml.parse('<text:list><text:list-item><text:p>outer</text:p><text:list><text:list-item><text:p>inner</text:p></text:list-item></text:list></text:list-item></text:list>');
            const list = l.parseList(el);
            expect(list.items[0].children).toHaveLength(2);
            expect(list.items[0].children[1].type).toBe('list');
        });
    });

    describe('renderList', () => {
        test('roundtrip', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', styleName: 'L1', items: [
                    { children: [para.paragraph('one')] },
                    { children: [para.paragraph('two')] }
                ]
            };
            const out = xml.serialize(l.renderList(model));
            expect(out).toContain('<text:list text:style-name="L1">');
            expect(out).toContain('one');
            expect(out).toContain('two');
        });

        test('continueNumbering attribute', () => {
            const { xml, l } = build();
            const out = xml.serialize(l.renderList({ type: 'list', continueNumbering: true, items: [] }));
            expect(out).toContain('text:continue-numbering="true"');
        });
    });

    // -----------------------------------------------------------------
    // GAP-ODF-6 — ordered/numFormat on the typed model (task 03)
    // -----------------------------------------------------------------

    describe('legacy passthrough (ordered absent)', () => {
        test('renders byte-identical to the pre-change output (no ctx)', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', styleName: 'L1', continueNumbering: true, items: [
                    { children: [para.paragraph('one')] },
                    { children: [para.paragraph('two')] }
                ]
            };
            const out = xml.serialize(l.renderList(model));
            expect(out).toBe(
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
                + '<text:list text:style-name="L1" text:continue-numbering="true">'
                + '<text:list-item><text:p>one</text:p></text:list-item>'
                + '<text:list-item><text:p>two</text:p></text:list-item></text:list>');
        });

        test('parse without ctx keeps today\'s shape (ctx-less callers unaffected)', () => {
            const { xml, l } = build();
            const el = xml.parse('<text:list text:style-name="L1"><text:list-item><text:p>A</text:p></text:list-item></text:list>');
            const list = l.parseList(el);
            expect(list).toEqual({
                type: 'list', styleName: 'L1',
                items: [{ children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'A' }] }] }]
            });
        });
    });

    describe('ordered/numFormat round-trip via the real registry/resolver pair', () => {
        function roundTrip(xml, para, l, model) {
            const R = reg(xml);
            const registry = R.createRegistry();
            const rendered = l.renderList(model, undefined, registry);
            const resolver = R.createResolver(registry.toAutomaticStyles(), [], null);
            return l.parseList(rendered, undefined, resolver);
        }

        test('ordered "1" (default numFormat)', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: true, numFormat: '1',
                items: [{ children: [para.paragraph('a')] }]
            };
            const parsed = roundTrip(xml, para, l, model);
            expect(parsed).toEqual(model);
            expect(parsed.styleName).toBeUndefined();
        });

        test('ordered "a"', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: true, numFormat: 'a',
                items: [{ children: [para.paragraph('a')] }]
            };
            const parsed = roundTrip(xml, para, l, model);
            expect(parsed).toEqual(model);
            expect(parsed.styleName).toBeUndefined();
        });

        test('bullet-explicit (ordered: false)', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: false,
                items: [{ children: [para.paragraph('a')] }]
            };
            const parsed = roundTrip(xml, para, l, model);
            expect(parsed).toEqual(model);
            expect(parsed.styleName).toBeUndefined();
        });

        test('nested ordered-inside-bullet', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: false,
                items: [{
                    children: [
                        para.paragraph('outer'),
                        {
                            type: 'list', ordered: true, numFormat: '1',
                            items: [{ children: [para.paragraph('inner')] }]
                        }
                    ]
                }]
            };
            const parsed = roundTrip(xml, para, l, model);
            expect(parsed).toEqual(model);
            expect(parsed.styleName).toBeUndefined();
            expect(parsed.items[0].children[1].styleName).toBeUndefined();
        });

        test('continueNumbering survives alongside ordered', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: true, numFormat: 'I', continueNumbering: true,
                items: [{ children: [para.paragraph('a')] }]
            };
            const parsed = roundTrip(xml, para, l, model);
            expect(parsed).toEqual(model);
        });
    });

    describe('precedence (write): explicit styleName wins over ordered', () => {
        test('ctx.listStyle is not called', () => {
            const { xml, para, l } = build();
            const calls = [];
            const ctx = { listStyle: (...args) => { calls.push(args); return 'SHOULD-NOT-BE-USED'; } };
            const model = {
                type: 'list', styleName: 'Explicit', ordered: true,
                items: [{ children: [para.paragraph('a')] }]
            };
            const out = xml.serialize(l.renderList(model, undefined, ctx));
            expect(out).toContain('text:style-name="Explicit"');
            expect(out).not.toContain('SHOULD-NOT-BE-USED');
            expect(calls).toHaveLength(0);
        });
    });

    describe('foreign styleName (unresolvable)', () => {
        test('parse keeps styleName, no ordered field', () => {
            const { xml, l } = build();
            const ctx = { listNumbering: () => null };
            const el = xml.parse('<text:list text:style-name="Foreign"><text:list-item><text:p>a</text:p></text:list-item></text:list>');
            const list = l.parseList(el, undefined, ctx);
            expect(list.styleName).toBe('Foreign');
            expect(list.ordered).toBeUndefined();
            expect(list.numFormat).toBeUndefined();
        });
    });

    describe('keep-and-gain (Ruling B — named list styles)', () => {
        test('parse gains ordered/numFormat and keeps styleName; render keeps the original attr and does not call ctx.listStyle', () => {
            const { xml, l } = build();
            const R = reg(xml);
            const namedListEl = xml.el('text:list-style', { 'style:name': 'ListNumber' }, [
                xml.el('text:list-level-style-number',
                    { 'text:level': '1', 'style:num-format': 'i' }, [])
            ]);
            const resolver = R.createResolver(null, [], [namedListEl]);

            const src = xml.parse('<text:list text:style-name="ListNumber"><text:list-item><text:p>a</text:p></text:list-item></text:list>');
            const parsed = l.parseList(src, undefined, resolver);
            expect(parsed.styleName).toBe('ListNumber');
            expect(parsed.ordered).toBe(true);
            expect(parsed.numFormat).toBe('i');

            const calls = [];
            const renderCtx = { listStyle: (...args) => { calls.push(args); return 'SHOULD-NOT-BE-USED'; } };
            const out = xml.serialize(l.renderList(parsed, undefined, renderCtx));
            expect(out).toContain('text:style-name="ListNumber"');
            expect(out).not.toContain('SHOULD-NOT-BE-USED');
            expect(calls).toHaveLength(0);
        });
    });

    // A ctx that exists but lacks the member the list code calls (the odt
    // write ctx always exists: it carries the image sink even when the
    // style registry does not provide `listStyle`).
    describe('ctx without the called member degrades like no ctx', () => {
        const partialCtx = () => ({ renderImage() {} });

        test('renderList: ordered list, ctx lacks listStyle -> same output as no ctx', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: true, numFormat: 'a',
                items: [{ children: [para.paragraph('a')] }]
            };
            const bare = xml.serialize(l.renderList(model));
            const out = xml.serialize(l.renderList(model, undefined, partialCtx()));
            expect(out).toBe(bare);
            expect(out).not.toContain('text:style-name');
        });

        test('renderList: bullet list, ctx lacks listStyle -> same output as no ctx', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: false,
                items: [{ children: [para.paragraph('a')] }]
            };
            expect(xml.serialize(l.renderList(model, undefined, partialCtx())))
                .toBe(xml.serialize(l.renderList(model)));
        });

        test('renderList: nested list level also degrades', () => {
            const { xml, para, l } = build();
            const model = {
                type: 'list', ordered: false,
                items: [{
                    children: [para.paragraph('outer'), {
                        type: 'list', ordered: true,
                        items: [{ children: [para.paragraph('inner')] }]
                    }]
                }]
            };
            expect(xml.serialize(l.renderList(model, undefined, partialCtx())))
                .toBe(xml.serialize(l.renderList(model)));
        });

        test('renderList: ctx with a non-function listStyle degrades', () => {
            const { xml, para, l } = build();
            const model = { type: 'list', ordered: true, items: [{ children: [para.paragraph('a')] }] };
            expect(xml.serialize(l.renderList(model, undefined, { listStyle: 'nope' })))
                .toBe(xml.serialize(l.renderList(model)));
        });

        test('parseList: ctx lacks listNumbering -> same result as no ctx, styleName kept', () => {
            const { xml, l } = build();
            const src = '<text:list text:style-name="L1"><text:list-item><text:p>A</text:p></text:list-item></text:list>';
            const bare = l.parseList(xml.parse(src));
            const withCtx = l.parseList(xml.parse(src), undefined, partialCtx());
            expect(withCtx).toEqual(bare);
            expect(withCtx.styleName).toBe('L1');
            expect(withCtx.ordered).toBeUndefined();
            expect(withCtx.numFormat).toBeUndefined();
        });

        test('parseList: nested list level also degrades', () => {
            const { xml, l } = build();
            const src = '<text:list><text:list-item><text:p>o</text:p><text:list text:style-name="L2"><text:list-item><text:p>i</text:p></text:list-item></text:list></text:list-item></text:list>';
            const withCtx = l.parseList(xml.parse(src), undefined, partialCtx());
            expect(withCtx).toEqual(l.parseList(xml.parse(src)));
            expect(withCtx.items[0].children[1].styleName).toBe('L2');
        });

        test('odt.write: a write ctx without listStyle writes an unstyled list instead of throwing', () => {
            // The live odt, but its style registry hands out a registry that
            // does not provide `listStyle`.
            const stripped = {
                ...textStyleRegistry,
                factory(xml) {
                    const real = textStyleRegistry.factory(xml);
                    return {
                        ...real,
                        createRegistry(opts) {
                            const { listStyle, ...rest } = real.createRegistry(opts);
                            return rest;
                        }
                    };
                }
            };
            const runtime = new ModuleRuntime();
            for (const m of [...fw_require, ...modules]) {
                runtime.register(m.name === 'textStyleRegistry' ? stripped : m);
            }
            const o = runtime.resolve('odt');
            const doc = {
                body: [
                    { type: 'list', ordered: true, numFormat: '1', items: [{ children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'one' }] }] }] },
                    { type: 'list', ordered: false, items: [{ children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'two' }] }] }] }
                ]
            };
            const read = o.read(o.write(doc));
            expect(read.body[0].type).toBe('list');
            expect(read.body[1].type).toBe('list');
            expect(read.body[0].ordered).toBeUndefined();
            expect(read.body[0].items[0].children[0].runs[0].value).toBe('one');
        });
    });

    describe('end-to-end via odt.write/odt.read', () => {
        test('two adjacent lists (bullet then ordered) round-trip with distinct semantics', () => {
            const o = buildOdt();
            const doc = {
                body: [
                    {
                        type: 'list', ordered: false,
                        items: [{ children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'bullet item' }] }] }]
                    },
                    {
                        type: 'list', ordered: true, numFormat: '1',
                        items: [{ children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'ordered item' }] }] }]
                    }
                ]
            };
            const bytes = o.write(doc);
            const read = o.read(bytes);
            expect(read.body[0].type).toBe('list');
            expect(read.body[1].type).toBe('list');
            expect(read.body[0].ordered).toBe(false);
            expect(read.body[1].ordered).toBe(true);
            expect(read.body[1].numFormat).toBe('1');
            expect(read.body[0].styleName).toBeUndefined();
            expect(read.body[1].styleName).toBeUndefined();
        });
    });
});
