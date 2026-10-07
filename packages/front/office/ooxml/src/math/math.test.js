// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlMath } from './math.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
const _errors = _ooxmlErrors.factory();

const xml = ooxmlXml.factory();
const m = ooxmlMath.factory(_errors, xml);

function roundtrip(node) {
    const xmlNode = m.renderMathElement(node);
    return m.parseMathElement(xmlNode);
}

describe('ooxmlMath — math run', () => {
    test('roundtrip plain text', () => {
        const r = m.r('hello');
        expect(roundtrip(r)).toEqual(r);
    });

    test('with style', () => {
        const r = m.r('A', 'b');
        const back = roundtrip(r);
        expect(back.text).toBe('A');
        expect(back.rPr.sty).toBe('b');
    });
});

describe('ooxmlMath — fraction', () => {
    test('simple a/b', () => {
        const f = m.frac(m.r('a'), m.r('b'));
        const back = roundtrip(f);
        expect(back.type).toBe('frac');
        expect(back.numerator).toHaveLength(1);
        expect(back.numerator[0].text).toBe('a');
        expect(back.denominator[0].text).toBe('b');
    });

    test('nested fraction in numerator', () => {
        const inner = m.frac(m.r('1'), m.r('2'));
        const outer = m.frac(inner, m.r('x'));
        const back = roundtrip(outer);
        expect(back.numerator[0].type).toBe('frac');
        expect(back.numerator[0].numerator[0].text).toBe('1');
        expect(back.denominator[0].text).toBe('x');
    });
});

describe('ooxmlMath — superscript / subscript', () => {
    test('x²', () => {
        const e = m.sup(m.r('x'), m.r('2'));
        const back = roundtrip(e);
        expect(back.type).toBe('sSup');
        expect(back.base[0].text).toBe('x');
        expect(back.sup[0].text).toBe('2');
    });

    test('a_n', () => {
        const e = m.sub(m.r('a'), m.r('n'));
        const back = roundtrip(e);
        expect(back.type).toBe('sSub');
        expect(back.base[0].text).toBe('a');
        expect(back.sub[0].text).toBe('n');
    });

    test('x_i^2', () => {
        const e = m.subSup(m.r('x'), m.r('i'), m.r('2'));
        const back = roundtrip(e);
        expect(back.type).toBe('sSubSup');
        expect(back.base[0].text).toBe('x');
        expect(back.sub[0].text).toBe('i');
        expect(back.sup[0].text).toBe('2');
    });
});

describe('ooxmlMath — radical', () => {
    test('square root', () => {
        const e = m.rad(m.r('x'));
        const back = roundtrip(e);
        expect(back.type).toBe('rad');
        expect(back.degree).toEqual([]);
        expect(back.base[0].text).toBe('x');
    });

    test('cube root', () => {
        const e = m.rad(m.r('x'), m.r('3'));
        const back = roundtrip(e);
        expect(back.degree[0].text).toBe('3');
        expect(back.base[0].text).toBe('x');
    });
});

describe('ooxmlMath — n-ary operator', () => {
    test('sum from i=1 to n of x_i', () => {
        const e = m.nary('∑',
            [m.r('i'), m.r('='), m.r('1')],
            m.r('n'),
            m.sub(m.r('x'), m.r('i')));
        const back = roundtrip(e);
        expect(back.type).toBe('nary');
        expect(back.op).toBe('∑');
        expect(back.sub.map(n => n.text || '').join('')).toBe('i=1');
        expect(back.sup[0].text).toBe('n');
        expect(back.body[0].type).toBe('sSub');
    });

    test('integral with character', () => {
        const e = m.nary('∫', m.r('a'), m.r('b'), m.r('f(x)dx'));
        const back = roundtrip(e);
        expect(back.op).toBe('∫');
    });
});

describe('ooxmlMath — delimiters', () => {
    test('parentheses with one slot', () => {
        const e = m.delim(m.frac(m.r('a'), m.r('b')),
                          { open: '(', close: ')' });
        const back = roundtrip(e);
        expect(back.type).toBe('d');
        expect(back.open).toBe('(');
        expect(back.close).toBe(')');
        expect(back.children).toHaveLength(1);
        expect(back.children[0][0].type).toBe('frac');
    });

    test('brackets with separator (multi-slot tuple)', () => {
        const e = m.delim(
            [[m.r('a')], [m.r('b')], [m.r('c')]],
            { open: '[', close: ']', sep: ',' });
        const back = roundtrip(e);
        expect(back.children).toHaveLength(3);
        expect(back.sep).toBe(',');
    });
});

describe('ooxmlMath — function', () => {
    test('sin(x)', () => {
        const e = m.func(m.r('sin'), m.r('x'));
        const back = roundtrip(e);
        expect(back.type).toBe('func');
        expect(back.name[0].text).toBe('sin');
        expect(back.body[0].text).toBe('x');
    });
});

describe('ooxmlMath — matrix', () => {
    test('2x2 matrix', () => {
        const e = m.matrix([
            [m.r('1'), m.r('0')],
            [m.r('0'), m.r('1')]
        ]);
        const back = roundtrip(e);
        expect(back.type).toBe('m');
        expect(back.rows).toHaveLength(2);
        expect(back.rows[0]).toHaveLength(2);
        expect(back.rows[0][0][0].text).toBe('1');
        expect(back.rows[1][1][0].text).toBe('1');
    });
});

describe('ooxmlMath — top-level oMath', () => {
    test('compose multiple elements', () => {
        const eq = m.oMath(
            m.r('y'), m.r(' = '), m.frac(m.r('a'), m.r('b'))
        );
        const xmlNode = m.renderOMath(eq);
        const back = m.parseOMath(xmlNode);
        expect(back.type).toBe('oMath');
        expect(back.children).toHaveLength(3);
        expect(back.children[0].text).toBe('y');
        expect(back.children[2].type).toBe('frac');
    });
});

describe('ooxmlMath — block math (oMathPara)', () => {
    test('roundtrip', () => {
        const para = m.oMathPara(
            m.oMath(m.subSup(m.r('e'), m.r('iπ'), m.r('')), m.r(' + 1 = 0'))
        );
        const xmlNode = m.renderOMathPara(para);
        const back = m.parseOMathPara(xmlNode);
        expect(back.type).toBe('oMathPara');
        expect(back.children).toHaveLength(1);
        expect(back.children[0].type).toBe('oMath');
    });
});
