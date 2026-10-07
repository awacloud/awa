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
import { textHeading } from '../text/heading.js';
import { textList } from '../text/list.js';
import { textSection } from '../text/section.js';
import { textContent } from '../text/content.js';
import { tableCell } from '../table/cell.js';
import { tableRow } from '../table/row.js';
import { tableTable } from '../table/table.js';
import { drawImage } from '../draw/image.js';
import { drawFrame } from '../draw/frame.js';
import { styleAutomatic } from '../style/automaticStyles.js';
import { styleMasterPage } from '../style/masterPage.js';
import { slide } from './slide.js';
import { presentationStyle } from './presentationStyle.js';
import { odp } from './odp.js';
import { odpWalker } from './odp-walker.js';
import { odfWalker } from '../_shared/walker.js';
import { odfShared } from '../_shared/index.js';
import { odfErrors } from '../errors.js';

const runtime = new ModuleRuntime();
for (const m of [bitstream, huffman, lz77, deflate, crc32, zip,
                 fwXml, odfErrors, odfShared, odfWalker, pkgMimetype, pkgManifest, pkgPackage,
                 odfMeta, odfSettings, odfStyles,
                 textParagraph, textHeading, textList, textSection,
                 tableCell, tableRow, tableTable, textContent,
                 drawImage, drawFrame,
                 styleAutomatic, styleMasterPage,
                 slide, presentationStyle, odpWalker, odp]) {
    runtime.register(m);
}
const o = runtime.resolve('odp');
const { ParseError, ContractError } = runtime.resolve('odfErrors');

describe('odp module', () => {
    test('factory shape', () => {
        expect(odp.name).toBe('odp');
        expect(odp.dependencies).toContain('pkgPackage');
        expect(odp.dependencies).toContain('slide');
        expect(typeof odp.factory).toBe('function');
    });

    describe('empty', () => {
        test('produces a single empty slide', () => {
            const d = o.empty();
            expect(d.slides).toHaveLength(1);
            expect(d.slides[0].name).toBe('Slide1');
        });
    });

    describe('helpers', () => {
        test('slide builder', () => {
            const s = o.slide('S1', { masterPageName: 'Default', layoutName: 'AL1' });
            expect(s.type).toBe('slide');
            expect(s.masterPageName).toBe('Default');
            expect(s.layoutName).toBe('AL1');
        });

        test('fromSlides', () => {
            const d = o.fromSlides([o.slide('A'), o.slide('B')]);
            expect(d.slides).toHaveLength(2);
            expect(d.slides[1].name).toBe('B');
        });

        test('toText: slide names are identifiers, not text', () => {
            expect(o.toText(o.fromSlides([o.slide('A'), o.slide('B')]))).toBe('');
        });
    });

    describe('toText', () => {
        const xml = runtime.resolve('xml');
        const para = runtime.resolve('textParagraph');
        const p = t => para.renderParagraph(para.paragraph(t));
        const textSlide = (name, kids, opts) => o.slide(name, {
            ...opts,
            frames: [{ type: 'frame', name: 'f', child: { kind: 'text-box', children: kids, attrs: {} } }]
        });
        const deck = () => o.fromSlides([
            textSlide('Intro', [p('Title')]),
            { ...textSlide('Body', [p('First'), p('Second')]),
              notes: { body: [p('Speaker note.')] } },
            o.slide('Empty')
        ]);

        test('title, body and an empty slide: blank-line separated, no separator for the empty one', () => {
            expect(o.toText(deck())).toBe('Title\n\nFirst\nSecond');
        });

        test('{ notes: true } appends the speaker notes as the slide last line', () => {
            expect(o.toText(deck(), { notes: true })).toBe('Title\n\nFirst\nSecond\nSpeaker note.');
        });

        test('placeholders are not text', () => {
            const ph = xml.el('presentation:placeholder', { 'presentation:object': 'title' }, []);
            expect(o.toText(o.fromSlides([textSlide('S', [p('Hi'), ph])]))).toBe('Hi');
        });

        test('round-trip: toText(read(write(doc))) equals toText(doc)', () => {
            const doc = deck();
            const back = o.read(o.write(doc));
            expect(o.toText(back)).toBe(o.toText(doc));
            expect(o.toText(back)).toBe('Title\n\nFirst\nSecond');
            expect(o.toText(back, { notes: true })).toBe(o.toText(doc, { notes: true }));
        });

        test('a table held by a frame (raw extras) survives write + read and reaches toText', () => {
            const tbl = xml.parse('<table:table><table:table-row>'
                + '<table:table-cell><text:p>CellA</text:p></table:table-cell>'
                + '<table:table-cell><text:p>CellB</text:p></table:table-cell>'
                + '</table:table-row></table:table>');
            const doc = o.fromSlides([o.slide('T', {
                frames: [{ type: 'frame', name: 'tbl', _extras: { children: [tbl] } }]
            })]);
            expect(o.toText(doc)).toBe('CellA\nCellB');
            const back = o.read(o.write(doc));
            expect(o.toText(back)).toBe('CellA\nCellB');
        });

        test('undefined doc yields the empty string', () => {
            expect(o.toText(undefined)).toBe('');
            expect(o.toText({})).toBe('');
        });
    });

    describe('write + read roundtrip', () => {
        test('single empty slide', () => {
            const bytes = o.write(o.empty());
            const back = o.read(bytes);
            expect(back.mimetype).toBe(o.CT_ODP);
            expect(back.slides).toHaveLength(1);
            expect(back.slides[0].name).toBe('Slide1');
        });

        test('multi-slide names + master', () => {
            const doc = {
                slides: [
                    o.slide('Intro', { masterPageName: 'Default' }),
                    o.slide('Body',  { masterPageName: 'Default' }),
                    o.slide('Outro', { masterPageName: 'Default' })
                ]
            };
            const back = o.read(o.write(doc));
            expect(back.slides).toHaveLength(3);
            expect(back.slides.map(s => s.name)).toEqual(['Intro', 'Body', 'Outro']);
            expect(back.slides[0].masterPageName).toBe('Default');
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
            const p = pkg.empty(mimetype.CT_ODP);
            expect(() => o.read(pkg.write(p))).toThrow(/content\.xml/);
        });

        test('write(undefined) throws ContractError', () => {
            expect(() => o.write(undefined)).toThrow(ContractError);
        });

        test('ParseError class is reachable', () => {
            expect(typeof ParseError).toBe('function');
        });
    });
});

describe('odp — meta:generator on write', () => {
    test('an opts.meta without a generator gets @awacloud/odf', () => {
        const meta = o.read(o.write(o.empty(), { meta: { title: 'T' } })).meta;
        expect(meta.title).toBe('T');
        expect(meta.generator).toBe('@awacloud/odf');
    });

    test('write(readDoc) replaces the read generator', () => {
        const readDoc = o.read(o.write(o.empty(), { meta: { title: 'T', generator: 'LibreOffice/24.2' } }));
        expect(readDoc.meta.generator).toBe('LibreOffice/24.2');
        const meta = o.read(o.write(readDoc)).meta;
        expect(meta.generator).toBe('@awacloud/odf');
        expect(meta.title).toBe('T');
    });

    test('an explicit opts.meta.generator is kept', () => {
        expect(o.read(o.write(o.empty(), { meta: { generator: 'MyApp/1' } })).meta.generator).toBe('MyApp/1');
    });
});

describe('odp — read(bytes, opts) forwards the zip caps', () => {
    const pkgInst = runtime.resolve('pkgPackage');
    const p = pkgInst.read(o.write(o.fromSlides([o.slide('A'), o.slide('B')])));
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
        expect(doc.slides.map(s => s.name)).toEqual(['A', 'B']);
        expect(doc.package.parts['Pictures/pad.bin'].length).toBe(1024 * 1024);
    });
});
