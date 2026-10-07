// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { extraJstf } from './jstf.js';
import { testRuntime } from './_test-runtime.js';
const { parseJstf } = testRuntime.resolve('extraJstf');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { BinaryReader } = testRuntime.resolve('fontReader');
const { untag } = testRuntime.resolve('fontTag');
const { ParseError } = testRuntime.resolve('fontErrors');

function buildJstf(scripts) {
    // scripts: [{ tag: 'latn', langSys: [{ tag: 'ENG ', priorityBlob: Uint8Array }] }, ...]
    const headerSize = 6 + scripts.length * 6;
    // Plan each script sub-table layout
    const planned = [];
    let cursor = headerSize;
    for (const s of scripts) {
        const scriptOffset = cursor;
        const scriptHeader = 6 + s.langSys.length * 6;
        // langSys priority blobs come after the langSys records, relative to scriptOffset
        const langSysAbs = [];
        let scriptCursor = scriptHeader;
        for (const ls of s.langSys) {
            langSysAbs.push({ blobOffsetInScript: scriptCursor, blob: ls.priorityBlob });
            scriptCursor += ls.priorityBlob.length;
        }
        planned.push({ scriptOffset, scriptCursor, langSysAbs });
        cursor += scriptCursor;
    }

    const w = new BinaryWriter(cursor);
    w.writeUint16(1).writeUint16(0);
    w.writeUint16(scripts.length);
    for (let i = 0; i < scripts.length; i++) {
        w.writeTag(scripts[i].tag);
        w.writeUint16(planned[i].scriptOffset);
    }
    for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i];
        const p = planned[i];
        w.writeUint16(0);                // extenderGlyphOffset
        w.writeUint16(0);                // defaultLangSysOffset
        w.writeUint16(s.langSys.length); // langSysCount
        for (let j = 0; j < s.langSys.length; j++) {
            w.writeTag(s.langSys[j].tag);
            w.writeUint16(p.langSysAbs[j].blobOffsetInScript);
        }
        for (const ls of p.langSysAbs) {
            w.writeBytes(ls.blob);
        }
    }
    return w.finalize();
}

describe('extraJstf', () => {
    test('module metadata', () => {
        expect(extraJstf.name).toBe('extraJstf');
        expect(extraJstf.dependencies).toEqual(['fontErrors', 'fontReader', 'fontTag']);
    });

    test('parses empty JSTF (scriptCount = 0)', () => {
        const bytes = buildJstf([]);
        const j = parseJstf(bytes);
        expect(j.majorVersion).toBe(1);
        expect(j.scriptCount).toBe(0);
        expect(j.scripts).toEqual([]);
    });

    test('parses a single script with one langSys', () => {
        const bytes = buildJstf([
            { tag: 'latn', langSys: [{ tag: 'ENG ', priorityBlob: new Uint8Array([1, 2, 3, 4]) }] }
        ]);
        const j = parseJstf(bytes);
        expect(j.scriptCount).toBe(1);
        expect(j.scripts[0].tagStr).toBe('latn');
        expect(j.scripts[0].langSysCount).toBe(1);
        expect(j.scripts[0].langSysRecords[0].tagStr).toBe('ENG ');
        expect(j.scripts[0].langSysRecords[0].bytes[0]).toBe(1);
    });

    test('parses multiple scripts preserving order', () => {
        const bytes = buildJstf([
            { tag: 'latn', langSys: [] },
            { tag: 'arab', langSys: [{ tag: 'URD ', priorityBlob: new Uint8Array([9]) }] }
        ]);
        const j = parseJstf(bytes);
        expect(j.scripts.map(s => s.tagStr)).toEqual(['latn', 'arab']);
        expect(j.scripts[1].langSysRecords[0].tagStr).toBe('URD ');
    });

    test('factory exposes parseJstf', () => {
        const mod = extraJstf.factory(testRuntime.resolve('fontErrors'), { BinaryReader }, { untag });
        expect(typeof mod.parseJstf).toBe('function');
    });

    test('rejects short input', () => {
        expect(() => parseJstf(new Uint8Array(3))).toThrow(ParseError);
    });

    test('rejects unsupported version', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0).writeUint16(0);
        expect(() => parseJstf(w.finalize())).toThrow(ParseError);
    });

    test('rejects non-Uint8Array input', () => {
        expect(() => parseJstf(null)).toThrow(ParseError);
    });
});
