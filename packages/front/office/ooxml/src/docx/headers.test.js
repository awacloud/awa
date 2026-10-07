// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';
import { docxStructure } from './structure.js';
import { docxHeaders } from './headers.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const props = docxProperties.factory(xml);
const struct = docxStructure.factory(xml, props);
const headers = docxHeaders.factory(_errors, xml, struct, _shared);

function paragraphOf(text) {
    return {
        type: 'paragraph',
        children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
    };
}

describe('docxHeaders', () => {
    test('header roundtrip with multiple paragraphs', () => {
        const obj = {
            type: 'header',
            body: [paragraphOf('Page header'), paragraphOf('Sub-line')]
        };
        const back = headers.parse(headers.serialize(obj), 'header');
        expect(back.type).toBe('header');
        expect(back.body).toHaveLength(2);
        expect(back.body[0].children[0].children[0].value).toBe('Page header');
    });

    test('footer roundtrip with a table', () => {
        const obj = {
            type: 'footer',
            body: [{
                type: 'table',
                rows: [{
                    type: 'row',
                    cells: [
                        { type: 'cell', children: [paragraphOf('left')] },
                        { type: 'cell', children: [paragraphOf('right')] }
                    ]
                }]
            }]
        };
        const back = headers.parse(headers.serialize(obj), 'footer');
        expect(back.type).toBe('footer');
        expect(back.body[0].type).toBe('table');
    });
});
