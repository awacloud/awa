// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fontErrors } from '../errors.js';
import { cmapCid } from './cid.js';

const rt = new ModuleRuntime();
rt.register(fontErrors);
rt.register(cmapCid);
const { ParseError } = rt.resolve('fontErrors');
const { parseCidCMap, chain, cidOf } = rt.resolve('cmapCid');

const CMAP = `%!PS-Adobe-3.0 Resource-CMap
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo 3 dict dup begin /Registry (Adobe) def /Ordering (Korea1) def /Supplement 2 def end def
/CMapName /Test-H def
/WMode 0 def
2 begincodespacerange
  <00> <7F>
  <8140> <FEFE>
endcodespacerange
1 begincidrange
<8140> <817F> 100
endcidrange
2 begincidchar
<41> 7
<8150> 9
endcidchar
1 beginnotdefrange
<00> <1F> 1
endnotdefrange
endcmap
CMapName currentdict /CMap defineresource pop
end end`;

describe('cmapCid', () => {
    test('module metadata', () => {
        expect(cmapCid.name).toBe('cmapCid');
        expect(cmapCid.dependencies).toEqual(['fontErrors']);
    });

    test('the codespace, its byte lengths, the name and the writing mode', () => {
        const m = parseCidCMap(CMAP);
        expect(m.name).toBe('Test-H');
        expect(m.wMode).toBe(0);
        expect(m.useCMap).toBeNull();
        expect(m.codespace).toEqual([{ bytes: 1, low: 0x00, high: 0x7F }, { bytes: 2, low: 0x8140, high: 0xFEFE }]);
    });

    test('a cidrange and a cidchar; the later definition wins', () => {
        const m = parseCidCMap(CMAP);
        expect(cidOf(m, 0x8140, 2)).toBe(100);
        expect(cidOf(m, 0x8141, 2)).toBe(101);
        expect(cidOf(m, 0x8150, 2)).toBe(9);
        expect(cidOf(m, 0x41, 1)).toBe(7);
    });

    test('a notdef range when no range holds the code; else null', () => {
        const m = parseCidCMap(CMAP);
        expect(cidOf(m, 0x05, 1)).toBe(1);
        expect(cidOf(m, 0x60, 1)).toBeNull();
        expect(cidOf(m, 0x8180, 2)).toBeNull();
        expect(cidOf(m, 0x41, 2)).toBeNull(); // the byte length is part of the code
    });

    test('usecmap names the parent; chain puts it under the child', () => {
        const child = parseCidCMap('/Parent-H usecmap\n1 begincidchar <8140> 2 endcidchar');
        expect(child.useCMap).toBe('Parent-H');
        const parent = parseCidCMap('1 begincodespacerange <8140> <FEFE> endcodespacerange\n1 begincidrange <8140> <8142> 50 endcidrange');
        const both = chain(parent, child);
        expect(cidOf(both, 0x8140, 2)).toBe(2);
        expect(cidOf(both, 0x8141, 2)).toBe(51);
        expect(both.codespace).toEqual([{ bytes: 2, low: 0x8140, high: 0xFEFE }]);
    });

    test('an unknown operator is skipped; an odd hex string is a ParseError', () => {
        expect(cidOf(parseCidCMap('/XUID [1 2] def 1 begincidchar <0001> 3 endcidchar'), 1, 2)).toBe(3);
        expect(() => parseCidCMap('1 begincidchar <001> 3 endcidchar')).toThrow(ParseError);
        expect(() => parseCidCMap(42)).toThrow();
    });
});
