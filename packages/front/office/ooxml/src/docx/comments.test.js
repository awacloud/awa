// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';
import { docxStructure } from './structure.js';
import { docxComments } from './comments.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const props = docxProperties.factory(xml);
const struct = docxStructure.factory(xml, props);
const comments = docxComments.factory(_errors, xml, struct, _shared);

function paragraphOf(text) {
    return {
        type: 'paragraph',
        children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
    };
}

describe('docxComments', () => {
    test('roundtrip with metadata and body', () => {
        const obj = {
            comments: [
                { id: 0, author: 'Alice', date: '2026-05-08T10:00:00Z',
                  initials: 'A', body: [paragraphOf('First note.')] },
                { id: 1, author: 'Bob', body: [paragraphOf('Second.')] }
            ]
        };
        const back = comments.parse(comments.serialize(obj));
        expect(back.comments).toHaveLength(2);
        expect(back.comments[0].author).toBe('Alice');
        expect(back.comments[0].initials).toBe('A');
        expect(back.comments[0].body[0].children[0].children[0].value)
            .toBe('First note.');
        expect(back.comments[1].body[0].children[0].children[0].value)
            .toBe('Second.');
    });
});
