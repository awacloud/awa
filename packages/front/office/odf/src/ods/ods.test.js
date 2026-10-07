// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { pkgMimetype } from '../pkg/mimetype.js';
import { pkgManifest } from '../pkg/manifest.js';
import { pkgPackage } from '../pkg/package.js';
import { odfMeta } from '../meta/meta.js';
import { odfSettings } from '../settings/settings.js';
import { odfStyles } from '../style/styles.js';
import { textParagraph } from '../text/paragraph.js';
import { tableCell } from '../table/cell.js';
import { tableRow } from '../table/row.js';
import { tableTable } from '../table/table.js';
import { styleAutomatic } from '../style/automaticStyles.js';
import { spreadsheet } from './spreadsheet.js';
import { ods } from './ods.js';
import { odsWalker } from './ods-walker.js';
import { odfWalker } from '../_shared/walker.js';
import { odfShared } from '../_shared/index.js';
import { odfErrors } from '../errors.js';

const runtime = new ModuleRuntime();
for (const m of [bitstream, huffman, lz77, deflate, crc32, zip,
                 fwXml, odfErrors, odfShared, odfWalker, pkgMimetype, pkgManifest, pkgPackage,
                 odfMeta, odfSettings, odfStyles,
                 textParagraph,
                 tableCell, tableRow, tableTable,
                 styleAutomatic, spreadsheet, odsWalker, ods]) {
    runtime.register(m);
}
const o = runtime.resolve('ods');
const { ParseError, ContractError } = runtime.resolve('odfErrors');

describe('ods module', () => {
    test('factory shape', () => {
        expect(ods.name).toBe('ods');
        expect(ods.dependencies).toContain('pkgPackage');
        expect(ods.dependencies).toContain('spreadsheet');
        expect(typeof ods.factory).toBe('function');
    });

    describe('empty', () => {
        test('produces a single empty sheet', () => {
            const d = o.empty();
            expect(d.spreadsheet.tables).toHaveLength(1);
            expect(d.spreadsheet.tables[0].name).toBe('Sheet1');
        });
    });

    describe('helpers', () => {
        test('cell coerces primitives', () => {
            expect(o.cell(42).valueType).toBe('float');
            expect(o.cell(42).value).toBe('42');
            expect(o.cell('hi').valueType).toBe('string');
            expect(o.cell(true).valueType).toBe('boolean');
            expect(o.cell(new Date('2026-05-13')).valueType).toBe('date');
            expect(o.cell({ type: 'cell', value: 'x', children: [] }).value).toBe('x');
        });

        test('sheet builds from a 2-D array', () => {
            const s = o.sheet('Foo', [[1, 2], ['a', 'b']]);
            expect(s.name).toBe('Foo');
            expect(s.rows).toHaveLength(2);
            expect(s.rows[0].cells[0].valueType).toBe('float');
        });

        test('fromArrays composes multi-sheet doc', () => {
            const d = o.fromArrays([
                { name: 'A', rows: [[1, 2]] },
                { name: 'B', rows: [['x']] }
            ]);
            expect(d.spreadsheet.tables).toHaveLength(2);
        });
    });

    describe('write + read roundtrip', () => {
        test('one sheet, basic cells', () => {
            const doc = { spreadsheet: { tables: [o.sheet('Sheet1', [[1, 2], [3, 4]])] } };
            const bytes = o.write(doc);
            expect(bytes).toBeInstanceOf(Uint8Array);
            const back = o.read(bytes);
            expect(back.mimetype).toBe(o.CT_ODS);
            expect(back.spreadsheet.tables).toHaveLength(1);
            expect(back.spreadsheet.tables[0].rows).toHaveLength(2);
            expect(back.spreadsheet.tables[0].rows[0].cells[0].value).toBe('1');
        });

        test('formula cell roundtrips', () => {
            const doc = {
                spreadsheet: { tables: [{
                    type: 'table', name: 'S', columns: [], rows: [
                        { type: 'row', cells: [o.cell(1), o.cell(2), o.cell(3),
                            { type: 'cell', valueType: 'float', value: '6',
                              formula: 'of:=SUM(A1:A3)', children: [] }] }
                    ]
                }] }
            };
            const back = o.read(o.write(doc));
            const last = back.spreadsheet.tables[0].rows[0].cells[3];
            expect(last.formula).toBe('of:=SUM(A1:A3)');
        });
    });

    describe('read errors', () => {
        test('throws on wrong mimetype', () => {
            const pkg = runtime.resolve('pkgPackage');
            const mimetype = runtime.resolve('pkgMimetype');
            const p = pkg.empty(mimetype.CT_ODT);
            pkg.setPart(p, 'content.xml', new TextEncoder().encode('<x/>'), 'text/xml');
            expect(() => o.read(pkg.write(p))).toThrow(/mimetype/);
        });

        test('throws on missing content.xml', () => {
            const pkg = runtime.resolve('pkgPackage');
            const mimetype = runtime.resolve('pkgMimetype');
            const p = pkg.empty(mimetype.CT_ODS);
            expect(() => o.read(pkg.write(p))).toThrow(/content\.xml/);
        });

        test('write(undefined) throws ContractError', () => {
            expect(() => o.write(undefined)).toThrow(ContractError);
        });

        // unused-import guard
        test('ParseError is a class', () => { expect(typeof ParseError).toBe('function'); });
    });

    describe('toText', () => {
        test('joins cells / rows', () => {
            const doc = o.fromArrays([{ name: 'S', rows: [['a', 'b'], ['c', 'd']] }]);
            expect(o.toText(doc)).toBe('a\tb\nc\td');
        });
    });
});

describe('ods — meta:generator on write', () => {
    const sample = () => o.fromArrays([{ name: 'S', rows: [['a']] }]);

    test('an opts.meta without a generator gets @awacloud/odf', () => {
        const meta = o.read(o.write(sample(), { meta: { title: 'T' } })).meta;
        expect(meta.title).toBe('T');
        expect(meta.generator).toBe('@awacloud/odf');
    });

    test('write(readDoc) replaces the read generator', () => {
        const readDoc = o.read(o.write(sample(), { meta: { title: 'T', generator: 'LibreOffice/24.2' } }));
        expect(readDoc.meta.generator).toBe('LibreOffice/24.2');
        const meta = o.read(o.write(readDoc)).meta;
        expect(meta.generator).toBe('@awacloud/odf');
        expect(meta.title).toBe('T');
    });

    test('an explicit opts.meta.generator is kept', () => {
        expect(o.read(o.write(sample(), { meta: { generator: 'MyApp/1' } })).meta.generator).toBe('MyApp/1');
    });
});

describe('ods — read(bytes, opts) forwards the zip caps', () => {
    const pkgInst = runtime.resolve('pkgPackage');
    const p = pkgInst.read(o.write(o.fromArrays([{ name: 'S', rows: [['a']] }])));
    pkgInst.setPart(p, 'Pictures/pad.bin', new Uint8Array(1024 * 1024));
    const padded = pkgInst.write(p);

    test('the default maxRatio rejects a 1 MiB zero pad', () => {
        let err = null;
        try { o.read(padded); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('odf/parse-error/zip-bomb');
        expect(err.context.limit).toBe('maxRatio');
    });

    test('maxRatio: 0 disables the check and the part is read', () => {
        const doc = o.read(padded, { maxRatio: 0 });
        expect(o.toText(doc)).toBe('a');
        expect(doc.package.parts['Pictures/pad.bin'].length).toBe(1024 * 1024);
    });
});
