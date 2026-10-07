// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfColor } from './color.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfGraphics } from './graphics.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const errMod = _pdfErrors_TD1;
const { ContractError } = errMod;
const { obj } = pdfParserObj.factory();
const { initialGState } = pdfGraphics.factory(errMod);
const { applyColorOp } = pdfColor.factory(errMod);

const num = (v) => obj.real(v);

describe('applyColorOp — device spaces', () => {
    test('g sets non-stroking DeviceGray', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'g', args: [num(0.5)] });
        expect(g.fillColor).toEqual({ space: 'DeviceGray', components: [0.5] });
    });

    test('G sets stroking DeviceGray', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'G', args: [num(0.25)] });
        expect(g.strokeColor.space).toBe('DeviceGray');
    });

    test('rg / RG sets RGB', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'rg', args: [num(1), num(0), num(0)] });
        expect(g.fillColor.components).toEqual([1, 0, 0]);
        applyColorOp(g, { op: 'RG', args: [num(0), num(1), num(0)] });
        expect(g.strokeColor.components).toEqual([0, 1, 0]);
    });

    test('k / K sets CMYK', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'k', args: [num(0), num(1), num(0), num(0.5)] });
        expect(g.fillColor).toEqual({ space: 'DeviceCMYK', components: [0, 1, 0, 0.5] });
    });
});

describe('applyColorOp — color spaces', () => {
    test('cs sets fill color space + default components', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'cs', args: [obj.name('DeviceRGB')] });
        expect(g.fillColor.space).toBe('DeviceRGB');
        expect(g.fillColor.components).toEqual([0, 0, 0]);
    });

    test('CS sets stroke color space', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'CS', args: [obj.name('DeviceCMYK')] });
        expect(g.strokeColor.space).toBe('DeviceCMYK');
        expect(g.strokeColor.components).toEqual([0, 0, 0, 1]);
    });

    test('cs with custom space defaults to empty components', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'cs', args: [obj.name('CS1')] });
        expect(g.fillColor.space).toBe('CS1');
        expect(g.fillColor.components).toEqual([]);
    });
});

describe('applyColorOp — sc / scn', () => {
    test('sc / SC set components', () => {
        const g = initialGState();
        applyColorOp(g, { op: 'sc', args: [num(0.1), num(0.2), num(0.3)] });
        expect(g.fillColor.components).toEqual([0.1, 0.2, 0.3]);
        applyColorOp(g, { op: 'SC', args: [num(1)] });
        expect(g.strokeColor.components).toEqual([1]);
    });

    test('scn with trailing pattern name', () => {
        const g = initialGState();
        applyColorOp(g, {
            op: 'scn',
            args: [num(0.5), obj.name('P1')]
        });
        expect(g.fillColor.pattern).toBe('P1');
        expect(g.fillColor.components).toEqual([0.5]);
    });

    test('scn without pattern drops previous pattern', () => {
        const g = initialGState();
        g.fillColor.pattern = 'OLD';
        applyColorOp(g, { op: 'scn', args: [num(0.5)] });
        expect(g.fillColor.pattern).toBeUndefined();
    });
});

describe('applyColorOp — errors', () => {
    test('non-numeric arg for g', () => {
        const g = initialGState();
        expect(() => applyColorOp(g, { op: 'g', args: [obj.name('X')] }))
            .toThrow(ContractError);
    });

    test('short args for rg', () => {
        const g = initialGState();
        expect(() => applyColorOp(g, { op: 'rg', args: [num(1), num(0)] }))
            .toThrow(ContractError);
    });

    test('non-color op rejected', () => {
        const g = initialGState();
        expect(() => applyColorOp(g, { op: 'Tj', args: [] }))
            .toThrow(ContractError);
    });

    test('cs with non-name', () => {
        const g = initialGState();
        expect(() => applyColorOp(g, { op: 'cs', args: [num(1)] }))
            .toThrow(ContractError);
    });
});

describe('pdfColor module', () => {
    test('module shape', () => {
        expect(pdfColor.name).toBe('pdfColor');
        expect(pdfColor.dependencies).toEqual(['pdfErrors']);
        expect(pdfColor.factory.toString()).toContain('function');
        const m = pdfColor.factory(_pdfErrors_TD1);
        expect(typeof m.applyColorOp).toBe('function');
    });
});
