// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { odfStyles } from './styles.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';

const xml = fwXml.factory();
const _errors = odfErrors.factory();
const _shared = odfShared.factory(_errors, xml);
const { ParseError, ContractError } = _errors;
const styles = odfStyles.factory(_errors, _shared, xml);

const STYLES_XML = `<?xml version="1.0"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">
  <office:styles>
    <style:style style:name="Default" style:family="paragraph"/>
  </office:styles>
  <office:automatic-styles>
    <style:style style:name="P1" style:family="paragraph"/>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard"/>
  </office:master-styles>
</office:document-styles>`;

describe('odfStyles module', () => {
    test('has the expected factory shape', () => {
        expect(odfStyles.name).toBe('odfStyles');
        expect(odfStyles.dependencies).toEqual(['odfErrors', 'odfShared', 'xml']);
        expect(typeof odfStyles.factory).toBe('function');
    });

    describe('parse', () => {
        test('extracts three style buckets', () => {
            const s = styles.parse(STYLES_XML);
            expect(s.styles).toHaveLength(1);
            expect(s.styles[0].attrs['style:name']).toBe('Default');
            expect(s.automaticStyles).toHaveLength(1);
            expect(s.automaticStyles[0].attrs['style:name']).toBe('P1');
            expect(s.masterStyles).toHaveLength(1);
            expect(s.masterStyles[0].name).toBe('style:master-page');
        });

        test('throws on unexpected root', () => {
            expect(() => styles.parse('<wrong/>')).toThrow(ParseError);
        });
    });

    describe('serialize', () => {
        test('roundtrips parsed input', () => {
            const s = styles.parse(STYLES_XML);
            const back = styles.parse(styles.serialize(s));
            expect(back.styles).toHaveLength(1);
            expect(back.automaticStyles[0].attrs['style:name']).toBe('P1');
            expect(back.masterStyles[0].name).toBe('style:master-page');
        });

        test('empty produces a valid 3-bucket document', () => {
            const s = styles.empty();
            const out = styles.serialize(s);
            expect(out).toContain('<office:styles');
            expect(out).toContain('<office:automatic-styles');
            expect(out).toContain('<office:master-styles');
        });
    });

    // ------------------------------------------------------------------
    // office/BATCH_48/01 — typed named-style specs (write)
    describe('namedStyle', () => {
        test('is part of the API', () => {
            expect(typeof styles.namedStyle).toBe('function');
        });

        test('full spec → exact attribute order and children order', () => {
            const extraChild = xml.el('style:map', { 'style:condition': 'x' }, []);
            const node = styles.namedStyle({
                _extras: { attrs: { 'style:auto-update': 'true' }, children: [extraChild] },
                properties: {
                    graphic: { 'draw:fill': 'none' },
                    tableCell: { 'fo:border': 'none' },
                    tableRow: { 'style:min-row-height': '1cm' },
                    tableColumn: { 'style:column-width': '2cm' },
                    table: { 'table:align': 'margins' },
                    text: { 'fo:font-weight': 'bold' },
                    paragraph: { 'fo:margin-top': '0.4cm' }
                },
                class: 'text',
                defaultOutlineLevel: 1,
                nextStyleName: 'Text_20_body',
                parentStyleName: 'Heading',
                family: 'paragraph',
                displayName: 'Heading 1',
                name: 'Heading_20_1'
            });
            expect(node.type).toBe('element');
            expect(node.name).toBe('style:style');
            expect(Object.keys(node.attrs)).toEqual([
                'style:name', 'style:display-name', 'style:family',
                'style:parent-style-name', 'style:next-style-name',
                'style:default-outline-level', 'style:class', 'style:auto-update']);
            expect(node.attrs['style:default-outline-level']).toBe('1');
            expect(node.children.map(c => c.name)).toEqual([
                'style:paragraph-properties', 'style:text-properties',
                'style:table-properties', 'style:table-column-properties',
                'style:table-row-properties', 'style:table-cell-properties',
                'style:graphic-properties', 'style:map']);
            expect(node.children[1].attrs).toEqual({ 'fo:font-weight': 'bold' });
            expect(node.children[7]).toBe(extraChild);
            expect(xml.serialize(node)).toContain(
                '<style:style style:name="Heading_20_1" style:display-name="Heading 1" '
                + 'style:family="paragraph" style:parent-style-name="Heading" '
                + 'style:next-style-name="Text_20_body" style:default-outline-level="1" '
                + 'style:class="text" style:auto-update="true">');
        });

        test('minimal spec → name + family, no children', () => {
            expect(styles.namedStyle({ name: 'Strong', family: 'text' })).toEqual({
                type: 'element', name: 'style:style',
                attrs: { 'style:name': 'Strong', 'style:family': 'text' },
                children: []
            });
        });

        test('an empty properties bag emits an empty properties element', () => {
            const node = styles.namedStyle({ name: 'S', family: 'paragraph', properties: { paragraph: {} } });
            expect(node.children).toEqual([{
                type: 'element', name: 'style:paragraph-properties', attrs: {}, children: []
            }]);
        });

        test('throws ContractError on a missing or non-string name/family', () => {
            const bad = [
                { family: 'text' },
                { name: 'X' },
                { name: 3, family: 'text' },
                { name: 'X', family: null },
                null
            ];
            for (const spec of bad) {
                let err;
                try { styles.namedStyle(spec); } catch (e) { err = e; }
                expect(err).toBeInstanceOf(ContractError);
                expect(err.code).toBe('odf/contract-error/styles');
                expect(err.message).toBe('styles: named style needs a string name and family');
                expect(err.context).toEqual({ module: 'styles', spec });
            }
        });
    });

    describe('serialize — typed specs', () => {
        /** A raw model, rebuilt fresh per call. */
        function rawModel() {
            return {
                styles: [
                    xml.el('style:style', { 'style:name': 'Standard', 'style:family': 'paragraph', 'style:class': 'text' },
                        [xml.el('style:paragraph-properties', { 'fo:margin-top': '0cm' }, [])]),
                    xml.el('style:default-style', { 'style:family': 'table-cell' }, [])
                ],
                automaticStyles: [xml.el('style:page-layout', { 'style:name': 'pm1' }, [])],
                masterStyles: [xml.el('style:master-page', { 'style:name': 'Standard', 'style:page-layout-name': 'pm1' }, [])]
            };
        }

        // Captured from `git show HEAD:packages/front/office/odf/src/style/styles.js`
        // (pre-office/BATCH_48/01) serialising rawModel() — the raw path
        // must stay byte-identical.
        const HEAD_RAW = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
            + '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
            + 'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
            + 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
            + 'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
            + 'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
            + 'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.4">'
            + '<office:styles><style:style style:name="Standard" style:family="paragraph" style:class="text">'
            + '<style:paragraph-properties fo:margin-top="0cm"/></style:style>'
            + '<style:default-style style:family="table-cell"/></office:styles>'
            + '<office:automatic-styles><style:page-layout style:name="pm1"/></office:automatic-styles>'
            + '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/>'
            + '</office:master-styles></office:document-styles>';

        test('raw-only input is byte-identical to the HEAD serialisation', () => {
            expect(styles.serialize(rawModel())).toBe(HEAD_RAW);
        });

        test('no foreign prefix: an empty opts.namespaces keeps HEAD_RAW', () => {
            expect(styles.serialize(rawModel(), { namespaces: { draw: _shared.ODF_NS.DRAW } })).toBe(HEAD_RAW);
            expect(styles.serialize(rawModel(), {})).toBe(HEAD_RAW);
        });

        /** rawModel() plus a graphic style carrying a `draw:` attribute. */
        function drawModel() {
            const m = rawModel();
            m.styles.push(xml.el('style:style', { 'style:name': 'Graphics', 'style:family': 'graphic' },
                [xml.el('style:graphic-properties', { 'draw:fill': 'none' }, [])]));
            return m;
        }

        test('opts.namespaces declares a carried draw prefix after the six own declarations', () => {
            const out = styles.serialize(drawModel(), { namespaces: { draw: 'urn:example:carried-draw' } });
            const root = xml.parse(out);
            expect(Object.keys(root.attrs)).toEqual(['xmlns:office', 'xmlns:style', 'xmlns:text', 'xmlns:fo',
                'xmlns:svg', 'xmlns:table', 'xmlns:draw', 'office:version']);
            expect(root.attrs['xmlns:draw']).toBe('urn:example:carried-draw');
        });

        test('without opts a draw: attribute is declared from the known table', () => {
            const root = xml.parse(styles.serialize(drawModel()));
            expect(root.attrs['xmlns:draw']).toBe(_shared.ODF_NS.DRAW);
        });

        test('a prefix nobody declares throws RenderError odf/render-error/namespace', () => {
            const m = rawModel();
            m.styles.push(xml.el('style:style', { 'style:name': 'X', 'style:family': 'text', 'zzz:k': '1' }, []));
            let err = null;
            try { styles.serialize(m); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(_errors.RenderError);
            expect(err.code).toBe('odf/render-error/namespace');
            expect(err.context).toEqual({ module: 'styles', part: 'styles.xml', prefix: 'zzz' });
        });

        test('raw elements and specs mix in all three buckets', () => {
            const m = rawModel();
            m.styles.push({ name: 'Strong', family: 'text', properties: { text: { 'fo:font-weight': 'bold' } } });
            m.automaticStyles.unshift({ name: 'P1', family: 'paragraph', parentStyleName: 'Standard' });
            m.masterStyles.push({ name: 'Odd', family: 'paragraph' });
            const out = styles.serialize(m);
            expect(out).toContain('<style:default-style style:family="table-cell"/>'
                + '<style:style style:name="Strong" style:family="text">'
                + '<style:text-properties fo:font-weight="bold"/></style:style></office:styles>');
            expect(out).toContain('<office:automatic-styles>'
                + '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard"/>'
                + '<style:page-layout style:name="pm1"/>');
            expect(out).toContain('style:page-layout-name="pm1"/>'
                + '<style:style style:name="Odd" style:family="paragraph"/></office:master-styles>');
        });

        test('parse(serialize(specs)) yields raw elements carrying the spec names', () => {
            const specs = {
                styles: [
                    { name: 'Heading_20_1', family: 'paragraph', displayName: 'Heading 1', defaultOutlineLevel: 1 },
                    { name: 'Strong', family: 'text', properties: { text: { 'fo:font-weight': 'bold' } } }
                ],
                automaticStyles: [{ name: 'T1', family: 'table', properties: { table: { 'table:align': 'margins' } } }],
                masterStyles: []
            };
            const back = styles.parse(styles.serialize(specs));
            expect(back.styles.map(e => e.type)).toEqual(['element', 'element']);
            expect(back.styles.map(e => e.attrs['style:name'])).toEqual(['Heading_20_1', 'Strong']);
            expect(back.styles[0].attrs['style:default-outline-level']).toBe('1');
            expect(back.automaticStyles.map(e => e.attrs['style:name'])).toEqual(['T1']);
            expect(back.masterStyles).toEqual([]);
        });

        test('an entry that is neither an element nor a spec throws ContractError', () => {
            for (const bad of [42, 'Standard', { family: 'text' }, null]) {
                const m = rawModel();
                m.automaticStyles.push(bad);
                expect(() => styles.serialize(m)).toThrow(ContractError);
            }
            const m = rawModel();
            m.masterStyles.push({ name: 'X' });
            expect(() => styles.serialize(m)).toThrow(ContractError);
        });
    });

    describe('PROP_TAGS mirror — drift vs styleAutomatic', () => {
        test('every properties key maps to the styleAutomatic tag, in PROP_TAGS order', () => {
            const runtime = new ModuleRuntime();
            for (const m of [...fw_require, ...modules]) runtime.register(m);
            const auto = runtime.resolve('styleAutomatic');
            const tagByKey = Object.fromEntries(
                Object.entries(auto.PROP_TAGS).map(([tag, key]) => [key, tag]));
            const keys = Object.values(auto.PROP_TAGS);
            const properties = {};
            for (const k of [...keys].reverse()) properties[k] = { 'x:k': k };
            const node = styles.namedStyle({ name: 'S', family: 'paragraph', properties });
            expect(node.children.map(c => c.name)).toEqual(keys.map(k => tagByKey[k]));
            expect(node.children.map(c => c.name)).toEqual(Object.keys(auto.PROP_TAGS));
            // And the typed parse of the emitted element recovers every bag.
            expect(auto.parseStyle(node).properties).toEqual(properties);
        });

        test('an unknown properties key is not emitted', () => {
            const node = styles.namedStyle({ name: 'S', family: 'text', properties: { bogus: { a: '1' } } });
            expect(node.children).toEqual([]);
        });
    });
});
