// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { xlsxComments } from './comments.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const comments = xlsxComments.factory(_errors, xml, _shared);

describe('xlsxComments — standalone', () => {
    test('roundtrip simple plain-text comment', () => {
        const obj = {
            authors: ['Alice'],
            comments: [
                { ref: 'A1', authorId: 0, author: 'Alice',
                  richText: [{ text: 'Hello' }] }
            ]
        };
        const back = comments.parse(comments.serialize(obj));
        expect(back.authors).toEqual(['Alice']);
        expect(back.comments[0].ref).toBe('A1');
        expect(back.comments[0].author).toBe('Alice');
        expect(back.comments[0].richText[0].text).toBe('Hello');
    });

    test('rich text with run properties roundtrips', () => {
        const obj = {
            authors: ['Bob'],
            comments: [{
                ref: 'B2', author: 'Bob',
                richText: [
                    { text: 'Bold:', rPr: { bold: true, size: 9,
                                            font: 'Tahoma',
                                            color: { indexed: 81 } } },
                    { text: ' rest' }
                ]
            }]
        };
        const back = comments.parse(comments.serialize(obj));
        const r0 = back.comments[0].richText[0];
        expect(r0.rPr.bold).toBe(true);
        expect(r0.rPr.size).toBe(9);
        expect(r0.rPr.font).toBe('Tahoma');
        expect(r0.rPr.color.indexed).toBe(81);
        expect(back.comments[0].richText[1].text).toBe(' rest');
    });

    test('serialize auto-interns authors when comment.author is given', () => {
        const obj = {
            authors: [],
            comments: [
                { ref: 'A1', author: 'Carol', text: 'note 1' },
                { ref: 'B2', author: 'Dan',   text: 'note 2' },
                { ref: 'C3', author: 'Carol', text: 'note 3' }
            ]
        };
        const back = comments.parse(comments.serialize(obj));
        expect(back.authors).toEqual(['Carol', 'Dan']);
        expect(back.comments[0].author).toBe('Carol');
        expect(back.comments[1].author).toBe('Dan');
        expect(back.comments[2].author).toBe('Carol');
    });

    test('text shorthand is preserved as a single run', () => {
        const obj = {
            authors: ['X'],
            comments: [{ ref: 'A1', author: 'X', text: 'plain' }]
        };
        const back = comments.parse(comments.serialize(obj));
        expect(back.comments[0].richText).toEqual([{ text: 'plain' }]);
    });
});

describe('xlsxComments — VML drawing', () => {
    test('vmlForComments emits one v:shape per cell', () => {
        const vml = comments.vmlForComments([
            { col: 0, row: 0 }, { col: 2, row: 5 }
        ]);
        expect(vml).toContain('<v:shapetype id="_x0000_t202"');
        expect(vml).toContain('id="_x0000_s1025"');
        expect(vml).toContain('id="_x0000_s1026"');
        expect(vml).toContain('<x:Row>0</x:Row>');
        expect(vml).toContain('<x:Row>5</x:Row>');
        expect(vml).toContain('<x:ClientData ObjectType="Note">');
    });
});
