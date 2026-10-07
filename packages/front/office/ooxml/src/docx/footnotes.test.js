// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';
import { docxStructure } from './structure.js';
import { docxFootnotes } from './footnotes.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const props = docxProperties.factory(xml);
const struct = docxStructure.factory(xml, props);
const fn = docxFootnotes.factory(_errors, xml, struct, _shared);

function paragraphOf(text) {
    return {
        type: 'paragraph',
        children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
    };
}

describe('docxFootnotes', () => {
    test('footnotes roundtrip with separator + normal', () => {
        const obj = {
            notes: [
                { id: -1, noteType: 'separator', body: [paragraphOf('')] },
                { id: 0, noteType: 'continuationSeparator', body: [paragraphOf('')] },
                { id: 1, body: [paragraphOf('First footnote text.')] }
            ]
        };
        const back = fn.parseFootnotes(fn.serializeFootnotes(obj));
        expect(back.notes).toHaveLength(3);
        expect(back.notes[0].noteType).toBe('separator');
        expect(back.notes[2].body[0].children[0].children[0].value)
            .toBe('First footnote text.');
    });

    test('endnotes share the same model under a different root', () => {
        const obj = {
            notes: [{ id: 1, body: [paragraphOf('Endnote.')] }]
        };
        const xmlText = fn.serializeEndnotes(obj);
        expect(xmlText).toContain('<w:endnotes');
        const back = fn.parseEndnotes(xmlText);
        expect(back.notes[0].body[0].children[0].children[0].value)
            .toBe('Endnote.');
    });
});
