// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — the DrawingML text model writes back what it reads (T62 (b)):
 * a run's and a paragraph's attributes beyond the typed ones, an
 * `a:latin`'s attributes beyond its typeface, a field's `a:pPr`, a text
 * body without `a:lstStyle`.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const dml = rt.resolve('drawingml');
const props = rt.resolve('docxProperties');

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const parse = (text) => xml.parse(text.replace(/^<a:(\w+)/, `<a:$1 ${NS}`));
const back = (text) => {
    const src = parse(text);
    // The namespace declaration of the test's root aside.
    return [dml.renderTextBody(dml.parseTextBody(src, {}), 'a:txBody'), { ...src, attrs: {} }];
};
const BODY = (inner, lst = '<a:lstStyle/>') => `<a:txBody><a:bodyPr/>${lst}${inner}</a:txBody>`;

describe('DrawingML text: what a read keeps is written back', () => {
    test('a run\'s attributes beyond the typed ones', () => {
        const [got, want] = back(BODY('<a:p><a:r><a:rPr lang="en-US" dirty="0" smtClean="0" kern="1200" spc="-50" cap="all" altLang="fr-FR" err="1"/><a:t>x</a:t></a:r></a:p>'));
        expect(props.sameElement(got, want)).toBe(true);
        const rPr = dml.parseTextBody(want, {}).paragraphs[0].runs[0].rPr;
        expect(rPr.lang).toBe('en-US');
        expect(rPr.extraAttrs).toEqual({ dirty: '0', smtClean: '0', kern: '1200', spc: '-50', cap: 'all', altLang: 'fr-FR', err: '1' });
    });
    test('a paragraph\'s defRPr and end properties keep theirs too', () => {
        const [got, want] = back(BODY('<a:p><a:pPr><a:defRPr kern="1200" sz="1800"/></a:pPr><a:r><a:t>x</a:t></a:r></a:p>'));
        expect(props.sameElement(got, want)).toBe(true);
    });
    test('an a:latin\'s attributes beyond its typeface', () => {
        const [got, want] = back(BODY('<a:p><a:r><a:rPr lang="en-US"><a:latin typeface="Calibri" panose="020F0502020204030204" pitchFamily="34" charset="0"/></a:rPr><a:t>x</a:t></a:r></a:p>'));
        expect(props.sameElement(got, want)).toBe(true);
        const rPr = dml.parseTextBody(want, {}).paragraphs[0].runs[0].rPr;
        expect([rPr.font, rPr.fontAttrs]).toEqual(['Calibri', { panose: '020F0502020204030204', pitchFamily: '34', charset: '0' }]);
    });
    test('a paragraph\'s attributes beyond the typed ones', () => {
        const [got, want] = back(BODY('<a:p><a:pPr marL="0" algn="l" marR="0" rtl="0" eaLnBrk="1" fontAlgn="auto" hangingPunct="1" defTabSz="914400"/><a:r><a:t>x</a:t></a:r></a:p>'));
        expect(props.sameElement(got, want)).toBe(true);
        const pPr = dml.parseTextBody(want, {}).paragraphs[0].pPr;
        expect(pPr.extraAttrs).toEqual({ marR: '0', rtl: '0', eaLnBrk: '1', fontAlgn: 'auto', hangingPunct: '1', defTabSz: '914400' });
    });
    test('a field\'s a:pPr, between its a:rPr and its a:t', () => {
        const [got, want] = back(BODY('<a:p><a:fld id="{A}" type="slidenum"><a:rPr lang="en-US"/><a:pPr algn="r"/><a:t>3</a:t></a:fld></a:p>'));
        expect(props.sameElement(got, want)).toBe(true);
        expect(dml.parseTextBody(want, {}).paragraphs[0].runs[0].pPr).toEqual({ align: 'r' });
    });
    test('an auto-numbered bullet\'s start', () => {
        const [got, want] = back(BODY('<a:p><a:pPr marL="342900" indent="-342900"><a:buAutoNum type="arabicPeriod" startAt="3"/></a:pPr><a:r><a:t>x</a:t></a:r></a:p>'));
        expect(props.sameElement(got, want)).toBe(true);
        expect(dml.parseTextBody(want, {}).paragraphs[0].pPr.bullet).toEqual({ autoNumType: 'arabicPeriod', startAt: 3 });
    });
    test('a text body read without a:lstStyle is written without one', () => {
        const [got, want] = back(BODY('<a:p><a:r><a:t>x</a:t></a:r></a:p>', ''));
        expect(props.sameElement(got, want)).toBe(true);
        expect(dml.parseTextBody(want, {}).lstStyle).toBeNull();
    });
    test('a text body built without the field is still written with an empty a:lstStyle', () => {
        const el = dml.renderTextBody({ paragraphs: [{ runs: [{ type: 'text', value: 'x' }] }] }, 'a:txBody');
        expect(el.children.filter((c) => c.type === 'element').map((c) => c.name)).toEqual(['a:bodyPr', 'a:lstStyle', 'a:p']);
    });
});
