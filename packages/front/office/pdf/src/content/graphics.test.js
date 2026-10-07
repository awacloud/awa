// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfGraphics } from './graphics.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const { obj } = pdfParserObj.factory();
const errMod = _pdfErrors_TD1;
const { ContractError } = errMod;
const { GStateStack, initialGState, mulCtm, applyOp } = pdfGraphics.factory(errMod);

const num = (v) => obj.int(v);

describe('initialGState', () => {
    test('identity CTM + sensible defaults', () => {
        const g = initialGState();
        expect(g.ctm).toEqual([1, 0, 0, 1, 0, 0]);
        expect(g.lineWidth).toBe(1.0);
        expect(g.text.scale).toBe(100);
        expect(g.text.font).toBe(null);
    });
});

describe('mulCtm', () => {
    test('identity is neutral', () => {
        const id = [1, 0, 0, 1, 0, 0];
        const m  = [2, 0, 0, 3, 10, 20];
        expect(mulCtm(id, m)).toEqual(m);
        expect(mulCtm(m, id)).toEqual(m);
    });

    test('translation composes', () => {
        const t1 = [1, 0, 0, 1, 10, 0];
        const t2 = [1, 0, 0, 1, 0, 20];
        expect(mulCtm(t1, t2)).toEqual([1, 0, 0, 1, 10, 20]);
    });
});

describe('GStateStack', () => {
    test('save / restore round-trip', () => {
        const s = new GStateStack();
        s.current().lineWidth = 5;
        s.save();
        s.current().lineWidth = 10;
        expect(s.current().lineWidth).toBe(10);
        s.restore();
        expect(s.current().lineWidth).toBe(5);
    });

    test('depth tracking', () => {
        const s = new GStateStack();
        expect(s.depth()).toBe(1);
        s.save(); s.save();
        expect(s.depth()).toBe(3);
        s.restore();
        expect(s.depth()).toBe(2);
    });

    test('restore beyond root throws', () => {
        expect(() => new GStateStack().restore()).toThrow(ContractError);
    });

    test('concatCtm composes', () => {
        const s = new GStateStack();
        s.concatCtm([2, 0, 0, 2, 0, 0]);
        s.concatCtm([1, 0, 0, 1, 10, 20]);
        // Translation applied first (since cm pre-concats), then scale.
        const c = s.current().ctm;
        expect(c[0]).toBe(2);
        expect(c[3]).toBe(2);
    });

    test('concatCtm rejects bad matrix', () => {
        const s = new GStateStack();
        expect(() => s.concatCtm([1, 2, 3])).toThrow(ContractError);
    });
});

describe('applyOp', () => {
    test('q / Q', () => {
        const s = new GStateStack();
        applyOp(s, { op: 'q', args: [] });
        expect(s.depth()).toBe(2);
        applyOp(s, { op: 'Q', args: [] });
        expect(s.depth()).toBe(1);
    });

    test('cm', () => {
        const s = new GStateStack();
        applyOp(s, { op: 'cm', args: [num(2), num(0), num(0), num(2), num(0), num(0)] });
        expect(s.current().ctm[0]).toBe(2);
    });

    test('w / J / j / M / i', () => {
        const s = new GStateStack();
        applyOp(s, { op: 'w', args: [num(3)] });
        applyOp(s, { op: 'J', args: [num(1)] });
        applyOp(s, { op: 'j', args: [num(2)] });
        applyOp(s, { op: 'M', args: [obj.real(5.5)] });
        applyOp(s, { op: 'i', args: [obj.real(0.5)] });
        const c = s.current();
        expect(c.lineWidth).toBe(3);
        expect(c.lineCap).toBe(1);
        expect(c.lineJoin).toBe(2);
        expect(c.miterLimit).toBe(5.5);
        expect(c.flatness).toBe(0.5);
    });

    test('d (dash)', () => {
        const s = new GStateStack();
        applyOp(s, { op: 'd', args: [obj.array([num(3), num(2)]), num(0)] });
        expect(s.current().dash.array).toEqual([3, 2]);
    });

    test('ri', () => {
        const s = new GStateStack();
        applyOp(s, { op: 'ri', args: [obj.name('Perceptual')] });
        expect(s.current().renderingIntent).toBe('Perceptual');
    });

    test('unhandled op routed to handlers.unhandled', () => {
        const s = new GStateStack();
        let seen = null;
        applyOp(s, { op: 'rg', args: [num(1), num(0), num(0)] }, {
            unhandled: (o) => { seen = o; }
        });
        expect(seen.op).toBe('rg');
    });

    test('bad numeric arg throws', () => {
        const s = new GStateStack();
        expect(() => applyOp(s, { op: 'w', args: [obj.name('X')] }))
            .toThrow(ContractError);
    });
});

describe('pdfGraphics module', () => {
    test('module shape', () => {
        expect(pdfGraphics.name).toBe('pdfGraphics');
        expect(pdfGraphics.dependencies).toEqual(['pdfErrors']);
        expect(pdfGraphics.factory.toString()).toContain('function');
        const m = pdfGraphics.factory(_pdfErrors_TD1);
        expect(typeof m.createStack).toBe('function');
        expect(typeof m.applyOp).toBe('function');
        expect(typeof m.initialGState).toBe('function');
        expect(typeof m.mulCtm).toBe('function');
    });
});
