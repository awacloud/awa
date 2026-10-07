// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// docx.write x customXml random source: an explicit storeItemID never
// touches the random source; a missing one fails closed without Web Crypto.

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
    return docx.factory(_errors, docxText.factory(), opcInst, xmlInst, relsInst,
        structInst, stylesInst, numInst, setInst, comInst, fnInst, hdrInst,
        drawingInst, mcInst, chartInst, cxInst, walkerInst, _shared);
}

const realDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
function withoutCrypto(fn) {
    Object.defineProperty(globalThis, 'crypto',
        { value: undefined, configurable: true, writable: true });
    try { return fn(); } finally {
        if (realDesc) Object.defineProperty(globalThis, 'crypto', realDesc);
        else delete globalThis.crypto;
    }
}

describe('docx.write — customXml random source', () => {
    const doc = { body: [{ type: 'paragraph', runs: [{ text: 'x' }] }] };

    test('an explicit storeItemID needs no random source', () => {
        const d = build();
        const id = '{12345678-90AB-CDEF-1234-567890ABCDEF}';
        const bytes = withoutCrypto(() => d.write(doc, {
            customXml: [{ xml: '<root/>', storeItemID: id }]
        }));
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(d.read(bytes).customXml[0].storeItemID).toBe(id);
    });

    test('a missing storeItemID without Web Crypto throws docx/no-random-source', () => {
        const d = build();
        let err;
        try {
            withoutCrypto(() => d.write(doc, { customXml: [{ xml: '<root/>' }] }));
        } catch (e) { err = e; }
        expect(err).toBeInstanceOf(_errors.RenderError);
        expect(err.code).toBe('docx/no-random-source');
    });
});
