// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { mathMathml } from './math-mathml.js';

const xml = fwXml.factory();
const ext = mathMathml.factory(xml);

describe('mathMathml', () => {
    test('contract', () => {
        expect(mathMathml.name).toBe('mathMathml');
        expect(mathMathml.dependencies).toEqual(['xml']);
        expect(ext.MATHML_NS).toBe('http://www.w3.org/1998/Math/MathML');
    });
    test('parse/render math:math preserves body verbatim', () => {
        const inner = xml.el('mrow', {}, [xml.el('mi', {}, [xml.text('x')])]);
        const el = xml.el('math:math', { 'xmlns:math': ext.MATHML_NS }, [inner]);
        const m = ext.parseMath(el);
        expect(m.type).toBe('mathml');
        expect(m.body).toHaveLength(1);
        const back = ext.renderMath(m);
        expect(back.name).toBe('math:math');
        expect(back.children[0].name).toBe('mrow');
    });
    test('manifestEntries default path', () => {
        const ents = ext.manifestEntries();
        expect(ents).toHaveLength(2);
        expect(ents[0].mediaType).toBe('application/vnd.oasis.opendocument.formula');
        expect(ents[1].fullPath).toBe('Object 1/content.xml');
    });
    test('manifestEntries custom path', () => {
        const ents = ext.manifestEntries({ path: 'Formula 7' });
        expect(ents[0].fullPath).toBe('Formula 7/');
    });
});
