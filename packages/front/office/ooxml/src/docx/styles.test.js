// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { opcContentTypes } from '../opc/contentTypes.js';
import { opcRelationships } from '../opc/relationships.js';
import { opcPackage } from '../opc/package.js';
import { docxProperties } from './properties.js';
import { docxDrawing } from './drawing.js';
import { docxStructure } from './structure.js';
import { docxStyles } from './styles.js';
import { docxNumbering } from './numbering.js';
import { docxSettings } from './settings.js';
import { docxComments } from './comments.js';
import { docxFootnotes } from './footnotes.js';
import { docxHeaders } from './headers.js';
import { docxWalker } from './docx-walker.js';
import { docx } from './docx.js';
import { docxText } from './docx-text.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const props = docxProperties.factory(xml);
const styles = docxStyles.factory(_errors, xml, props, _shared);

describe('docxStyles — standalone parse/serialize', () => {
    test('roundtrip docDefaults + paragraph style', () => {
        const obj = {
            docDefaults: { rPr: { font: 'Calibri', size: 22 },
                           pPr: { align: 'left' } },
            styles: [
                { type: 'paragraph', styleId: 'Normal', name: 'Normal',
                  isDefault: true, rPr: { size: 22 } },
                { type: 'paragraph', styleId: 'Heading1', name: 'heading 1',
                  basedOn: 'Normal', next: 'Normal',
                  rPr: { bold: true, size: 32, color: '2E74B5' },
                  pPr: { spacing: { before: 240, after: 0 } } },
                { type: 'character', styleId: 'Strong', name: 'Strong',
                  rPr: { bold: true } }
            ]
        };
        const xmlText = styles.serialize(obj);
        expect(xmlText).toContain('w:styles');
        const back = styles.parse(xmlText);
        expect(back).toEqual(obj);
    });

    test('defaults() builds parseable shell', () => {
        const def = styles.defaults();
        const back = styles.parse(styles.serialize(def));
        expect(back.styles[0].styleId).toBe('Normal');
        expect(back.styles[0].isDefault).toBe(true);
    });
});

describe('docxStyles - table style tblPr (BL-1766)', () => {
    const edge = { val: 'single', sz: 4, space: 0, color: 'auto' };
    const tableStyle = () => ({
        type: 'table', styleId: 'TableGrid', name: 'Table Grid',
        tblPr: {
            borders: {
                top: { ...edge }, left: { ...edge }, bottom: { ...edge },
                right: { ...edge }, insideH: { ...edge }, insideV: { ...edge }
            }
        }
    });

    test('a table style with tblPr round-trips serialize -> parse', () => {
        const obj = { styles: [tableStyle()] };
        const text = styles.serialize(obj);
        expect(text).toContain('<w:tblPr><w:tblBorders>');
        expect(styles.parse(text)).toEqual(obj);
    });

    test('render order inside w:style is name, pPr, rPr, tblPr, then _extras', () => {
        const s = { ...tableStyle(), pPr: { align: 'left' }, rPr: { bold: true },
                    _extras: [xml.el('w:tblStylePr', { 'w:type': 'firstRow' })] };
        const el = styles.renderStyle(s);
        expect(el.children.map(c => c.name))
            .toEqual(['w:name', 'w:pPr', 'w:rPr', 'w:tblPr', 'w:tblStylePr']);
        expect(styles.parseStyle(el).tblPr).toEqual(tableStyle().tblPr);
    });

    test('a style without tblPr renders no w:tblPr', () => {
        const el = styles.renderStyle({ type: 'paragraph', styleId: 'P', name: 'P' });
        expect(el.children.map(c => c.name)).toEqual(['w:name']);
    });

    // Captured from the pre-edit `defaults()` serialisation (BL-1766).
    const DEFAULTS_SNAPSHOT = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\" w:cs=\"Calibri\"/><w:sz w:val=\"22\"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type=\"paragraph\" w:styleId=\"Normal\" w:default=\"1\"><w:name w:val=\"Normal\"/></w:style></w:styles>";
    test('defaults() serialisation is unchanged (pinned string)', () => {
        expect(styles.serialize(styles.defaults())).toBe(DEFAULTS_SNAPSHOT);
    });
});

describe('docxStyles — integrated with docx package', () => {
    function buildDocx() {
        const relsInst = opcRelationships.factory(_errors, xml);
        const bs = bitstream.factory();
        const hf = huffman.factory(bs);
        const opcInst = opcPackage.factory(_errors,
            zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
            opcContentTypes.factory(_errors, xml), relsInst, _shared);
        const drawing = docxDrawing.factory(xml,
            { parseShapeProperties: () => undefined,
              renderShapeProperties: () => null }, _shared);
        const struct = docxStructure.factory(xml, props, drawing,
            // Math stub — styles tests don't exercise math.
            { parseOMath: () => ({}), renderOMath: () => null,
              parseOMathPara: () => ({}), renderOMathPara: () => null });
        const num = docxNumbering.factory(_errors, xml, props, _shared);
        const set = docxSettings.factory(_errors, xml, _shared);
        const com = docxComments.factory(_errors, xml, struct, _shared);
        const fn = docxFootnotes.factory(_errors, xml, struct, _shared);
        const hdr = docxHeaders.factory(_errors, xml, struct, _shared);
        // Inline import via dynamic require not possible — re-import.
        return docx.factory(_errors, docxText.factory(), opcInst, xml, relsInst, struct, styles,
            num, set, com, fn, hdr, drawing,
            { process: x => x },   // identity stub — styles tests don't exercise MC
            { REL_TYPE_CHART: 'noop', CT_CHART: 'noop',
              parse: () => ({}), bytesOf: () => new Uint8Array() },
            { REL_TYPE_CUSTOM_XML: 'noop', REL_TYPE_CUSTOM_XML_PROPS: 'noop',
              CT_CUSTOM_XML_PROPS: 'noop',
              parseProps: () => ({}), propsBytes: () => new Uint8Array(),
              generateStoreItemID: () => '{stub}' },
            docxWalker.factory(), _shared);
    }

    test('writing with styles option emits styles.xml part', () => {
        const d = buildDocx();
        const doc = {
            type: 'document',
            body: [d.paragraph('hello', { pPr: { pStyle: 'Heading1' } })]
        };
        const stylesObj = {
            styles: [{ type: 'paragraph', styleId: 'Heading1',
                       name: 'heading 1',
                       rPr: { bold: true, size: 32 } }]
        };
        const bytes = d.write(doc, { styles: stylesObj });
        const back = d.read(bytes);
        expect(back.styles).toBeDefined();
        const h1 = back.styles.styles.find(s => s.styleId === 'Heading1');
        expect(h1.rPr.bold).toBe(true);
        expect(h1.rPr.size).toBe(32);
    });
});
