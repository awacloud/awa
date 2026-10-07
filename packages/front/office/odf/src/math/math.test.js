// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mathMath } from './math.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    const m = mathMath.factory(errors, shared, xml);
    return { xml, m };
}

describe('mathMath module', () => {
    test('factory shape', () => {
        expect(mathMath.name).toBe('mathMath');
        expect(mathMath.dependencies).toEqual(['odfErrors', 'odfShared', 'xml']);
    });

    test('parseMath stores fragment opaquely', () => {
        const { xml, m } = build();
        const el = xml.parse('<math:math><math:mrow><math:mi>x</math:mi></math:mrow></math:math>');
        const model = m.parseMath(el);
        expect(model.type).toBe('math');
        expect(model.xml.name).toBe('math:math');
    });

    test('renderMath returns the stored element', () => {
        const { xml, m } = build();
        const el = xml.parse('<math:math><math:mn>42</math:mn></math:math>');
        const model = m.parseMath(el);
        const out = xml.serialize(m.renderMath(model));
        expect(out).toContain('<math:mn>42</math:mn>');
    });

    test('bytesOf + parseBytes roundtrip', () => {
        const { xml, m } = build();
        const el = xml.parse('<math:math><math:mi>y</math:mi></math:math>');
        const model = m.parseMath(el);
        const bytes = m.bytesOf(model);
        const back = m.parseBytes(bytes);
        expect(back.xml.name).toBe('math:math');
        const ser = xml.serialize(back.xml);
        expect(ser).toContain('<math:mi>y</math:mi>');
    });
});

describe('mathMath — bytesOf namespace declarations', () => {
    const MATHML = 'http://www.w3.org/1998/Math/MathML';

    test('the empty fallback is written with xmlns:math', () => {
        const { xml, m } = build();
        const fallback = m.parseBytes('<office:document-content xmlns:office="u"/>');
        const root = xml.parse(new TextDecoder().decode(m.bytesOf(fallback)));
        expect(root.name).toBe('math:math');
        expect(root.attrs).toEqual({ 'xmlns:math': MATHML });
        expect(xml.parse(new TextDecoder().decode(m.bytesOf(null))).attrs).toEqual({ 'xmlns:math': MATHML });
    });

    test('a root that declares its own prefix is written unchanged and the model is not mutated', () => {
        const { xml, m } = build();
        const el = xml.parse('<math:math xmlns:math="urn:own"><math:mi>y</math:mi></math:math>');
        const text = new TextDecoder().decode(m.bytesOf(m.parseMath(el)));
        expect(text.endsWith('<math:math xmlns:math="urn:own"><math:mi>y</math:mi></math:math>')).toBe(true);
        const bare = xml.parse('<math:math><math:mi>y</math:mi></math:math>');
        const model = m.parseMath(bare);
        m.bytesOf(model);
        expect(model.xml.attrs).toEqual({});
    });
});
