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
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { docxCustomXml } from './customXml.js';
import { ooxmlMath } from '../math/math.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { docxWalker } from './docx-walker.js';
import { docx } from './docx.js';
import { docxText } from './docx-text.js';
import { wmlRunFormatting } from '../extra/wml-run-formatting.js';
import { wmlSettings } from '../extra/wml-settings.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

function build() {
    const xmlInst = ooxmlXml.factory();
    const relsInst = opcRelationships.factory(_errors, xmlInst);
    const ctInst = opcContentTypes.factory(_errors, xmlInst);
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const opcInst = opcPackage.factory(_errors,
        zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
        ctInst, relsInst, _shared);
    const propsInst = docxProperties.factory(xmlInst);
    const drawingInst = docxDrawing.factory(xmlInst,
        drawingmlShape.factory(xmlInst, _shared), _shared);
    const mathInst = ooxmlMath.factory(_errors, xmlInst);
    const structInst = docxStructure.factory(xmlInst, propsInst, drawingInst, mathInst);
    const stylesInst = docxStyles.factory(_errors, xmlInst, propsInst, _shared);
    const numInst = docxNumbering.factory(_errors, xmlInst, propsInst, _shared);
    const setInst = docxSettings.factory(_errors, xmlInst, _shared);
    const comInst = docxComments.factory(_errors, xmlInst, structInst, _shared);
    const fnInst = docxFootnotes.factory(_errors, xmlInst, structInst, _shared);
    const hdrInst = docxHeaders.factory(_errors, xmlInst, structInst, _shared);
    const mcInst = markupCompatibility.factory(xmlInst);
    const chartInst = drawingmlChart.factory(_errors, xmlInst, _shared);
    const cxInst = docxCustomXml.factory(_errors, xmlInst, _shared);
    const walkerInst = docxWalker.factory();
    const d = docx.factory(_errors, docxText.factory(), opcInst, xmlInst, relsInst,
        structInst, stylesInst, numInst, setInst, comInst, fnInst, hdrInst,
        drawingInst, mcInst, chartInst, cxInst, walkerInst, _shared);
    return { d, xmlInst, opcInst, propsInst, setInst };
}

function buildDocxBytes(d, opcInst, documentXml) {
    const pkg = opcInst.empty();
    opcInst.setPart(pkg, '/word/document.xml',
        new TextEncoder().encode(documentXml), d.CT_DOCUMENT);
    opcInst.setRels(pkg, '/', [{
        Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml'
    }]);
    return opcInst.write(pkg);
}

describe('docx — use(...) wiring', () => {
    test('use(...) returns the same factory for chaining', () => {
        const { d, xmlInst, propsInst } = build();
        const ext = wmlRunFormatting.factory(xmlInst, propsInst);
        const r = d.use(ext);
        expect(r).toBe(d);
        expect(typeof d.use(ext).read).toBe('function');
    });

    test('hydrates rPr extras after read()', () => {
        const { d, xmlInst, opcInst, propsInst } = build();
        const ext = wmlRunFormatting.factory(xmlInst, propsInst);
        d.use(ext);
        const xmlSrc = '<?xml version="1.0"?>'
            + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:body><w:p><w:r><w:rPr><w:b/><w:caps/></w:rPr><w:t>hi</w:t></w:r></w:p></w:body>'
            + '</w:document>';
        const bytes = buildDocxBytes(d, opcInst, xmlSrc);
        const parsed = d.read(bytes);
        const rPr = parsed.document.body[0].children[0].rPr;
        expect(rPr.bold).toBe(true);
        expect(rPr.caps).toBe(true);
        expect(rPr._extras).toBeUndefined();
    });

    test('roundtrip: caps survives write/read with use()', () => {
        const { d, xmlInst, propsInst } = build();
        const ext = wmlRunFormatting.factory(xmlInst, propsInst);
        d.use(ext);
        const doc = {
            type: 'document',
            body: [d.paragraph('x', { rPr: { bold: true, caps: true } })]
        };
        const bytes = d.write(doc);
        const back = d.read(bytes);
        const rPr = back.document.body[0].children[0].rPr;
        expect(rPr.bold).toBe(true);
        expect(rPr.caps).toBe(true);
    });

    test('hydrateSettings is invoked when extension provides it', () => {
        const { d, xmlInst, propsInst, setInst } = build();
        const ext = wmlSettings.factory(xmlInst, propsInst);
        d.use(ext);
        // Construct a docx with a settings part containing a typed toggle.
        const { opcInst } = build();
        const pkg = opcInst.empty();
        const documentXml = '<?xml version="1.0"?>'
            + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>';
        const settingsXml = '<?xml version="1.0"?>'
            + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:displayBackgroundShape/></w:settings>';
        opcInst.setPart(pkg, '/word/document.xml',
            new TextEncoder().encode(documentXml), d.CT_DOCUMENT);
        opcInst.setPart(pkg, '/word/settings.xml',
            new TextEncoder().encode(settingsXml), setInst.CT_SETTINGS);
        opcInst.setRels(pkg, '/', [{
            Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml'
        }]);
        opcInst.setRels(pkg, '/word/document.xml', [{
            Id: 'rId2', Type: setInst.REL_TYPE_SETTINGS, Target: 'settings.xml'
        }]);
        const bytes = opcInst.write(pkg);
        const parsed = d.read(bytes);
        // wml-settings hydrate promotes displayBackgroundShape to a typed toggle.
        expect(parsed.settings.displayBackgroundShape).toBe(true);
    });

    test('extension without matching hooks is a no-op', () => {
        const { d, xmlInst, opcInst } = build();
        d.use({ unrelatedHook() {} });
        const xmlSrc = '<?xml version="1.0"?>'
            + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>hi</w:t></w:r></w:p></w:body>'
            + '</w:document>';
        const bytes = buildDocxBytes(d, opcInst, xmlSrc);
        const parsed = d.read(bytes);
        expect(parsed.document.body[0].children[0].rPr.bold).toBe(true);
    });
});
